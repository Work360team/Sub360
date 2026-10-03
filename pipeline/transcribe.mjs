// transcribe — แยกเสียงจากวิดีโอแล้วถอดด้วย whisper.cpp
//
// ต่างจาก Clip360 ตรงที่ที่นี่ "ข้อความ" คือของจริง ไม่ใช่แค่เวลา จึงต้องเก็บทั้งข้อความ
// ระดับ segment (ครบถ้วน อ่านได้) และเวลาระดับ token (ละเอียด ใช้จับจังหวะคำ)
//
// whisper แบ่ง token เป็นไบต์ อักษรไทยหนึ่งตัวยาว 3 ไบต์จึงอาจถูกผ่ากลางแล้วกลายเป็น
// U+FFFD ใน JSON — เราไม่เอาข้อความจาก token มาแสดงเลย ใช้แค่เวลาของมัน
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpeg, run, throwIfAborted } from "./lib.mjs";
import { pickAudioStream } from "./render.mjs";

const defaultThreads = () => Math.max(1, Math.min(16, os.cpus()?.length || 4));
const isAsciiPath = (value) => /^[ -~]*$/.test(String(value ?? ""));

export function whisperPaths(environment = process.env) {
  return {
    cli: environment.WHISPER_CLI_PATH || "",
    model: environment.WHISPER_MODEL_PATH || "",
  };
}

export function whisperReady(environment = process.env) {
  const { cli, model } = whisperPaths(environment);
  if (!cli || !model) return false;
  try {
    return fs.statSync(cli).isFile() && fs.statSync(model).isFile();
  } catch {
    return false;
  }
}

/** แยกเสียงเป็น WAV 16 kHz mono ซึ่งเป็นรูปแบบที่ whisper ต้องการ */
export async function extractAudio(videoFile, wavFile, opts = {}) {
  // ระบุเส้นเสียงเอง — ไฟล์ iPhone มีเส้น Spatial Audio ที่ถอดไม่ได้ ถ้าปล่อยให้ ffmpeg เลือกอาจหยิบผิดเส้น
  const audio = await pickAudioStream(videoFile, { signal: opts.signal });
  if (audio == null) throw new Error("ไม่พบเสียงที่ถอดได้ในวิดีโอนี้ (ไม่มีเสียง หรือเป็นเสียงแบบที่ FFmpeg เปิดไม่ได้)");
  await ffmpeg([
    "-i", videoFile,
    "-map", `0:${audio}`,
    "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
    "-y", wavFile,
  ], opts);
  return wavFile;
}

/**
 * อ่าน JSON ของ whisper.cpp (-ojf) เป็นรายการ segment
 * [{ text, startMs, endMs, tokens: [{ text, startMs, endMs }] }]
 */
export function parseWhisperJson(input) {
  const data = typeof input === "string" ? JSON.parse(input) : input;
  const segments = [];
  for (const segment of data?.transcription ?? []) {
    const text = String(segment?.text ?? "").replace(/�/g, "").trim();
    const startMs = Number(segment?.offsets?.from);
    const endMs = Number(segment?.offsets?.to);
    if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const tokens = [];
    for (const token of segment?.tokens ?? []) {
      const value = String(token?.text ?? "");
      if (!value || value.startsWith("[_")) continue;
      const from = Number(token?.offsets?.from);
      const to = Number(token?.offsets?.to);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      tokens.push({ text: value, startMs: from, endMs: to });
    }
    segments.push({ text, startMs, endMs, tokens });
  }
  return segments;
}

/** ถอดเสียงไฟล์ WAV แล้วคืน segment พร้อมเวลา */
export async function transcribe(audioFile, options = {}) {
  const {
    environment = process.env,
    language = "th",
    prompt = "",
    threads = Number(environment.WHISPER_THREADS) || defaultThreads(),
    signal,
    timeoutMs = Number(environment.WHISPER_TIMEOUT_MS || 30 * 60_000),
  } = options;
  const { cli, model } = { ...whisperPaths(environment), ...options };
  if (!cli || !model) throw new Error("ยังไม่ได้ติดตั้ง whisper.cpp (ตั้ง WHISPER_CLI_PATH และ WHISPER_MODEL_PATH ใน .env)");

  throwIfAborted(signal);
  // whisper.cpp บนวินโดวส์อ่านอาร์กิวเมนต์เป็น ANSI — path ไทยจะกลายเป็น ??? จึงทำงานใน temp
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-whisper-"));
  const input = path.join(workDir, "input.wav");
  const outBase = path.join(workDir, "out");
  try {
    if (!isAsciiPath(workDir) || !isAsciiPath(model) || !isAsciiPath(cli)) {
      throw new Error("path ของ whisper.cpp / โมเดล / โฟลเดอร์ชั่วคราว ต้องเป็นอักษรอังกฤษล้วน");
    }
    fs.copyFileSync(audioFile, input);
    const args = [
      "-m", model,
      "-f", input,
      "-l", language,
      "-t", String(threads),
      "-ojf", "-of", outBase,
      "-np",
      // ไม่ใช้ -ml: วัดกับเสียงไทยจริงแล้วมันตัดกลางคำ ("ส้มสัต|ซึมะ") เพราะนับเป็น token
      // ปล่อยให้ whisper แบ่งตามจังหวะพูด แล้วให้ chunkText ตัดท่อนตามคำไทยเอง
    ];
    if (prompt) args.push("--prompt", prompt);
    const { code, err } = await run(cli, args, { signal, timeoutMs });
    if (code !== 0) throw new Error(`whisper.cpp จบด้วยรหัส ${code}: ${String(err).slice(0, 300)}`);
    const segments = parseWhisperJson(fs.readFileSync(`${outBase}.json`, "utf8"));
    if (!segments.length) throw new Error("whisper.cpp ไม่ได้ยินคำพูดในวิดีโอนี้");
    return dropHallucinations(segments);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * whisper ชอบ "แต่งเรื่อง" ตอนเจอช่วงเงียบหรือเพลง — ประโยคเดิมซ้ำติดกันหลายรอบ
 * หรือมีแต่สัญลักษณ์ ตัดออกก่อนถึงมือผู้ใช้
 * (ไม่ตัดประโยคอย่าง "ขอบคุณที่รับชม" เพราะคนพูดจริงได้ — ให้ผู้ใช้ลบเองในหน้าแก้ซับ)
 */
const HALLUCINATIONS = [/ซับไตเติ้ลโดย/, /^\s*[.…♪*\-]+\s*$/];
export function dropHallucinations(segments) {
  const out = [];
  for (const segment of segments) {
    if (HALLUCINATIONS.some((re) => re.test(segment.text))) continue;
    const prev = out.at(-1);
    const prev2 = out.at(-2);
    if (prev && prev2 && prev.text === segment.text && prev2.text === segment.text) continue;
    out.push(segment);
  }
  return out;
}
