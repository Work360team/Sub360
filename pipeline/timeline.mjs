// timeline — แปลงผลถอดเสียงเป็น timeline รูปแบบเดียวกับ Clip360
//
//   { durationMs, chunks: [{ text, startMs, endMs, words: [{ text, s, e, startMs, endMs, emphasis }] }] }
//
// ตัวเรนเดอร์ทั้งสองเลน (ass.mjs / hyperframes.mjs) อ่านโครงนี้อย่างเดียว จึงใช้ต่อได้โดยไม่แก้
// ต่างจาก Clip360 ที่แบ่งเวลาคำตามสัดส่วนตัวอักษร — ที่นี่ใช้เวลาจริงจาก token ของ whisper
import { chunkText, graphemeCount, MAX_CHARS_PER_CHUNK, segmentWords } from "./thai.mjs";

const isSpace = (ch) => /\s/u.test(ch);

/** LCS ระหว่างสองสายอักขระ (ยกมาจาก Clip360 tts-align) — ใช้ต่อ segment จึงสั้นเสมอ */
export function matchIndexes(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return new Map();
  const table = new Int32Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[at(i, j)] = a[i] === b[j]
        ? table[at(i + 1, j + 1)] + 1
        : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }
  const pairs = new Map();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.set(i, j);
      i += 1;
      j += 1;
    } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) i += 1;
    else j += 1;
  }
  return pairs;
}

/**
 * เวลาประจำตัวอักษรของข้อความหนึ่ง segment
 * คืน [{ startMs, endMs }] ยาวเท่า text (ช่องว่างได้เวลาของตัวก่อนหน้า)
 *
 * ตัวที่จับคู่กับ token ได้ใช้เวลาของ token นั้น ส่วนที่เหลือ (token ที่ไบต์ไทยแตก
 * หรือ segment ที่แก้ข้อความแล้ว) เติมด้วยการไล่เส้นตรงระหว่างจุดที่รู้เวลา
 */
export function charTimes(text, tokens, startMs, endMs) {
  const letters = [];
  for (let i = 0; i < text.length; i += 1) if (!isSpace(text[i])) letters.push(i);

  let hypothesis = "";
  const hypTimes = [];
  for (const token of tokens || []) {
    const piece = String(token.text).replace(/�/g, "").replace(/\s+/gu, "");
    for (const ch of piece) {
      hypothesis += ch;
      hypTimes.push([token.startMs, token.endMs]);
    }
  }
  const reference = letters.map((i) => text[i]).join("");
  const pairs = matchIndexes(reference, hypothesis);

  const n = letters.length;
  const known = new Array(n).fill(null);
  for (const [ri, hi] of pairs) known[ri] = hypTimes[hi];
  // ตัวแรกเริ่มพร้อม segment เสมอถ้าไม่รู้เวลา — ไม่งั้นซับโผล่ช้ากว่าเสียงนิดหนึ่ง
  if (n && !known[0]) known[0] = [startMs, startMs];

  // จุดยึดสองปลายคือขอบ segment เอง
  const anchors = [[-1, startMs]];
  known.forEach((t, i) => { if (t) anchors.push([i, t[0]]); });
  anchors.push([n, endMs]);

  const starts = new Array(n);
  for (let a = 0; a < anchors.length - 1; a += 1) {
    const [i0, t0] = anchors[a];
    const [i1, t1raw] = anchors[a + 1];
    const t1 = Math.max(t0, t1raw);
    for (let i = i0 + 1; i < i1; i += 1) starts[i] = t0 + ((t1 - t0) * (i - i0)) / (i1 - i0);
    if (i1 < n) starts[i1] = Math.max(t0, t1raw);
  }
  // เวลาต้องเดินหน้าเสมอ — LCS จับคู่ข้ามกันได้เมื่อ whisper ถอดสลับที่
  for (let i = 1; i < n; i += 1) starts[i] = Math.max(starts[i], starts[i - 1]);

  const out = new Array(text.length);
  let last = { startMs, endMs: startMs };
  let li = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (isSpace(text[i])) {
      out[i] = { ...last };
      continue;
    }
    const s = starts[li];
    const e = li + 1 < n ? starts[li + 1] : endMs;
    last = { startMs: Math.round(s), endMs: Math.round(Math.max(s, e)) };
    out[i] = last;
    li += 1;
  }
  return out;
}

