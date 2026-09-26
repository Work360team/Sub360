import assert from "node:assert/strict";
import test from "node:test";
import { parseSubtitles } from "../pipeline/subfile.mjs";
import { planWindows } from "../pipeline/refine.mjs";
import { extractJson, geminiKeys } from "../pipeline/gemini.mjs";
import { chunkPhrases } from "../pipeline/timeline.mjs";

test("parseSubtitles อ่าน SRT หลายบรรทัดและตัดแท็ก", () => {
  const cues = parseSubtitles("﻿1\r\n00:00:01,500 --> 00:00:03,000\r\n<i>สวัสดี</i>\r\nครับ\r\n\r\n2\r\n00:00:03,200 --> 00:00:04,000\r\n{\\an8}ทดสอบ\r\n");
  assert.deepEqual(cues, [
    { startMs: 1500, endMs: 3000, text: "สวัสดี ครับ" },
    { startMs: 3200, endMs: 4000, text: "ทดสอบ" },
  ]);
});

test("parseSubtitles อ่าน VTT ที่ไม่มีชั่วโมง", () => {
  const cues = parseSubtitles("WEBVTT\n\n00:01.000 --> 00:02.500 align:center\n<c.yellow>Hello</c> world\n");
  assert.deepEqual(cues, [{ startMs: 1000, endMs: 2500, text: "Hello world" }]);
});

test("parseSubtitles อ่าน ASS", () => {
  const ass = "[Script Info]\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.20,0:00:02.00,Main,,0,0,0,,{\\c&H00FFFF&}คำ, ที่มีจุลภาค\n";
  assert.deepEqual(parseSubtitles(ass), [{ startMs: 1200, endMs: 2000, text: "คำ, ที่มีจุลภาค" }]);
});

test("parseSubtitles แจ้งเมื่ออ่านไม่ออก", () => {
  assert.throws(() => parseSubtitles("ไม่ใช่ไฟล์ซับ"), /อ่านไฟล์ซับไม่ออก/);
});

test("planWindows ไม่ตัดกลาง segment และจำกัดความยาวช่วง", () => {
  const segs = Array.from({ length: 30 }, (_, i) => ({ startMs: i * 20_000, endMs: i * 20_000 + 15_000, text: "x" }));
  const windows = planWindows(segs, { windowMs: 120_000 });
  assert.equal(windows.flatMap((w) => w.indexes).length, 30);
  for (const w of windows) assert.ok(w.endMs - w.startMs <= 120_000 + 300);
});

test("geminiKeys ตัดคีย์ซ้ำและอ่านช่องสำรอง", () => {
  const keys = geminiKeys({ GEMINI_API_KEY: "aaaa1111", GEMINI_API_KEY_2: "aaaa1111", GEMINI_API_KEY_3: "bbbb2222" });
  assert.deepEqual(keys.map((k) => k.last4), ["1111", "2222"]);
});

test("extractJson ทนคำตอบที่ห่อด้วย markdown", () => {
  assert.deepEqual(extractJson('```json\n{"lines":[]}\n```'), { lines: [] });
});

test("chunkPhrases แบ่งท่อนยาวพอ ๆ กัน", () => {
  const out = chunkPhrases("ลดการกินจุกจิก ยังมีส้ม 4 สายพันธุ์", 22);
  assert.deepEqual(out, ["ลดการกินจุกจิก", "ยังมีส้ม 4 สายพันธุ์"]);
});

import { compileSrt, bilingualLayout } from "../pipeline/ass.mjs";
import { compileVtt } from "../pipeline/timeline.mjs";
import { displayChunks, planPieces, sliceTimeline } from "../pipeline/index.mjs";

const chunk = (id, text, translation, startMs, endMs) => ({
  id, text, translation, startMs, endMs,
  words: [{ text, s: 0, e: text.length, startMs, endMs }],
});

test("displayChunks: สองภาษาใส่ sub · คำแปลอย่างเดียวแทนข้อความ · ต้นฉบับไม่มี sub", () => {
  const chunks = [chunk("a", "สวัสดี", "Hello there", 0, 1000), chunk("b", "ครับ", "", 1000, 2000)];
  const both = displayChunks(chunks, "both");
  assert.equal(both[0].sub, "Hello there");
  assert.equal(both[1].sub, undefined, "ท่อนที่ไม่มีคำแปลต้องไม่มีบรรทัดว่าง");
  const tr = displayChunks(chunks, "translation");
  assert.equal(tr[0].text, "Hello there");
  assert.equal(tr[0].words.length, 2);
  assert.equal(tr[1].text, "ครับ", "ไม่มีคำแปล → ใช้ต้นฉบับ");
  assert.equal(displayChunks(chunks, "original")[0].sub, undefined);
});

test("SRT และ VTT โหมดสองภาษามีบรรทัดคำแปลใต้ต้นฉบับ", () => {
  const tl = { durationMs: 2000, chunks: [{ ...chunk("a", "สวัสดี", "", 0, 1000), sub: "Hello" }] };
  assert.match(compileSrt(tl), /สวัสดี\nHello\n/);
  assert.match(compileVtt(tl), /สวัสดี\nHello\n/);
});

test("bilingualLayout ดันบรรทัดต้นฉบับขึ้นตามความสูงคำแปลจริง", () => {
  const base = { anchor: "bottom", marginV: 400, mainSize: 96, subSize: 56, width: 1080, height: 1920, marginH: 90 };
  const short = bilingualLayout("Hi", base);
  const long = bilingualLayout("A much longer English translation line that will need two rows", base);
  assert.equal(short.subMarginV, 400);
  assert.ok(long.mainMarginV > short.mainMarginV, "คำแปลสองบรรทัดต้องดันต้นฉบับสูงขึ้น");
  const top = bilingualLayout("Hi", { ...base, anchor: "top" });
  assert.equal(top.mainMarginV, 400);
  assert.ok(top.subMarginV > 400);
});

test("planPieces: จำนวนเฟรมรวมเท่าวิดีโอ และไม่ตัดกลางท่อน", () => {
  const chunks = [{ startMs: 58_000, endMs: 63_500 }, { startMs: 118_000, endMs: 121_000 }];
  const pieces = planPieces(chunks, 190_000, 30);
  assert.equal(pieces.reduce((n, p) => n + p.frames, 0), 190 * 30);
  for (const p of pieces.slice(1)) {
    assert.ok(!chunks.some((c) => c.startMs < p.startMs && p.startMs < c.endMs), `ตัดกลางท่อนที่ ${p.startMs}`);
  }
});

test("sliceTimeline เลื่อนเวลาให้เริ่มที่ 0 และตัดท่อนที่คร่อมขอบ", () => {
  const out = sliceTimeline([chunk("a", "x", "", 55_000, 65_000)], 60_000, 120_000);
  assert.equal(out[0].startMs, 0);
  assert.equal(out[0].endMs, 5_000);
});
