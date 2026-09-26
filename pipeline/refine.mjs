// refine — ให้ Gemini ฟังเสียงแล้วแก้คำที่ whisper ถอดผิด
//
// หลักเดียวกับ Clip360 tts-align: เชื่อ "เวลา" จาก whisper เชื่อ "คำ" จากแหล่งที่แม่นกว่า
// Gemini แก้ข้อความทีละบรรทัดโดยห้ามรวม/แยกบรรทัด แล้ว buildTimeline จะจับคู่ข้อความใหม่
// กลับเข้ากับ token ของ whisper ด้วย LCS — เวลาระดับคำจึงยังมาจากเสียงจริง
//
// แบ่งส่งเป็นช่วงละไม่เกิน ~4 นาที: ไฟล์เสียงเล็กพอส่งแบบ inline และโมเดลไม่หลงบรรทัด
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpeg } from "./lib.mjs";
import { geminiJson } from "./gemini.mjs";

const WINDOW_MS = 240_000;
const WINDOW_LINES = 80;

const LANG_NAME = { th: "Thai", en: "English", auto: "the spoken language" };

const SYSTEM = `You are a meticulous subtitle proofreader. You receive an audio clip and the automatic transcript of that clip, one numbered line per speech segment.
Your job: listen and correct each line so it matches exactly what is spoken.
Rules:
- Return exactly the same line ids, in the same order. Never merge, split, reorder or add lines.
- Fix misheard words, spelling, tone marks, proper nouns, brand names and English loanwords. Write brand/product names the way they are officially written (e.g. "KIO S+", "iPhone").
- Keep the speaker's wording. Do not paraphrase, summarise, translate, or make it more formal.
- Keep spaces where the speaker pauses between phrases. Do not add commas or full stops that Thai subtitles do not use.
- Write numbers as digits when the speaker says a number.
- If a line contains words that are not in the audio at all (music, silence, hallucination), return it with "text": "".
Reply with JSON only: {"lines":[{"id":0,"text":"..."}]}`;

const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(((ms % 60000) / 1000).toFixed(1)).padStart(4, "0")}`;

/** แบ่ง segment เป็นช่วงที่ส่งให้ Gemini ครั้งละช่วง ไม่ตัดกลาง segment */
export function planWindows(segments, { windowMs = WINDOW_MS, maxLines = WINDOW_LINES } = {}) {
  const windows = [];
  let cur = null;
  segments.forEach((segment, index) => {
    if (!cur || segment.endMs - cur.startMs > windowMs || cur.indexes.length >= maxLines) {
      cur = { startMs: Math.max(0, segment.startMs - 300), endMs: segment.endMs, indexes: [] };
      windows.push(cur);
    }
    cur.indexes.push(index);
    cur.endMs = Math.max(cur.endMs, segment.endMs);
  });
  return windows;
}

/** ความยาวต่างกันมากผิดปกติ = โมเดลแต่งเพิ่มหรือกินบรรทัดข้างเคียง ไม่เชื่อ */
function plausible(before, after) {
  const a = before.replace(/\s+/g, "").length;
  const b = after.replace(/\s+/g, "").length;
  if (a < 6) return b <= 24;
  return b >= a * 0.4 && b <= a * 2.2;
}

/**
 * @param {object[]} segments ผลจาก whisper
 * @param {{videoFile:string, language?:string, glossary?:string, signal?:AbortSignal, onProgress?:Function}} opts
 * @returns {Promise<{segments:object[], stats:object}>}
 */
export async function refineSegments(segments, { videoFile, language = "th", glossary = "", signal, onProgress = async () => {} }) {
  const windows = planWindows(segments);
  const out = segments.map((s) => ({ ...s }));
  const stats = { windows: windows.length, changed: 0, dropped: 0, rejected: 0 };
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-refine-"));
  try {
    for (const [wi, win] of windows.entries()) {
      await onProgress("refine", Math.round(5 + (wi / windows.length) * 90), `AI กำลังฟังและแก้คำ ช่วงที่ ${wi + 1}/${windows.length}`);
      const clip = path.join(workDir, `w${wi}.mp3`);
      await ffmpeg([
        "-ss", (win.startMs / 1000).toFixed(3),
        "-t", ((win.endMs - win.startMs + 400) / 1000).toFixed(3),
        "-i", videoFile,
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k",
        "-y", clip,
      ], { signal, timeoutMs: 5 * 60_000 });

      const lines = win.indexes.map((index) => {
        const s = segments[index];
        return `${index} [${fmt(s.startMs - win.startMs)}–${fmt(s.endMs - win.startMs)}] ${s.text}`;
      });
      const prompt = [
        `Language spoken: ${LANG_NAME[language] || language}.`,
        glossary ? `Names and terms that appear in this video (use these spellings): ${glossary}` : "",
        "Timestamps are relative to the start of the audio clip.",
        "Transcript lines (id [start–end] text):",
        ...lines,
      ].filter(Boolean).join("\n");

      const result = await geminiJson({
        system: SYSTEM,
        parts: [
          { inlineData: { mimeType: "audio/mp3", data: fs.readFileSync(clip).toString("base64") } },
          { text: prompt },
        ],
        temperature: 0.1,
        signal,
      });
      fs.rmSync(clip, { force: true });

      const byId = new Map((Array.isArray(result?.lines) ? result.lines : []).map((l) => [Number(l.id), String(l.text ?? "")]));
      for (const index of win.indexes) {
        if (!byId.has(index)) continue;
        const before = segments[index].text;
        const after = byId.get(index).replace(/\s+/g, " ").trim();
        if (after === before) continue;
        if (!after) {
          out[index].text = "";
          stats.dropped += 1;
        } else if (plausible(before, after)) {
          out[index].text = after;
          stats.changed += 1;
        } else {
          stats.rejected += 1;
        }
      }
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  await onProgress("refine", 98, `AI แก้ ${stats.changed} บรรทัด`);
  return { segments: out.filter((s) => s.text), stats };
}
