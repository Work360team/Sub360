// render — วางซับลงบนวิดีโอต้นฉบับ ใช้เสียงเดิม
//
// ต่างจาก Clip360 burnAndMux ที่ประกอบภาพจากหลายคลิปและใช้เสียงพากย์ ที่นี่ภาพและเสียง
// มาจากไฟล์เดียว จึงแค่ re-encode ภาพพร้อมซับ แล้วแปลงเสียงเป็น AAC ให้เล่นได้ทุกที่
import fs from "node:fs";
import path from "node:path";
import { ffmpeg, ffprobe } from "./lib.mjs";

export async function probe(file, opts = {}) {
  const { out } = await ffprobe([
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams", file,
  ], opts);
  const data = JSON.parse(out);
  const v = data.streams.find((s) => s.codec_type === "video");
  const a = data.streams.find((s) => s.codec_type === "audio");
  if (!v) throw new Error(`ไม่พบภาพใน ${path.basename(file)}`);
  const [num, den] = String(v.r_frame_rate || "30/1").split("/").map(Number);
  // วิดีโอจากมือถือมักบันทึกแนวนอนแล้วติดป้าย "หมุน 90°" ไว้ — ffmpeg หมุนให้ตอนถอดรหัส
  // ขนาดที่ซับต้องใช้จึงเป็นขนาดหลังหมุน
  const rotation = Math.abs(Number(v.side_data_list?.find((d) => d.rotation != null)?.rotation ?? v.tags?.rotate ?? 0)) % 180;
  const swap = rotation === 90;
  return {
    width: swap ? v.height : v.width,
    height: swap ? v.width : v.height,
    fps: den ? Math.min(60, num / den) : 30,
    hasAudio: Boolean(a),
    durationMs: Math.round(Number(data.format.duration) * 1000),
  };
}

/* ---------- วิดีโอ HDR ---------- */
// iPhone ถ่ายวิดีโอเป็น HDR (HLG + BT.2020 10-bit) โดยค่าเริ่มต้น มือถือบางรุ่นเป็น PQ/HDR10
// ซับเป็นสี RGB ธรรมดา (sRGB/BT.709) ถ้าวาดลงภาพ HDR ตรง ๆ ค่าสีจะถูกตีความในระบบสี HDR
// เหลือง #FFD400 ออกมาเป็นส้ม (วัดจริง: 255,212,0 → 252,124,0) ทั้งซับแบบเร็วและพรีเมียม
// จึงแปลงภาพเป็น SDR BT.709 ก่อนวางซับ — สีซับตรงกับที่เลือกและไฟล์เล่นได้สีเดียวกันทุกที่
//
// mobius: ส่วนที่อยู่ในช่วง SDR อยู่แทบเหมือนเดิม (คลาดเฉลี่ย ~4/255) แค่กดไฮไลต์ที่สว่างเกิน
// hable ที่คู่มือมักแนะนำทำทั้งภาพมืดลงชัดเจน (คลาด ~34/255) ไม่เหมาะกับคลิปจากมือถือ
export const HDR_TRANSFERS = new Set(["arib-std-b67", "smpte2084"]);
export const TO_SDR = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
  + "tonemap=tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";
export const SDR_TAGS = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"];

let toneMapFilters = null;
/** FFmpeg เครื่องนี้มี zscale + tonemap ไหม (gyan.dev essentials มี) — ไม่มีก็ทำงานต่อแบบเดิม ไม่ให้งานพัง */
async function canToneMap() {
  toneMapFilters ??= ffmpeg(["-filters"], { timeoutMs: 30_000 })
    .then(({ out }) => /\szscale\s/.test(out) && /\stonemap\s/.test(out))
    .catch(() => { toneMapFilters = null; return false; });
  return toneMapFilters;
}

