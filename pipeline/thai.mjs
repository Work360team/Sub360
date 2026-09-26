// thai — ตัดคำไทย / แบ่งท่อน / ตำแหน่งซับ (ยกมาจาก Clip360 core.mjs)

export const MAX_CHARS_PER_CHUNK = 22;
const MAX_WORDS_PER_CHUNK = 5;

/* ---------- ภาษาไทย ---------- */

const graphemer = new Intl.Segmenter("th", { granularity: "grapheme" });
const worder = new Intl.Segmenter("th", { granularity: "word" });

/** นับ "ตัวอักษรที่มองเห็น" — สระลอยและวรรณยุกต์ไม่นับเป็นตัวใหม่ */
export function graphemeCount(s) {
  return Array.from(graphemer.segment(s)).length;
}

/**
 * ตัดคำไทยด้วย ICU ที่ติดมากับ Node (ใช้ dictionary เดียวกับที่เบราว์เซอร์ใช้)
 * คืนค่าเป็นช่วง index ในสตริงต้นฉบับ เพื่อประกอบข้อความกลับได้เป๊ะ รวมช่องว่างเดิม
 */
export function segmentWords(text) {
  const raw = [];
  for (const seg of worder.segment(text)) {
    if (!seg.segment.trim()) {
      // ช่องว่าง/วรรค — ผนวกเข้ากับคำก่อนหน้า ไม่ให้เป็นคำลอย
      if (raw.length) raw.at(-1).e = seg.index + seg.segment.length;
      continue;
    }
    raw.push({ s: seg.index, e: seg.index + seg.segment.length });
  }
  if (!raw.length && text.trim()) raw.push({ s: 0, e: text.length });

  // ICU ตัดละเอียดกว่าที่ตาอ่าน ("พก|พา", "น้ำ|หนัก") — รวมเศษสั้น ๆ กลับเข้ากับคำข้างเคียง
  // ไม่งั้นไฮไลต์จะกระพริบถี่จนอ่านไม่ทัน
  const merged = [];
  for (const w of raw) {
    const prev = merged.at(-1);
    const short = graphemeCount(text.slice(w.s, w.e).trim()) <= 2;
    if (prev && short && graphemeCount(text.slice(prev.s, w.e).trim()) <= 8) {
      prev.e = w.e;
      continue;
    }
    merged.push({ ...w });
  }
  return merged.map((w) => ({ text: text.slice(w.s, w.e), s: w.s, e: w.e }));
}

/**
 * ตัดข้อความยาวเป็นท่อนสำหรับ "หนึ่งจอ" — 2–5 คำ ไม่เกิน 22 ตัวอักษร
 * ตัดที่ขอบวลีก่อนเสมอ และห้ามตัดกลาง grapheme cluster
 */
export function chunkText(text, { maxChars = MAX_CHARS_PER_CHUNK, maxWords = MAX_WORDS_PER_CHUNK } = {}) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const BREAK_AFTER = new Set(["ที่", "แล้ว", "เพราะ", "แต่", "ก็", "และ", "หรือ", "ครับ", "ค่ะ", "นะ", "เลย"]);
  const words = segmentWords(clean);
  const chunks = [];
  let cur = [];
  let curChars = 0;

  const flush = () => {
    if (!cur.length) return;
    chunks.push(clean.slice(cur[0].s, cur.at(-1).e).trim());
    cur = [];
    curChars = 0;
  };

  for (const w of words) {
    const n = graphemeCount(w.text);
    if (cur.length && (curChars + n > maxChars || cur.length >= maxWords)) flush();
    cur.push(w);
    curChars += n;
    const hardStop = /[.!?…]$/.test(w.text) || BREAK_AFTER.has(w.text.trim());
    if (hardStop && curChars >= 8) flush();
  }
  flush();
  return chunks.filter(Boolean);
}

/* ---------- ตำแหน่งซับ ---------- */

export const ANCHORS = ["top", "middle", "bottom"];

/**
 * ทำให้ค่า anchor เป็นหนึ่งใน top | middle | bottom
 * ทั้งสองเลนต้องอ่านค่าเดียวกันนี้ ไม่งั้นสไตล์เดียวกันจะไปโผล่คนละที่
 */
export function normalizeAnchor(value) {
  const s = String(value || "bottom").toLowerCase();
  if (s.startsWith("top")) return "top";
  if (s.startsWith("mid") || s.startsWith("center")) return "middle";
  return "bottom";
}

/**
 * marginV แปลว่า "ห่างจากขอบที่ยึด" เสมอ
 *   top    → ห่างจากขอบบน
 *   bottom → ห่างจากขอบล่าง
 *   middle → ไม่ใช้ (กลางจอพอดี)
 */
export function anchorMarginV(anchor, marginV) {
  return normalizeAnchor(anchor) === "middle" ? 0 : (marginV ?? 400);
}