/**
 * แบ่งท่อนโดยยึด "ช่องว่าง" ก่อน — คนไทยเว้นวรรคตรงรอยต่อวลี และ whisper ก็เว้นตามจังหวะพูด
 * ตัดคำด้วย ICU อย่างเดียวจะผ่าคำทับศัพท์ที่ไม่มีในพจนานุกรม ("ส้มสัต|ซึมะ")
 * วลีที่ยาวเกินหนึ่งท่อนเท่านั้นที่ส่งให้ chunkText ตัดตามคำ
 */
export function chunkPhrases(text, maxChars) {
  const phrases = text.split(" ").filter(Boolean);
  // แบ่งให้ยาวพอ ๆ กัน: ประโยค 33 ตัวอักษรควรได้ 16+17 ไม่ใช่ 22+11
  // ไม่งั้นท่อนแรกยาวจนอ่านไม่ทัน ท่อนหลังเหลือเศษคำเดียว
  const total = graphemeCount(text);
  const target = total / Math.max(1, Math.ceil(total / maxChars));
  const out = [];
  let cur = "";
  for (const phrase of phrases) {
    if (graphemeCount(phrase) > maxChars) {
      if (cur) out.push(cur);
      cur = "";
      out.push(...chunkText(phrase, { maxChars }));
      continue;
    }
    const joined = cur ? `${cur} ${phrase}` : phrase;
    const len = graphemeCount(joined);
    const full = len > maxChars || (graphemeCount(cur) >= target * 0.7 && len > target * 1.15);
    if (cur && full) {
      out.push(cur);
      cur = phrase;
    } else cur = joined;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * ท่อนสุดท้ายของ segment ที่สั้นมาก ("เติ้ลกัน") มักเป็นเศษคำที่ ICU ตัดคำทับศัพท์ผิด
 * ปล่อยไว้จะเห็นคำโดด ๆ ขึ้นจอแวบเดียว — รวมกลับเข้าท่อนก่อนหน้าถ้ายังไม่ยาวเกินไป
 */
function mergeOrphanTail(pieces, maxChars, source) {
  if (pieces.length < 2) return pieces;
  const tail = pieces.at(-1);
  const prev = pieces.at(-2);
  if (graphemeCount(tail) <= 4 && graphemeCount(prev) + graphemeCount(tail) <= Math.ceil(maxChars * 1.2)) {
    const tailAt = source.lastIndexOf(tail);
    const prevAt = source.lastIndexOf(prev, tailAt);
    if (tailAt >= 0 && prevAt >= 0) return [...pieces.slice(0, -2), source.slice(prevAt, tailAt + tail.length)];
  }
  return pieces;
}

/**
 * segments → timeline
 * @param {{text:string,startMs:number,endMs:number,tokens?:object[]}[]} segments
 * @param {{durationMs:number, maxChars?:number, minChunkMs?:number, holdMs?:number}} opts
 */
export function buildTimeline(segments, { durationMs, maxChars = MAX_CHARS_PER_CHUNK, minChunkMs = 600, holdMs = 350 } = {}) {
  const chunks = [];
  for (const segment of segments) {
    const clean = String(segment.text).replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const times = charTimes(clean, segment.tokens, segment.startMs, segment.endMs);
    let cursor = 0;
    for (const piece of mergeOrphanTail(chunkPhrases(clean, maxChars), maxChars, clean)) {
      const at = clean.indexOf(piece, cursor);
      if (at < 0) continue;
      cursor = at + piece.length;
      const lastChar = at + piece.length - 1;
      const words = segmentWords(piece).map((w) => {
        const trimmedEnd = w.s + w.text.trimEnd().length - 1;
        return {
          text: w.text.trim(),
          s: w.s,
          e: w.e,
          startMs: times[at + w.s].startMs,
          endMs: times[at + Math.max(w.s, trimmedEnd)].endMs,
          emphasis: false,
        };
      });
      if (!words.length) continue;
      chunks.push({
        text: piece,
        startMs: times[at].startMs,
        endMs: times[lastChar].endMs,
        words,
      });
    }
  }
  return finalizeTimeline(chunks, { durationMs, minChunkMs, holdMs });
}

/**
 * จัดเวลาให้อ่านได้จริง: ไม่ทับกัน ไม่สั้นจนกระพริบ ค้างไว้อีกนิดหลังพูดจบ
 * และไฮไลต์คำต่อเนื่องไม่มีช่องว่างกลางท่อน (ไม่งั้นคาราโอเกะจะดับเป็นช่วง ๆ)
 * ใช้ทั้งตอนสร้างครั้งแรกและหลังผู้ใช้แก้ในหน้าแก้ซับ
 */
export function finalizeTimeline(chunks, { durationMs, minChunkMs = 600, holdMs = 350 } = {}) {
  const sorted = chunks
    .filter((c) => c && String(c.text).trim() && c.words?.length)
    .map((c) => ({ ...c, words: c.words.map((w) => ({ ...w })) }))
    .sort((a, b) => a.startMs - b.startMs);
  const end = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : (sorted.at(-1)?.endMs ?? 0) + holdMs;

  sorted.forEach((c, i) => {
    const next = sorted[i + 1];
    const limit = next ? next.startMs : end;
    c.startMs = Math.max(0, Math.round(c.startMs));
    c.endMs = Math.round(Math.min(limit, Math.max(c.endMs + holdMs, c.startMs + minChunkMs)));
    if (c.endMs <= c.startMs) c.endMs = Math.min(end, c.startMs + 1);

    c.words.forEach((w, wi) => {
      w.startMs = Math.min(Math.max(Math.round(w.startMs), c.startMs), c.endMs);
      if (wi === 0) w.startMs = c.startMs;
    });
    for (let wi = 1; wi < c.words.length; wi += 1) {
      c.words[wi].startMs = Math.max(c.words[wi].startMs, c.words[wi - 1].startMs);
    }
    c.words.forEach((w, wi) => {
      w.endMs = wi < c.words.length - 1 ? c.words[wi + 1].startMs : c.endMs;
      if (w.endMs <= w.startMs) w.endMs = Math.min(c.endMs, w.startMs + 1);
    });
  });
  return { durationMs: Math.round(end), chunks: sorted };
}

/** ข้อความท่อนเปลี่ยน (ผู้ใช้แก้) → ตัดคำใหม่และแบ่งเวลาในช่วงเดิมตามจำนวนตัวอักษร */
export function rewordChunk(chunk, text) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  const words = segmentWords(clean);
  const weights = words.map((w) => Math.max(1, graphemeCount(w.text.trim())));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(1, chunk.endMs - chunk.startMs);
  let acc = chunk.startMs;
  return {
    ...chunk,
    text: clean,
    words: words.map((w, i) => {
      const startMs = Math.round(acc);
      acc += (weights[i] / total) * span;
      return { text: w.text.trim(), s: w.s, e: w.e, startMs, endMs: Math.round(acc), emphasis: false };
    }),
  };
}

/* ---------- ส่งออก ---------- */

function vttTime(ms) {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(t % 1000).padStart(3, "0")}`;
}

export function compileVtt(timeline) {
  return `WEBVTT\n\n${timeline.chunks
    .map((c) => `${vttTime(c.startMs)} --> ${vttTime(c.endMs)}\n${c.text}${c.sub ? `\n${c.sub}` : ""}\n`)
    .join("\n")}`;
}

export function compileText(timeline) {
  return `${timeline.chunks.map((c) => (c.sub ? `${c.text}\n${c.sub}` : c.text)).join("\n")}\n`;
}
