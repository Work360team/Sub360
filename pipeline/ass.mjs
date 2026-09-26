// ass — คอมไพล์ timeline + style เป็นไฟล์ซับ .ass (เลน A)  →  อนาคตคือ packages/media/ass
//
// หนึ่ง Dialogue event = หนึ่งคำที่ถูกไฮไลต์ ณ เวลานั้น
// ข้อความทั้งท่อนถูกวาดใหม่ทุก event โดยเปลี่ยนแค่สีของคำที่กำลังพูด → ได้เอฟเฟกต์คาราโอเกะ
import { assTime, srtTime } from "./lib.mjs";
import { anchorMarginV, normalizeAnchor } from "./thai.mjs";

/** numpad ของ ASS: 7-9 บน · 4-6 กลาง · 1-3 ล่าง (คอลัมน์กลางคือ 8 / 5 / 2) */
const ALIGNMENT = { top: 8, middle: 5, bottom: 2 };

/** #RRGGBB → &HAABBGGRR สำหรับบรรทัด Style (AA: 00 ทึบ, FF โปร่ง) */
function assColor(hex, alpha = 0) {
  const h = String(hex || "#FFFFFF").replace("#", "");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  const a = alpha.toString(16).padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

/**
 * #RRGGBB → &HBBGGRR& สำหรับ override tag กลางบรรทัด
 * ต่างจาก assColor: \c รับได้แค่ 6 หลักและต้องปิดท้ายด้วย & — ใส่ alpha เข้าไปแล้ว libass
 * จะ parse ไม่ผ่านแล้วเงียบ ๆ ถอยไปใช้สีของ style (ไฮไลต์หาย โดยไม่มี error ให้เห็น)
 */
function tagColor(hex) {
  const h = String(hex || "#FFFFFF").replace("#", "");
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
}

const escapeText = (s) =>
  String(s).replace(/\\/g, "/").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, "\\N");

const SUB_SCALE = 0.58;

/** ความกว้างโดยประมาณ (หน่วย em) — พอให้รู้ว่าคำแปลจะขึ้นกี่บรรทัด */
function textEm(text) {
  let em = 0;
  for (const ch of String(text)) {
    if (/[ัิ-ฺ็-๎]/.test(ch)) continue; // สระบน-ล่าง/วรรณยุกต์ไทย ไม่กินที่
    if (/[　-鿿가-힯＀-￯]/.test(ch)) em += 1; // จีน ญี่ปุ่น เกาหลี กว้างเต็มช่อง
    else if (ch === " ") em += 0.28;
    else em += 0.56;
  }
  return em;
}

/**
 * ตำแหน่งบรรทัดต้นฉบับ + คำแปล
 * ยึดล่าง: คำแปลอยู่ล่างสุด ต้นฉบับอยู่เหนือ · ยึดบน: ต้นฉบับบนสุด คำแปลตามลงมา
 * กลางจอ: ทั้งก้อนอยู่กลาง (ใช้ n2 ทั้งคู่แล้วคำนวณระยะจากขอบล่างเอง)
 * MarginV = 0 ใน Dialogue แปลว่า "ใช้ค่าของสไตล์" จึงบังคับขั้นต่ำ 1
 */
export function bilingualLayout(sub, { anchor, marginV, mainSize, subSize, width, height, marginH }) {
  const avail = Math.max(1, width - 2 * marginH);
  const subLines = Math.min(3, Math.max(1, Math.ceil((textEm(sub) * subSize) / avail)));
  const mainH = mainSize * 1.22;
  const subH = subLines * subSize * 1.22;
  const gap = subSize * 0.22;
  const r = (v) => Math.max(1, Math.round(v));
  if (anchor === "top") {
    return { mainMarginV: r(marginV), mainTag: "", subMarginV: r(marginV + mainH + gap), subTag: "\\an8" };
  }
  if (anchor === "middle") {
    const base = height / 2 - (mainH + gap + subH) / 2;
    return { mainMarginV: r(base + subH + gap), mainTag: "\\an2", subMarginV: r(base), subTag: "\\an2" };
  }
  return { mainMarginV: r(marginV + subH + gap), mainTag: "", subMarginV: r(marginV), subTag: "\\an2" };
}

