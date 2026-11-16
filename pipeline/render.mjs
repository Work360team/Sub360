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
//
// ห้ามปรับแสงภาพต้นฉบับ (v0.4.5 แปลงทั้งภาพเป็น SDR แล้วภาพสว่าง/ซีดกว่าต้นฉบับ) จึงแปลง "เฉพาะชั้นซับ"
// เข้าไปอยู่ในระบบสี HDR ของคลิปแทน แล้ววางทับภาพเดิมที่ไม่ถูกแตะ — ไฟล์ออกยังเป็น HDR เหมือนต้นฉบับ
export const HDR_TRANSFERS = new Set(["arib-std-b67", "smpte2084"]);
// ขาวอ้างอิงของ HDR (ITU-R BT.2408) = ระดับกระดาษขาวในคลิป ใช้แปลงภาพลง SDR ให้ดูในแอป
const REF_WHITE_NITS = 203;
// ขาวของซับ = ยอดสว่างของ HLG (1000 nits, สัญญาณ 100%) ให้ซับสว่างเท่าส่วนที่สว่างที่สุดในคลิปเหมือนในแอป
// v0.4.6–0.4.7 ใช้ 203 nits (สัญญาณ HLG 75%) — ตัวเล่นส่วนใหญ่ย่อ HDR ลงจอปกติโดยให้ยอด 1000 nits = ขาว
// ซับขาวจึงออกมาเทา ~130/255 เขียว #3DF07B เป็นเขียวทึบ (ไฟล์จากทีมงาน v0.4.7 วัดได้ 56,104,64)
// แบบนี้ตัวเล่นแบบนั้นได้สีตรงกับในแอป (คลาดเฉลี่ย ΔE≈1) ตัวเล่นที่เปิดค่าดิบได้ขาว 255 แทน 191
const SUBTITLE_WHITE_NITS = 1000;

/**
 * แปลง HDR → SDR สำหรับดูในแอปเท่านั้น (สำเนาตัวอย่าง + ภาพย่อ) ไม่ใช้กับไฟล์ที่เรนเดอร์
 * ขาวอ้างอิง 203 nits → ขาวของ SDR ส่วนที่ต่ำกว่าแทบไม่เปลี่ยน (mobius ตรงเส้นถึง 0.8) แค่กดไฮไลต์ที่สว่างกว่าขาว
 * (v0.4.5 ใช้ npl=100 ภาพจึงสว่างเกินจริงราว 2 เท่า)
 */
export const TO_SDR = `zscale=t=linear:npl=${REF_WHITE_NITS},format=gbrpf32le,zscale=p=bt709,`
  + "tonemap=tonemap=mobius:param=0.8:peak=4.9:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";
const SDR_TAGS = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"];

let zscaleReady = null;
/** FFmpeg เครื่องนี้มี zscale + tonemap ไหม (gyan.dev essentials มี) — ไม่มีก็ทำงานต่อแบบเดิม ไม่ให้งานพัง */
async function hasZscale() {
  zscaleReady ??= ffmpeg(["-filters"], { timeoutMs: 30_000 })
    .then(({ out }) => /\szscale\s/.test(out) && /\stonemap\s/.test(out))
    .catch(() => { zscaleReady = null; return false; });
  return zscaleReady;
}

/** ระบบสีของคลิปถ้าเป็น HDR ({ transfer, primaries, matrix }) ไม่งั้น null */
export async function hdrInfo(file, opts = {}) {
  const { out } = await ffprobe([
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_transfer,color_primaries,color_space",
    "-print_format", "json", file,
  ], opts);
  const v = JSON.parse(out).streams?.[0] || {};
  if (!HDR_TRANSFERS.has(v.color_transfer) || !(await hasZscale())) return null;
  const known = (value) => value && value !== "unknown" && value !== "unspecified";
  return {
    transfer: v.color_transfer,
    primaries: known(v.color_primaries) ? v.color_primaries : "bt2020",
    matrix: known(v.color_space) ? v.color_space : "bt2020nc",
  };
}

/**
 * ชั้นโปร่งใสให้ libass วาดซับลงไป ก่อนแปลงเป็น HDR — ต้องเป็น YUV ที่ระบุ BT.709 ช่วง tv ไว้ชัด ๆ
 * (วาดลง RGBA แล้ว FFmpeg 8.x บีบสีเป็นช่วง 16–235: เหลือง 255,212,0 ออกมา 235,198,16 ส่วน 7.x ไม่บีบ
 *  แบบนี้ได้ค่าเดียวกันทั้งสองรุ่น วัดแล้ว)
 */
export const LIBASS_LAYER = "format=yuva444p,setparams=colorspace=bt709:range=tv";

/**
 * filtergraph แปลงชั้นซับ (SDR) เข้าระบบสี HDR ของคลิป: [from] → [to] เป็น yuva ไว้ overlay ทับภาพ HDR
 * source "libass" = ชั้น LIBASS_LAYER · "hyperframes" = ProRes 4444 จาก HyperFrames
 * ซึ่งเข้ารหัสด้วย matrix BT.601 ช่วงสีแบบ tv (วัดแล้ว: ถอดแบบนี้ได้ #FFD400 ตรง ถอดแบบ BT.709 ได้ 255,204,0)
 *
 * แยก alpha ออกก่อนเข้า zscale แล้วค่อยรวมกลับ — zscale ของ FFmpeg 8.x แปลงภาพที่มี alpha ผิด
 * ตัวหนังสือออกมาดำและเลื่อนตำแหน่ง (ทีมงานเจอจริงกับ gyan.dev 8.1) ส่วน 7.x ถูก
 * ผ่าน alphaextract/alphamerge แล้วได้ผลตรงกันทั้งสองรุ่น
 */
