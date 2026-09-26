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

/** escape path สำหรับอาร์กิวเมนต์ใน filter ของ ffmpeg (path ไทยบนวินโดวส์ใช้ได้เมื่อเป็น / ) */
const filterPath = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/,/g, "\\,");

/**
 * @param {string} input วิดีโอต้นฉบับ (absolute)
 * @param {string} workDir โฟลเดอร์ที่มี captions.ass (เลน A) — ffmpeg รันใน cwd นี้
 * @param {{overlay?:string|null, fontsDir:string, crf?:number, signal?:AbortSignal, onProgress?:(ratio:number)=>void, durationMs?:number}} opts
 */
export async function burnOntoSource(input, workDir, outFile, opts) {
  const { overlay = null, fontsDir, crf = 18, signal, durationMs, onProgress } = opts;
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
    "-map", "[v]", "-map", "0:a?",
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
