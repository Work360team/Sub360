// เวอร์ชันของ Sub360 — เลขจาก package.json + commit ที่ดึงมาล่าสุด
//
// เลขเวอร์ชันขยับเมื่อออกรุ่นใหม่ ส่วน commit เปลี่ยนทุกครั้งที่ git pull ได้ของใหม่
// จึงบอกได้เสมอว่าเครื่องนี้รันโค้ดชุดไหน แม้จะยังไม่ได้ขยับเลขเวอร์ชัน
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function git(root, args, options = {}) {
  const res = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    // ห้ามค้างรอพิมพ์รหัสผ่านในหน้าต่างดำ — ถ้าต้องยืนยันตัวตนให้ถือว่าอัปเดตไม่ได้แล้วเปิดโปรแกรมต่อ
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    ...options,
  });
  return { ok: res.status === 0, out: (res.stdout || "").trim(), err: (res.stderr || "").trim() || res.error?.message || "" };
}

export function appVersion(root) {
  let version = "0.0.0";
  try { version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version || version; } catch {}
  let commit = "";
  let date = "";
  if (fs.existsSync(path.join(root, ".git"))) {
    const head = git(root, ["log", "-1", "--format=%h %cs"]);
    if (head.ok) [commit = "", date = ""] = head.out.split(" ");
  }
  return { version, commit, date, label: formatVersion({ version, commit, date }) };
}

export function formatVersion({ version, commit, date }) {
  return `v${version}${commit ? ` (${commit}${date ? ` · ${date}` : ""})` : ""}`;
}