export function subtitlesToHdr(hdr, source, from, to) {
  const [alpha, color, matrix] = source === "hyperframes"
    ? ["yuva444p12le", "yuv444p12le", "170m"]
    : ["yuva444p", "yuv444p", "bt709"];
  const z = `zscale=min=${matrix}:rin=tv:tin=bt709:pin=bt709:t=${hdr.transfer}:p=${hdr.primaries}:m=${hdr.matrix}:r=tv`
    + `:npl=${SUBTITLE_WHITE_NITS}`;
  return `[${from}]format=${alpha},split[${to}_c][${to}_a];[${to}_a]alphaextract[${to}_al];`
    + `[${to}_c]format=${color},${z},format=yuv420p10le[${to}_cc];`
    + `[${to}_cc][${to}_al]alphamerge,format=yuva420p10le[${to}]`;
}

/** ป้ายระบบสีของไฟล์ออก ให้ตรงกับต้นฉบับ HDR */
export const hdrTags = (hdr) => ["-color_primaries", hdr.primaries, "-color_trc", hdr.transfer, "-colorspace", hdr.matrix];

/**
 * สำเนา SDR สำหรับตัวเล่นในแอป — Chromium เล่นไฟล์ HDR บนจอปกติแล้วสีเพี้ยน (ซีด/จ้า)
 * ย่อด้านยาวเหลือ 1920 — ไว้ดูในแอปเท่านั้น ตอนเรนเดอร์ยังใช้ต้นฉบับเต็มความละเอียดและเป็น HDR เหมือนเดิม
 */
export async function makeSdrPreview(input, outFile, opts = {}) {
  if (!(await hdrInfo(input, opts))) return false;
  const audio = await pickAudioStream(input, opts);
  const tmp = `${outFile}.part.mp4`;
  try {
    await ffmpeg([
      "-i", input,
      "-map", "0:v:0", ...(audio == null ? [] : ["-map", `0:${audio}`]),
      "-vf", `${TO_SDR},scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'`,
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
 * @param {{overlay?:string|null, fontsDir:string, crf?:number, signal?:AbortSignal, onProgress?:(ratio:number)=>void, durationMs?:number, audioStream?:number|null, hdr?:object|null, meta?:object}} opts
 *   audioStream เส้นเสียงจาก pickAudioStream (ไม่ส่งมา = หาเอง · null = ไม่มีเสียงที่ใช้ได้ ออกเป็นวิดีโอเงียบ)
 *   hdr ระบบสีจาก hdrInfo (ไม่ส่งมา = หาเอง · null = คลิป SDR) · meta ขนาด/เฟรมเรต/ความยาว (ไม่ส่งมา = probe)
 */
export async function burnOntoSource(input, workDir, outFile, opts) {
  const { overlay = null, fontsDir, crf = 18, signal, onProgress } = opts;
  const audio = opts.audioStream !== undefined ? opts.audioStream : await pickAudioStream(path.resolve(input), { signal });
  const hdr = opts.hdr !== undefined ? opts.hdr : await hdrInfo(path.resolve(input), { signal });
  const durationMs = opts.durationMs ?? opts.meta?.durationMs;
  const args = ["-i", path.resolve(input)];
  let filter;
  if (overlay) {
    args.push("-i", path.resolve(overlay));
    // คลิป HDR: แปลงชั้นซับเข้าระบบสี HDR ก่อนวางทับ ภาพต้นฉบับไม่ถูกแตะ (ดู subtitlesToHdr)
    filter = hdr
      ? `${subtitlesToHdr(hdr, "hyperframes", "1:v", "ov")};[0:v][ov]overlay=0:0:eof_action=pass:format=yuv420p10[v]`
      : "[0:v][1:v]overlay=0:0:eof_action=pass:format=auto[v]";
  } else {
    if (!fs.existsSync(fontsDir)) throw new Error(`ไม่พบโฟลเดอร์ฟอนต์: ${fontsDir}`);
    const fonts = filterPath(path.relative(workDir, fontsDir) || ".");
    const ass = `ass=filename='captions.ass':fontsdir='${fonts}'`;
    if (hdr) {
      // libass วาดลงชั้นโปร่งใสขนาดเท่าภาพ (alpha=1) แล้วแปลงชั้นนั้นเป็น HDR ก่อนวางทับ
      const m = opts.meta || await probe(path.resolve(input), { signal });
      const fps = Math.round(m.fps) || 30;
      filter = `color=c=black@0.0:s=${m.width}x${m.height}:r=${fps}:d=${(m.durationMs / 1000 + 1).toFixed(3)},${LIBASS_LAYER},`
        + `${ass}:alpha=1[subs];${subtitlesToHdr(hdr, "libass", "subs", "ov")};[0:v][ov]overlay=0:0:eof_action=pass:format=yuv420p10[v]`;
    } else {
      filter = `[0:v]${ass}[v]`;
    }
  }
  args.push(
    "-filter_complex", filter,
    "-map", "[v]", ...(audio == null ? [] : ["-map", `0:${audio}`]),
    "-c:v", "libx264", "-preset", "medium", "-crf", String(crf),
    "-pix_fmt", "yuv420p", ...(hdr ? hdrTags(hdr) : []),
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