export function compileAss(timeline, style, { width = 1080, height = 1920 } = {}) {
  const p = style.params;
  const font = p.font || {};
  const bold = (font.weight || 700) >= 700 ? -1 : 0;
  const borderStyle = p.box ? 3 : 1;
  const anchor = normalizeAnchor(p.position?.anchor);
  const marginV = anchorMarginV(anchor, p.position?.marginV);
  const mainSize = font.size || 96;
  const subSize = Math.round(mainSize * SUB_SCALE);
  const marginH = p.position?.marginH ?? 90;

  const head = [
    "[Script Info]",
    `; ${style.name} — สร้างโดย Sub360`,
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour," +
      " Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline," +
      " Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    [
      "Style: Main",
      font.family || "Kanit",
      font.size || 96,
      assColor(p.fill, p.fillAlpha ?? 0),
      assColor(p.activeFill),
      assColor(p.outline?.color || "#000000"),
      assColor(p.box?.color || "#000000", p.box?.alpha ?? 0x40),
      bold, 0, 0, 0,
      100, 100,
      p.spacing ?? 0, 0,
      borderStyle,
      p.outline?.width ?? 7,
      p.shadow?.offset ?? 3,
      ALIGNMENT[anchor],
      p.position?.marginH ?? 90,
      p.position?.marginH ?? 90,
      marginV,
      1,
    ].join(","),
    // บรรทัดคำแปล (โหมดสองภาษา) — ตัวเล็กกว่า ไม่มีไฮไลต์คาราโอเกะ
    [
      "Style: Sub",
      font.family || "Kanit",
      subSize,
      assColor(p.fill, p.fillAlpha ?? 0),
      assColor(p.fill),
      assColor(p.outline?.color || "#000000"),
      assColor(p.box?.color || "#000000", p.box?.alpha ?? 0x40),
      -1, 0, 0, 0,
      100, 100,
      0, 0,
      borderStyle,
      Math.round((p.outline?.width ?? 7) * 0.7),
      Math.round((p.shadow?.offset ?? 3) * 0.7),
      ALIGNMENT[anchor],
      p.position?.marginH ?? 90,
      p.position?.marginH ?? 90,
      marginV,
      1,
    ].join(","),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const anim = p.animation || {};
  const popScale = Math.round((anim.scale || 1) * 100);
  const popMs = anim.durationMs ?? 120;
  const idleAlpha = p.idleAlpha ?? null; // สไตล์แบบ "คำที่ยังไม่พูดจางไว้ก่อน"

  const events = [];
  for (const chunk of timeline.chunks) {
    const words = chunk.words;
    // สองภาษา: จัดตำแหน่งเองทีละท่อน เพราะคำแปลยาวไม่เท่ากัน (อังกฤษอาจขึ้นสองบรรทัด)
    // ต้องดันบรรทัดต้นฉบับหลบให้พอดีกับความสูงคำแปลของท่อนนั้นจริง ๆ
    let mainMargin = 0;
    let mainTag = "";
    if (chunk.sub) {
      const lay = bilingualLayout(chunk.sub, { anchor, marginV, mainSize, subSize, width, height, marginH });
      mainMargin = lay.mainMarginV;
      mainTag = lay.mainTag;
      const fade = p.fadeMs ?? 70;
      events.push(
        `Dialogue: 0,${assTime(chunk.startMs)},${assTime(chunk.endMs)},Sub,,0,0,${lay.subMarginV},,` +
        `{${lay.subTag}\\q0${fade ? `\\fad(${fade},${fade})` : ""}}${escapeText(chunk.sub)}`,
      );
    }
    words.forEach((w, wi) => {
      const isFirst = wi === 0;
      const isLast = wi === words.length - 1;
      const pre = escapeText(chunk.text.slice(0, w.s));
      const mid = escapeText(chunk.text.slice(w.s, w.e));
      const post = escapeText(chunk.text.slice(w.e));

      const lead = [];
      if (isFirst && (p.fadeMs ?? 70)) lead.push(`\\fad(${p.fadeMs ?? 70},0)`);
      if (isLast && (p.fadeMs ?? 70)) lead.push(`\\fad(0,${p.fadeMs ?? 70})`);

      const activeTags = [`\\c${tagColor(p.activeFill)}`];
      if (idleAlpha !== null) activeTags.push(`\\1a&H00&`);
      if (anim.enter === "pop" && popScale !== 100) {
        activeTags.push(`\\fscx${popScale}\\fscy${popScale}\\t(0,${popMs},\\fscx100\\fscy100)`);
      }
      if (w.emphasis && p.emphasisFill) activeTags[0] = `\\c${tagColor(p.emphasisFill)}`;

      const resetTags = [`\\c${tagColor(p.fill)}`];
      if (idleAlpha !== null) resetTags.push(`\\1a&H${idleAlpha.toString(16).padStart(2, "0").toUpperCase()}&`);

      const prefixTags = idleAlpha !== null ? `{\\1a&H${idleAlpha.toString(16).padStart(2, "0").toUpperCase()}&}` : "";
      if (mainTag) lead.unshift(mainTag);
      const text =
        (lead.length ? `{${lead.join("")}}` : "") +
        (pre ? prefixTags + pre : "") +
        `{${activeTags.join("")}}${mid}{${resetTags.join("")}}` +
        post;

      events.push(
        `Dialogue: 0,${assTime(w.startMs)},${assTime(w.endMs)},Main,,0,0,${mainMargin},,${text}`,
      );
    });
  }

  return `${head.concat(events).join("\n")}\n`;
}

export function compileSrt(timeline) {
  return timeline.chunks
    .map((c, i) => `${i + 1}\n${srtTime(c.startMs)} --> ${srtTime(c.endMs)}\n${c.text}${c.sub ? `\n${c.sub}` : ""}\n`)
    .join("\n");
}
