#!/usr/bin/env node
// Sub360 CLI — วิดีโอเข้า ซับออก ใช้ทดสอบ pipeline โดยไม่ต้องเปิดหน้าเว็บ
//
//   node scripts/sub-cli.mjs input.mp4 [--style karaoke-pop] [--colors yellow-pop]
//        [--anchor bottom] [--scale 1] [--lang th] [--prompt "คำศัพท์"] [--out dir]
//        [--segments segments.json]   ข้ามการถอดเสียง ใช้ผลที่มีอยู่แล้ว
//        [--list]                     แสดงสไตล์ทั้งหมด
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../pipeline/lib.mjs";
import {
  CAPTION_COLOR_SETS, listStyles, probe, renderSubtitles, timelineForVideo, transcribeVideo,
} from "../pipeline/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(ROOT);

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

if (argv.includes("--list")) {
  for (const s of listStyles()) console.log(`${s.lane.padEnd(12)} ${s.slug.padEnd(24)} ${s.name}`);
  console.log("\nชุดสี:", CAPTION_COLOR_SETS.map((c) => c.id).join(", "));
  process.exit(0);
}

const input = argv.find((a, i) => !a.startsWith("--") && !(argv[i - 1] || "").startsWith("--"));
if (!input || !fs.existsSync(input)) {
  console.error("ใช้: node scripts/sub-cli.mjs <video> [--style slug] [--segments file.json] (ดู --list)");
  process.exit(1);
}

const styleSlug = flag("style", "karaoke-pop");
const outDir = path.resolve(flag("out", path.join(ROOT, "output", path.parse(input).name)));
fs.mkdirSync(outDir, { recursive: true });
const started = Date.now();
const log = async (stage, pct, message) => {
  process.stdout.write(`\r[${String(pct).padStart(3)}%] ${stage.padEnd(10)} ${message}`.padEnd(90));
};

let meta;
let segments;
if (flag("segments")) {
  segments = JSON.parse(fs.readFileSync(flag("segments"), "utf8"));
  meta = await probe(input);
} else {
  ({ meta, segments } = await transcribeVideo({
    input, workDir: outDir, language: flag("lang", "th"), prompt: flag("prompt", ""), onProgress: log,
  }));
  fs.writeFileSync(path.join(outDir, "segments.json"), JSON.stringify(segments, null, 2), "utf8");
  console.log(`\nถอดเสียงเสร็จใน ${((Date.now() - started) / 1000).toFixed(1)} วินาที`);
}

const timeline = timelineForVideo(segments, meta, { styleSlug, fontScale: Number(flag("scale", 1)) });
fs.writeFileSync(path.join(outDir, "timeline.json"), JSON.stringify(timeline, null, 2), "utf8");

const result = await renderSubtitles({
  input,
  workDir: outDir,
  timeline,
  meta,
  styleSlug,
  colorSet: flag("colors"),
  anchor: flag("anchor"),
  fontScale: Number(flag("scale", 1)),
  onProgress: log,
});
console.log(`\n\nเสร็จใน ${((Date.now() - started) / 1000).toFixed(1)} วินาที · เลน ${result.lane} · ${timeline.chunks.length} ท่อน`);
for (const w of result.warnings) console.log(`⚠ ${w}`);
for (const [k, v] of Object.entries(result.outputs)) console.log(`  ${k.padEnd(4)} ${v}`);
