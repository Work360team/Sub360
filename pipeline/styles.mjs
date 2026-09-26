// styles — โหลดสไตล์ซับ แล้วปรับให้เข้ากับวิดีโอจริง
//
// ไฟล์สไตล์จาก Clip360 ออกแบบบนจอแนวตั้ง 1080×1920 (ฟอนต์ 96px, ห่างขอบล่าง 400px)
// Sub360 รับวิดีโอทุกขนาด จึงต้องสเกลทุกค่าที่เป็นพิกเซลให้สัดส่วนบนจอเหมือนเดิม
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyColorSet, captionColorSet, CAPTION_COLOR_SETS } from "./caption-colors.mjs";
import { MAX_CHARS_PER_CHUNK, normalizeAnchor } from "./thai.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const STYLES_DIR = path.join(ROOT, "styles");
export const FONTS_DIR = path.join(ROOT, "fonts");
export { CAPTION_COLOR_SETS };

const REF_W = 1080;
const REF_H = 1920;

export function listStyles() {
  return fs.readdirSync(STYLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(STYLES_DIR, f), "utf8")))
    .sort((a, b) => (a.lane === b.lane ? a.slug.localeCompare(b.slug) : a.lane === "ass" ? -1 : 1));
}

export function loadStyle(slug) {
  const safe = String(slug || "karaoke-pop").replace(/[^a-z0-9-]/gi, "");
  const file = path.join(STYLES_DIR, `${safe}.json`);
  if (!fs.existsSync(file)) throw new Error(`ไม่รู้จักสไตล์ "${slug}"`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * สไตล์ + ขนาดวิดีโอ → สไตล์ที่พร้อมเรนเดอร์ และจำนวนตัวอักษรต่อท่อนที่เหมาะกับจอนี้
 *
 * แนวตั้ง: สเกลตามความกว้าง (ภาพ 720×1280 ได้ฟอนต์ 2/3 ของเดิม)
 * แนวนอน: สเกลตามความสูงแล้วลดลงอีก — ซับจอกว้างควรเล็กกว่าซับ TikTok มาก
 *         ไม่งั้นตัวอักษรกินจอไปครึ่งหนึ่ง แต่ได้พื้นที่แนวนอนมากขึ้นจึงใส่คำได้มากกว่า
 */
export function prepareStyle(style, { width, height, colorSet, anchor, fontScale = 1 } = {}) {
  const s = structuredClone(style);
  const p = s.params;
  const portrait = height >= width;
  const f = (portrait ? width / REF_W : (height / REF_W) * 0.72) * (Number(fontScale) || 1);
  const px = (v) => (typeof v === "number" ? Math.max(0, Math.round(v * f)) : v);

  p.font.size = px(p.font.size);
  if (p.outline) p.outline.width = px(p.outline.width);
  if (p.shadow?.offset != null) p.shadow.offset = px(p.shadow.offset);
  if (p.glow?.blur != null) p.glow.blur = px(p.glow.blur);
  if (p.glitch?.offset != null) p.glitch.offset = px(p.glitch.offset);
  if (p.wiggle?.amountPx != null) p.wiggle.amountPx = px(p.wiggle.amountPx);
  if (p.pill) {
    p.pill.padV = px(p.pill.padV ?? 18);
    p.pill.padH = px(p.pill.padH ?? 34);
    if ((p.pill.radius ?? 999) < 999) p.pill.radius = px(p.pill.radius);
  }

  p.position = { ...(p.position || {}) };
  if (anchor) p.position.anchor = normalizeAnchor(anchor);
  // ระยะจากขอบคิดเป็นสัดส่วนของความสูง — แนวนอนชิดขอบกว่าเพราะไม่มี UI แอปมาบัง
  const marginRatio = (p.position.marginV ?? 400) / REF_H;
  p.position.marginV = Math.round(height * marginRatio * (portrait ? 1 : 0.4));
  p.position.marginH = Math.round((p.position.marginH ?? 80) * (width / REF_W) * (portrait ? 1 : 0.6));

  // จอยิ่งกว้างเทียบกับขนาดฟอนต์ ยิ่งใส่ตัวอักษรต่อบรรทัดได้มาก
  const room = (width / REF_W) / f;
  if (p.fitChars) p.fitChars = Math.round(p.fitChars * room);
  const maxChars = Math.max(10, Math.min(36, Math.round((p.maxCharsPerLine ?? MAX_CHARS_PER_CHUNK) * room)));

  applyColorSet(p, captionColorSet(colorSet));
  return { style: s, maxChars };
}
