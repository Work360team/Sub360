// preflight — ตรวจเครื่องก่อนเปิด Sub360 (เรียกจาก เริ่มโปรแกรม.bat)
//
// ข้อความภาษาไทยอยู่ที่นี่ ไม่อยู่ในไฟล์ .bat เพราะ cmd.exe อ่านไฟล์ .bat ที่มีอักษร UTF-8
// หลายไบต์ผิดตำแหน่งหลัง chcp 65001 แล้วไปรันคำสั่งจากกลางบรรทัด (เจอจริง: 'dejs.org' is not
// recognized) ส่วน Node เขียนออกหน้าจอเป็น Unicode ตรง ๆ จึงแสดงภาษาไทยได้เสมอ
//
// จบด้วย exit code 0 = พร้อมเปิด · 1 = มีปัญหาที่ต้องแก้ก่อน (แสดงวิธีแก้แล้ว)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../pipeline/lib.mjs";
import { appVersion } from "../server/version.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ok = (msg) => console.log(`  [พร้อม] ${msg}`);
const warn = (msg) => console.log(`  [เตือน] ${msg}`);
const fail = (msg) => console.log(`  [ต้องแก้] ${msg}`);

console.log("\n  ========================================");
console.log("    Sub360 — ซับไทยสวย ๆ จากเสียงจริง");
console.log(`    เวอร์ชัน ${appVersion(ROOT).label}`);
console.log("  ========================================\n");

// Node รุ่นเก่ากว่านี้ไม่มี Intl.Segmenter ภาษาไทยและ AbortSignal.any ที่ระบบใช้
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  fail(`Node.js ${process.versions.node} เก่าเกินไป — ต้องใช้ 22.13 ขึ้นไป ดาวน์โหลดที่ https://nodejs.org`);
  process.exit(1);
}
ok(`Node.js ${process.versions.node}`);

// ติดตั้งแพ็กเกจครั้งแรก — HyperFrames ใช้กับสไตล์พรีเมียม ถ้าติดตั้งไม่ได้ก็ยังเปิดใช้สไตล์เร็วได้
if (!fs.existsSync(path.join(ROOT, "node_modules", "hyperframes", "package.json"))) {
  console.log("  กำลังติดตั้งส่วนประกอบครั้งแรก (ใช้เวลาสักครู่)...\n");
  // npm บนวินโดวส์เป็นไฟล์ .cmd ต้องเรียกผ่าน shell — อาร์กิวเมนต์เป็นค่าคงที่ จึงไม่มีอะไรให้แทรก
  const res = spawnSync("npm", ["install", "--no-fund", "--no-audit"], { cwd: ROOT, stdio: "inherit", shell: true });
  if (res.status !== 0) warn("ติดตั้งส่วนประกอบไม่สำเร็จ — สไตล์พรีเมียมจะใช้ไม่ได้ แต่สไตล์แบบเร็วยังใช้ได้");
  else ok("ติดตั้งส่วนประกอบแล้ว");
} else {
  ok("ส่วนประกอบพร้อม");
}

loadEnv(ROOT);
const ffmpeg = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"], { encoding: "utf8" });
if (ffmpeg.status === 0) ok("FFmpeg");
else warn("ยังไม่มี FFmpeg — หน้าตั้งค่าครั้งแรกในเบราว์เซอร์จะติดตั้งให้ (กดปุ่มเดียว)");

const cli = process.env.WHISPER_CLI_PATH;
const model = process.env.WHISPER_MODEL_PATH;
if (cli && model && fs.existsSync(cli) && fs.existsSync(model)) ok(`whisper.cpp (${path.basename(model)})`);
else warn("ยังไม่มีตัวถอดเสียง — หน้าตั้งค่าครั้งแรกในเบราว์เซอร์จะติดตั้งให้ (กดปุ่มเดียว)");

console.log("");
process.exit(0);
