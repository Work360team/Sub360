import assert from "node:assert/strict";
import test from "node:test";
import { audioCandidates } from "../pipeline/render.mjs";

// ไฟล์จาก iPhone รุ่นใหม่: AAC สเตอริโอ (default) + Spatial Audio (apple_apac) ที่ ffmpeg ถอดรหัสไม่ได้ + เส้นข้อมูล mebx
const iphone = [
  { index: 0, codec_type: "video", codec_name: "hevc", disposition: { default: 1 } },
  { index: 1, codec_type: "audio", codec_name: "aac", disposition: { default: 1 } },
  { index: 2, codec_type: "audio", codec_name: "apple_apac", disposition: { default: 0 } },
  { index: 3, codec_type: "data", codec_name: "none", disposition: { default: 0 } },
];

test("audioCandidates: ลองเส้นที่เป็น default ก่อน แล้วตามลำดับในไฟล์ และไม่เอาเส้นภาพ/ข้อมูล", () => {
  assert.deepEqual(audioCandidates(iphone), [1, 2]);
  // เส้น default อยู่หลังเส้นที่ถอดไม่ได้ ก็ยังได้ลองก่อน
  const swapped = [iphone[0], { ...iphone[2], index: 1 }, { ...iphone[1], index: 2 }];
  assert.deepEqual(audioCandidates(swapped), [2, 1]);
  // ไม่มีเส้นไหนเป็น default — คงลำดับในไฟล์
  assert.deepEqual(audioCandidates([
    { index: 0, codec_type: "video" },
    { index: 1, codec_type: "audio" },
    { index: 2, codec_type: "audio" },
  ]), [1, 2]);
});

test("audioCandidates: วิดีโอไม่มีเสียง ได้รายการว่าง", () => {
  assert.deepEqual(audioCandidates([{ index: 0, codec_type: "video" }]), []);
});
