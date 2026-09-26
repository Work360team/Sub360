// subfile — อ่านไฟล์ซับที่มีอยู่แล้ว (SRT / VTT / ASS) มาแต่งสไตล์โดยไม่ต้องถอดเสียงใหม่

const TIME = String.raw`(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})`;
const CUE_RE = new RegExp(`${TIME}\\s*-->\\s*${TIME}`);

const toMs = (h, m, s, frac) => ((Number(h || 0) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(String(frac).padEnd(3, "0").slice(0, 3));

/** ตัดแท็กจัดรูปแบบออก เหลือข้อความล้วน */
function cleanText(text) {
  return String(text)
    .replace(/\{\\[^}]*\}/g, "") // ASS override {\an8}
    .replace(/<[^>]+>/g, "") // <i> <b> <font> <c.yellow> ของ VTT
    .replace(/\\N|\\n/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAss(text) {
  const cues = [];
  let format = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^Format:/i.test(line) && format === null && /Start/i.test(line) && /Text/i.test(line)) {
      format = line.replace(/^Format:\s*/i, "").split(",").map((f) => f.trim().toLowerCase());
      continue;
    }
    if (!/^Dialogue:/i.test(line) || !format) continue;
    const values = line.replace(/^Dialogue:\s*/i, "").split(",");
    const textIndex = format.indexOf("text");
    const fields = Object.fromEntries(format.map((f, i) => [f, i === textIndex ? values.slice(i).join(",") : values[i]]));
    const t = (v) => {
      const m = /(\d+):(\d{2}):(\d{2})[.](\d{1,3})/.exec(String(v));
      return m ? toMs(m[1], m[2], m[3], m[4].padEnd(2, "0") + "0") : NaN;
    };
    cues.push({ startMs: t(fields.start), endMs: t(fields.end), text: cleanText(fields.text) });
  }
  return cues;
}

/**
 * @returns {{startMs:number,endMs:number,text:string}[]} เรียงตามเวลา ท่อนว่างและท่อนเวลาผิดถูกตัดออก
 */
export function parseSubtitles(input) {
  const text = String(input ?? "").replace(/^﻿/, "");
  let cues;
  if (/^\[Script Info\]/im.test(text) || /^Dialogue:/im.test(text)) {
    cues = parseAss(text);
  } else {
    cues = [];
    for (const block of text.split(/\r?\n\s*\r?\n/)) {
      const lines = block.split(/\r?\n/);
      const at = lines.findIndex((l) => CUE_RE.test(l));
      if (at < 0) continue;
      const m = CUE_RE.exec(lines[at]);
      cues.push({
        startMs: toMs(m[1], m[2], m[3], m[4]),
        endMs: toMs(m[5], m[6], m[7], m[8]),
        text: cleanText(lines.slice(at + 1).join(" ")),
      });
    }
  }
  const out = cues
    .filter((c) => c.text && Number.isFinite(c.startMs) && Number.isFinite(c.endMs) && c.endMs > c.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  if (!out.length) throw new Error("อ่านไฟล์ซับไม่ออก — รองรับ SRT, VTT และ ASS");
  return out;
}
