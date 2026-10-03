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
  const args = ["-i", path.resolve(input)];
  let filter;
  if (overlay) {
    args.push("-i", path.resolve(overlay));
    filter = "[0:v][1:v]overlay=0:0:eof_action=pass:format=auto[v]";
  } else {
    if (!fs.existsSync(fontsDir)) throw new Error(`ไม่พบโฟลเดอร์ฟอนต์: ${fontsDir}`);
    const fonts = filterPath(path.relative(workDir, fontsDir) || ".");
    filter = `[0:v]ass=filename='captions.ass':fontsdir='${fonts}'[v]`;
  }
  args.push(
    "-filter_complex", filter,
    "-map", "[v]", ...(audio == null ? [] : ["-map", `0:${audio}`]),
    "-c:v", "libx264", "-preset", "medium", "-crf", String(crf),
    "-pix_fmt", "yuv420p",
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
