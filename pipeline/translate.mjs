// translate — แปลซับทีละท่อนด้วย Gemini
//
// แปลแบบรู้บริบท: ส่งครั้งละหลายสิบท่อนพร้อมท่อนก่อนหน้าไว้อ่านประกอบ แต่ห้ามรวม/แยกท่อน
// เพราะคำแปลต้องขึ้นจอพร้อมท่อนต้นฉบับของมันพอดี
import { geminiJson } from "./gemini.mjs";

export const TRANSLATE_LANGS = [
  { id: "en", name: "อังกฤษ", english: "English" },
  { id: "th", name: "ไทย", english: "Thai" },
  { id: "zh", name: "จีน (ตัวย่อ)", english: "Simplified Chinese" },
  { id: "ja", name: "ญี่ปุ่น", english: "Japanese" },
  { id: "ko", name: "เกาหลี", english: "Korean" },
  { id: "vi", name: "เวียดนาม", english: "Vietnamese" },
  { id: "lo", name: "ลาว", english: "Lao" },
  { id: "my", name: "พม่า", english: "Burmese" },
  { id: "id", name: "อินโดนีเซีย", english: "Indonesian" },
];

const BATCH = 60;
const CONTEXT = 6;

const SYSTEM = `You are a professional subtitle translator for social-media videos.
Translate each subtitle line into the target language so it reads naturally on screen.
Rules:
- Return exactly the same line ids in the same order. Never merge, split or drop lines — each translation is shown at the same time as its source line.
- Keep each translation short and natural (subtitle style), not word-for-word. It is fine to move a word to a neighbouring line's translation only if the sentence would otherwise be ungrammatical.
- Keep brand names, product names and people's names as written in the source.
- Write numbers as digits. No quotation marks around lines. No trailing full stop for short lines.
- "Context" lines are for understanding only; do not translate or return them.
Reply with JSON only: {"lines":[{"id":"...","text":"..."}]}`;

/**
 * @param {{id:string,text:string}[]} chunks
 * @param {{to:string, glossary?:string, signal?:AbortSignal, onProgress?:Function}} opts
 * @returns {Promise<Map<string,string>>} id → คำแปล
 */
export async function translateChunks(chunks, { to, glossary = "", signal, onProgress = async () => {} }) {
  const lang = TRANSLATE_LANGS.find((l) => l.id === to);
  if (!lang) throw new Error(`ยังไม่รองรับการแปลเป็นภาษา "${to}"`);
  const out = new Map();
  const batches = Math.ceil(chunks.length / BATCH);
  for (let b = 0; b < batches; b += 1) {
    await onProgress("translate", Math.round(5 + (b / batches) * 90), `กำลังแปลเป็นภาษา${lang.name} ${b + 1}/${batches}`);
    const slice = chunks.slice(b * BATCH, (b + 1) * BATCH);
    const context = chunks.slice(Math.max(0, b * BATCH - CONTEXT), b * BATCH);
    const prompt = [
      `Target language: ${lang.english}.`,
      glossary ? `Names/terms in this video (keep these spellings): ${glossary}` : "",
      context.length ? `Context (previous lines, do not return):\n${context.map((c) => c.text).join("\n")}` : "",
      "Lines to translate (id<TAB>text):",
      ...slice.map((c) => `${c.id}\t${c.text}`),
    ].filter(Boolean).join("\n");
    const result = await geminiJson({ system: SYSTEM, parts: [{ text: prompt }], temperature: 0.3, signal });
    for (const line of Array.isArray(result?.lines) ? result.lines : []) {
      const id = String(line.id ?? "");
      const text = String(line.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
      if (text && slice.some((c) => c.id === id)) out.set(id, text);
    }
  }
  await onProgress("translate", 98, `แปลได้ ${out.size}/${chunks.length} ท่อน`);
  return out;
}
