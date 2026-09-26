import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setEnvValue, whisperHome, WHISPER_MODELS } from "../server/setup.mjs";

test("whisperHome ไม่เลือกโฟลเดอร์ที่มีอักษรไทย (whisper.cpp เปิดไม่ได้)", () => {
  const home = whisperHome("D:\\งาน\\โปรแกรมทำซับ\\Subtitle");
  assert.match(home, /^[\x20-\x7E]+$/);
  assert.ok(!home.includes("โปรแกรม"));
});

test("whisperHome ใช้โฟลเดอร์โปรแกรมเองเมื่อชื่อเป็นอังกฤษ", () => {
  assert.equal(whisperHome("D:\\apps\\Sub360"), path.join("D:\\apps\\Sub360", "data", "bin", "whisper"));
});

test("setEnvValue แก้เฉพาะบรรทัดที่ต้องการ และลบได้", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-env-"));
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, "A=1\nWHISPER_CLI_PATH=old\nB=2\n");
  setEnvValue(file, "WHISPER_CLI_PATH", "C:\\new\\whisper-cli.exe");
  setEnvValue(file, "FFMPEG_PATH", "C:\\bin\\ffmpeg.exe");
  assert.equal(fs.readFileSync(file, "utf8"), "A=1\nWHISPER_CLI_PATH=C:\\new\\whisper-cli.exe\nB=2\nFFMPEG_PATH=C:\\bin\\ffmpeg.exe\n");
  setEnvValue(file, "B", "");
  assert.equal(fs.readFileSync(file, "utf8"), "A=1\nWHISPER_CLI_PATH=C:\\new\\whisper-cli.exe\nFFMPEG_PATH=C:\\bin\\ffmpeg.exe\n");
  assert.equal(process.env.FFMPEG_PATH, "C:\\bin\\ffmpeg.exe");
  delete process.env.FFMPEG_PATH;
  delete process.env.WHISPER_CLI_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
});

test("โมเดลที่เสนอให้เลือกมีขนาดจริงไว้บอกผู้ใช้", () => {
  for (const m of Object.values(WHISPER_MODELS)) {
    assert.match(m.file, /^ggml-.+\.bin$/);
    assert.ok(m.bytes > 1e9);
  }
});
