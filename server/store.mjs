// store — โปรเจกต์เก็บเป็นโฟลเดอร์ละงาน: data/projects/<id>/project.json + source + out/
//
// ไม่ใช้ SQLite แบบ Clip360 เพราะ Sub360 มีข้อมูลต่อโปรเจกต์ก้อนเดียว (timeline) และอยากให้
// ผู้ใช้เปิดโฟลเดอร์ดูไฟล์ผลลัพธ์ได้ตรง ๆ
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const ID_RE = /^[a-z0-9]{6,32}$/;

export function createStore(root) {
  const dir = path.join(root, "projects");
  fs.mkdirSync(dir, { recursive: true });

  const projectDir = (id) => {
    if (!ID_RE.test(String(id))) throw Object.assign(new Error("ไม่พบโปรเจกต์"), { status: 404 });
    return path.join(dir, id);
  };
  const file = (id) => path.join(projectDir(id), "project.json");

  function read(id) {
    try {
      return JSON.parse(fs.readFileSync(file(id), "utf8"));
    } catch {
      throw Object.assign(new Error("ไม่พบโปรเจกต์"), { status: 404 });
    }
  }

  function write(project) {
    project.updatedAt = new Date().toISOString();
    const target = file(project.id);
    const tmp = `${target}.tmp`;
    // เขียนไฟล์ชั่วคราวแล้วค่อยเปลี่ยนชื่อ — ไฟดับกลางทางจะไม่ได้ JSON ครึ่งไฟล์
    fs.writeFileSync(tmp, JSON.stringify(project, null, 2), "utf8");
    fs.renameSync(tmp, target);
    return project;
  }

  function create(fields) {
    const id = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
    fs.mkdirSync(path.join(dir, id, "out"), { recursive: true });
    return write({
      id,
      createdAt: new Date().toISOString(),
      title: "วิดีโอใหม่",
      status: "uploading",
      settings: { style: "karaoke-pop", colorSet: null, anchor: null, fontScale: 1, language: "th" },
      timeline: null,
      job: null,
      result: null,
      ...fields,
    });
  }

  function list() {
    return fs.readdirSync(dir)
      .filter((id) => ID_RE.test(id) && fs.existsSync(file(id)))
      .map((id) => {
        const p = read(id);
        const { timeline, segments, ...summary } = p;
        return { ...summary, chunkCount: timeline?.chunks?.length ?? 0 };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function remove(id) {
    fs.rmSync(projectDir(id), { recursive: true, force: true });
  }

  return { dir, projectDir, read, write, create, list, remove };
}