/** filter แปลง HDR → SDR ถ้าไฟล์นี้เป็น HDR และทำได้ ไม่งั้น null */
export async function sdrFilter(file, opts = {}) {
  const { out } = await ffprobe([
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_transfer",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], opts);
  if (!HDR_TRANSFERS.has(out.trim().split(/\r?\n/)[0])) return null;
  return (await canToneMap()) ? TO_SDR : null;
}

/**
 * สำเนา SDR สำหรับตัวเล่นในแอป — Chromium เล่นไฟล์ HDR บนจอปกติแล้วสีเพี้ยน (ซีด/จ้า)
 * แปลงด้วยสูตรเดียวกับตอนเรนเดอร์ ตัวอย่างในแอปจึงสีตรงกับไฟล์ที่ได้จริง
 * ย่อด้านยาวเหลือ 1920 — ไว้ดูในแอปเท่านั้น ตอนเรนเดอร์ยังใช้ต้นฉบับเต็มความละเอียด
 */
export async function makeSdrPreview(input, outFile, opts = {}) {
  const filter = await sdrFilter(input, opts);
  if (!filter) return false;
  const audio = await pickAudioStream(input, opts);
  const tmp = `${outFile}.part.mp4`;
  try {
    await ffmpeg([
      "-i", input,
      "-map", "0:v:0", ...(audio == null ? [] : ["-map", `0:${audio}`]),
      "-vf", `${filter},scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", ...SDR_TAGS,
      "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart",
      "-y", tmp,
    ], { ...opts, timeoutMs: 3 * 60 * 60_000 });
    fs.renameSync(tmp, outFile);
    return true;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** ลำดับเส้นเสียงที่จะลอง (index ในไฟล์): เส้นที่ตั้งเป็น default ก่อน แล้วตามลำดับในไฟล์ */
export function audioCandidates(streams) {
  return streams
    .filter((s) => s.codec_type === "audio")
    .sort((a, b) => (b.disposition?.default ? 1 : 0) - (a.disposition?.default ? 1 : 0))
    .map((s) => s.index);
}

/**
 * เส้นเสียงเส้นเดียวที่ ffmpeg ถอดรหัสได้จริง (index ในไฟล์) หรือ null ถ้าไม่มีเลย
 *
 * iPhone รุ่นใหม่บันทึกเสียงสองเส้น: AAC สเตอริโอ + Spatial Audio (apple_apac) ที่ ffmpeg ยังถอดรหัสไม่ได้
 * ถ้า -map 0:a ลากมาทุกเส้น งานทั้งงานพังเพราะเส้นเดียว ("no decoder found for: apple_apac")
 * จึงลองถอดทีละเส้นสั้น ๆ แล้วใช้เส้นแรกที่ผ่าน — ไม่เดาจากชื่อ codec ซึ่งไม่ตรงกับชื่อตัวถอดรหัสเสมอไป
 */
export async function pickAudioStream(file, opts = {}) {
  const { out } = await ffprobe(["-v", "error", "-print_format", "json", "-show_streams", file], opts);
  for (const index of audioCandidates(JSON.parse(out).streams || [])) {
    try {
      await ffmpeg(["-v", "error", "-i", file, "-map", `0:${index}`, "-t", "0.2", "-f", "null", "-"], { ...opts, timeoutMs: 60_000 });
      return index;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
  }
  return null;
}

/** escape path สำหรับอาร์กิวเมนต์ใน filter ของ ffmpeg (path ไทยบนวินโดวส์ใช้ได้เมื่อเป็น / ) */
const filterPath = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/,/g, "\\,");

/**
 * @param {string} input วิดีโอต้นฉบับ (absolute)
 * @param {string} workDir โฟลเดอร์ที่มี captions.ass (เลน A) — ffmpeg รันใน cwd นี้
 * @param {{overlay?:string|null, fontsDir:string, crf?:number, signal?:AbortSignal, onProgress?:(ratio:number)=>void, durationMs?:number, audioStream?:number|null}} opts
 *   audioStream เส้นเสียงจาก pickAudioStream (ไม่ส่งมา = หาเอง · null = ไม่มีเสียงที่ใช้ได้ ออกเป็นวิดีโอเงียบ)
 */
export async function burnOntoSource(input, workDir, outFile, opts) {
  const { overlay = null, fontsDir, crf = 18, signal, durationMs, onProgress } = opts;
  const audio = opts.audioStream !== undefined ? opts.audioStream : await pickAudioStream(path.resolve(input), { signal });
  const toSdr = opts.toSdr !== undefined ? opts.toSdr : await sdrFilter(path.resolve(input), { signal });
  const args = ["-i", path.resolve(input)];
  // ภาพ HDR ต้องเป็น SDR ก่อนวางซับ ไม่งั้นสีซับเพี้ยน (ดู TO_SDR)
  const base = toSdr ? `[0:v]${toSdr}[base];` : "";
  const src = toSdr ? "[base]" : "[0:v]";
  let filter;
  if (overlay) {
    args.push("-i", path.resolve(overlay));
    filter = `${base}${src}[1:v]overlay=0:0:eof_action=pass:format=auto[v]`;
  } else {
    if (!fs.existsSync(fontsDir)) throw new Error(`ไม่พบโฟลเดอร์ฟอนต์: ${fontsDir}`);
    const fonts = filterPath(path.relative(workDir, fontsDir) || ".");
    filter = `${base}${src}ass=filename='captions.ass':fontsdir='${fonts}'[v]`;
  }
  args.push(
    "-filter_complex", filter,
    "-map", "[v]", ...(audio == null ? [] : ["-map", `0:${audio}`]),
    "-c:v", "libx264", "-preset", "medium", "-crf", String(crf),
    "-pix_fmt", "yuv420p", ...(toSdr ? SDR_TAGS : []),
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    "-progress", "pipe:1", "-nostats",
    "-y", outFile,
  );
  await ffmpeg(args, {
    cwd: workDir,
    signal,
    timeoutMs: 6 * 60 * 60_000,
    onStdout: onProgress && durationMs
      ? (text) => {
        const m = /out_time_us=(\d+)/.exec(String(text).split("\n").reverse().join("\n"));
        if (m) onProgress(Math.min(1, Number(m[1]) / 1000 / durationMs));
      }
      : undefined,
  });
  return path.join(workDir, outFile);
}
