import assert from "node:assert/strict";
import test from "node:test";
import { buildTimeline, charTimes, finalizeTimeline, rewordChunk } from "../pipeline/timeline.mjs";
import { parseWhisperJson } from "../pipeline/transcribe.mjs";
import { loadStyle, prepareStyle } from "../pipeline/styles.mjs";

test("charTimes ใช้เวลาจริงของ token และข้ามอักษรที่แตกเป็น U+FFFD", () => {
  const tokens = [
    { text: "สวัส", startMs: 0, endMs: 400 },
    { text: "�", startMs: 400, endMs: 500 },
    { text: "ดี", startMs: 500, endMs: 800 },
  ];
  const times = charTimes("สวัสดี", tokens, 0, 800);
  assert.equal(times.length, 6);
  assert.equal(times[0].startMs, 0);
  assert.equal(times[4].startMs, 500);
  for (let i = 1; i < times.length; i += 1) assert.ok(times[i].startMs >= times[i - 1].startMs);
});

test("charTimes เติมเวลาเมื่อไม่มี token เลย (เช่นผู้ใช้แก้ข้อความ)", () => {
  const times = charTimes("abcd", [], 1000, 2000);
  assert.equal(times[0].startMs, 1000);
  assert.equal(times.at(-1).endMs, 2000);
});

test("buildTimeline ตัดท่อนและไม่ให้เวลาทับกัน", () => {
  const segments = [
    { text: "วันนี้เราจะมาสอนทำซับไตเติ้ลให้กับวิดีโอแบบง่ายที่สุดกันครับ", startMs: 0, endMs: 4000, tokens: [] },
    { text: "เริ่มกันเลย", startMs: 4100, endMs: 5000, tokens: [] },
  ];
  const tl = buildTimeline(segments, { durationMs: 6000 });
  assert.ok(tl.chunks.length >= 3);
  for (let i = 1; i < tl.chunks.length; i += 1) assert.ok(tl.chunks[i].startMs >= tl.chunks[i - 1].endMs);
  for (const c of tl.chunks) {
    assert.equal(c.words[0].startMs, c.startMs);
    assert.equal(c.words.at(-1).endMs, c.endMs);
    for (const w of c.words) assert.equal(c.text.slice(w.s, w.e).trim(), w.text);
  }
});

test("rewordChunk + finalizeTimeline หลังแก้ข้อความ", () => {
  const tl = buildTimeline([{ text: "สวัสดีครับ", startMs: 0, endMs: 1000, tokens: [] }], { durationMs: 2000 });
  const edited = rewordChunk(tl.chunks[0], "สวัสดีค่ะ ทุกคน");
  const out = finalizeTimeline([edited], { durationMs: 2000 });
  assert.equal(out.chunks[0].text, "สวัสดีค่ะ ทุกคน");
  assert.ok(out.chunks[0].words.length >= 2);
});

test("parseWhisperJson อ่านโครง -ojf", () => {
  const segs = parseWhisperJson({
    transcription: [{
      text: " ทดสอบ", offsets: { from: 0, to: 900 },
      tokens: [{ text: "[_BEG_]", offsets: { from: 0, to: 0 } }, { text: "ทดสอบ", offsets: { from: 0, to: 900 } }],
    }],
  });
  assert.equal(segs[0].text, "ทดสอบ");
  assert.equal(segs[0].tokens.length, 1);
});

test("prepareStyle สเกลตามจอ: แนวนอนฟอนต์เล็กลงแต่ใส่ตัวอักษรได้มากขึ้น", () => {
  const style = loadStyle("karaoke-pop");
  const portrait = prepareStyle(style, { width: 1080, height: 1920 });
  const landscape = prepareStyle(style, { width: 1920, height: 1080 });
  assert.equal(portrait.style.params.font.size, 96);
  assert.ok(landscape.style.params.font.size < 96);
  assert.ok(landscape.maxChars > portrait.maxChars);
  assert.equal(style.params.font.size, 96, "ต้องไม่แก้ต้นฉบับ");
});
