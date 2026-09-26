// update — ดึงโค้ดล่าสุดด้วย git pull ก่อนเปิด Sub360 (เรียกจาก เริ่มโปรแกรม.bat)
//
// อัปเดตไม่ได้ (ไม่มีเน็ต ไม่มี git ดาวน์โหลดมาเป็น ZIP แก้ไฟล์ไว้เอง) ต้องไม่ขวางการเปิดโปรแกรม
// แค่เตือนแล้วเปิดรุ่นเดิมต่อ
//
// exit code: 0 = ใช้รุ่นเดิมต่อได้ · 3 = ได้โค้ดใหม่มาแล้ว ให้ .bat เริ่มตัวเองใหม่
// ต้องเริ่มใหม่เพราะ git pull อาจเขียนทับ เริ่มโปรแกรม.bat ที่ cmd.exe กำลังอ่านอยู่ — cmd อ่านไฟล์ .bat
// ทีละบรรทัดตามตำแหน่งไบต์ ถ้าไฟล์เปลี่ยนกลางทางจะไปรันคำสั่งจากกลางบรรทัด
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { appVersion, git } from "../server/version.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ok = (msg) => console.log(`  [อัปเดต] ${msg}`);
const warn = (msg) => console.log(`  [เตือน] ${msg}`);
const PULL_TIMEOUT = 90_000;

console.log("");
const before = appVersion(ROOT);

function keepCurrent(reason) {
  if (reason) warn(reason);
  ok(`ใช้เวอร์ชันปัจจุบัน ${before.label}`);
  process.exit(0);
}

if (process.env.SUB360_NO_UPDATE === "1") keepCurrent("ปิดการอัปเดตอัตโนมัติไว้ (SUB360_NO_UPDATE=1)");
if (!fs.existsSync(path.join(ROOT, ".git"))) {
  keepCurrent("โฟลเดอร์นี้ไม่ได้ติดตั้งด้วย git clone (เช่น ดาวน์โหลดเป็น ZIP) จึงอัปเดตอัตโนมัติไม่ได้");
}
if (!git(ROOT, ["--version"]).ok) {
  keepCurrent("ไม่พบ Git ในเครื่อง จึงอัปเดตอัตโนมัติไม่ได้ — ติดตั้งได้ที่ https://git-scm.com");
}
if (!git(ROOT, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).ok) {
  keepCurrent("โฟลเดอร์นี้ไม่ได้ผูกกับ branch บน GitHub จึงไม่รู้ว่าจะดึงรุ่นใหม่จากไหน");
}

const oldHead = git(ROOT, ["rev-parse", "HEAD"]).out;
console.log("  กำลังตรวจหาเวอร์ชันใหม่...");
// --ff-only: ไม่สร้าง merge commit ในเครื่องผู้ใช้ ถ้ามีคนแก้ไฟล์ไว้เองจนรวมไม่ได้ก็แค่ข้ามการอัปเดต
const pull = git(ROOT, ["pull", "--ff-only", "--quiet"], { timeout: PULL_TIMEOUT });
if (!pull.ok) {
  const detail = pull.err.split(/\r?\n/).find(Boolean) || "";
  keepCurrent(`อัปเดตไม่สำเร็จ (อาจไม่มีอินเทอร์เน็ต หรือมีไฟล์ถูกแก้ในเครื่อง)${detail ? `\n           ${detail}` : ""}`);
}

const newHead = git(ROOT, ["rev-parse", "HEAD"]).out;
if (!newHead || newHead === oldHead) {
  ok(`เป็นเวอร์ชันล่าสุดแล้ว ${before.label}`);
  process.exit(0);
}

const after = appVersion(ROOT);
ok(`อัปเดตแล้ว ${before.label} -> ${after.label}`);

// แพ็กเกจเปลี่ยน (เช่น HyperFrames รุ่นใหม่) — ติดตั้งให้ตรงก่อน ไม่งั้นสไตล์พรีเมียมจะใช้รุ่นเก่าค้างอยู่
const changed = git(ROOT, ["diff", "--name-only", oldHead, newHead]).out.split(/\r?\n/);
if (changed.some((file) => file === "package.json" || file === "package-lock.json")) {
  console.log("  กำลังติดตั้งส่วนประกอบรุ่นใหม่...\n");
  // npm บนวินโดวส์เป็นไฟล์ .cmd ต้องเรียกผ่าน shell — อาร์กิวเมนต์เป็นค่าคงที่ จึงไม่มีอะไรให้แทรก
  const res = spawnSync("npm", ["install", "--no-fund", "--no-audit"], { cwd: ROOT, stdio: "inherit", shell: true });
  if (res.status !== 0) warn("ติดตั้งส่วนประกอบรุ่นใหม่ไม่สำเร็จ — ลองปิดแล้วเปิดโปรแกรมใหม่อีกครั้ง");
}

process.exit(3);
