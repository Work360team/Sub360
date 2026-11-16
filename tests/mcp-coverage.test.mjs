// "AI controls Sub360 completely" = every route that changes something has an MCP tool, or a written
// reason why only the person may do it in the app (docs/MCP_PLAN.md §2). A new write route in
// server/index.mjs makes this test fail until someone decides which it is.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createTools } from "../server/mcp/tools.mjs";
import { listStyles, CAPTION_COLOR_SETS } from "../pipeline/styles.mjs";
import { TRANSLATE_LANGS } from "../pipeline/translate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// route (as written in server/index.mjs) → tool name, or { people: reason }
const COVERAGE = {
  'parts[2] === "ffmpeg" && method === "POST"': { people: "installing tools downloads and runs programs" },
  'parts[2] === "whisper" && method === "POST"': { people: "installing tools downloads and runs programs" },
  'parts[2] === "cloudflared" && method === "POST"': { people: "installing tools downloads and runs programs" },
  'parts[2] === "cancel" && method === "POST"': { people: "installs are started by the person" },
  'if (method === "PUT") {': { people: "Gemini API key — secrets never pass through chat" },
  'if (method === "DELETE") {\n      setEnvValue': { people: "Gemini API key — secrets never pass through chat" },
  'parts.length === 2 && method === "POST"': "create_project_from_file",
  'if (method === "DELETE") {\n      if (current': { people: "deleting a project removes every file and cannot be undone (decision 2)" },
  'if (method === "PATCH")': "update_project_settings",
  'action === "timeline" && method === "PUT"': "edit_subtitles",
  'action === "rechunk" && method === "POST"': "regroup_subtitles",
  'action === "import" && method === "POST"': "import_subtitles",
  'action === "transcribe" && method === "POST"': "transcribe_video",
  'action === "refine" && method === "POST"': "refine_subtitles_with_ai",
  'action === "translate" && method === "POST"': "translate_subtitles",
  'action === "render" && method === "POST"': "render_video",
  'action === "cancel" && method === "POST"': "cancel_job",
  '!rest.length && method === "PUT"': { people: "turning on cloud access and the tunnel token are the person's decision" },
  'rest[0] === "restart" && method === "POST"': { people: "tunnel control stays with the person" },
  'rest[0] === "pairing" && method === "POST"': { people: "a new AI app connection starts only from the person in the Sub360 window" },
  'rest[0] === "pairing" && method === "DELETE"': { people: "pairing is controlled by the person" },
  'rest[0] === "connections" && method === "DELETE"': { people: "cancelling connections is done by the person" },
};

const tools = createTools({
  api: null,
  catalog: { styles: listStyles, colorSets: CAPTION_COLOR_SETS, languages: TRANSLATE_LANGS },
  projectDir: () => ROOT,
  showProject: async () => ({}),
});

test("ทุก route ที่เปลี่ยนข้อมูลมี tool หรือเหตุผลที่ให้คนทำเอง", () => {
  const source = fs.readFileSync(path.join(ROOT, "server", "index.mjs"), "utf8").replace(/\r\n/g, "\n");
  const writes = source.match(/method === "(POST|PUT|PATCH|DELETE)"/g) || [];
  assert.equal(writes.length, Object.keys(COVERAGE).length,
    `server/index.mjs มี route เขียน ${writes.length} จุด แต่ COVERAGE มี ${Object.keys(COVERAGE).length} — เพิ่ม route ใหม่ใน COVERAGE และ docs/MCP_PLAN.md`);
  const names = new Set(tools.map((t) => t.name));
  for (const [route, target] of Object.entries(COVERAGE)) {
    assert.ok(source.includes(route), `ไม่พบ route นี้ใน server/index.mjs แล้ว: ${route}`);
    if (typeof target === "string") assert.ok(names.has(target), `${route} อ้าง tool ${target} ที่ไม่มีอยู่`);
    else assert.ok(target.people?.length > 10, `${route} ต้องมีเหตุผล`);
  }
  // tool เขียนทุกตัวต้องผูกกับ route จริง (ไม่มีทางลัดที่ข้าม /api)
  const mapped = new Set(Object.values(COVERAGE).filter((t) => typeof t === "string"));
  for (const t of tools.filter((x) => x.kind !== "read")) assert.ok(mapped.has(t.name), `${t.name} ไม่ได้ผูกกับ route ใน COVERAGE`);
});

test("กติกาความปลอดภัยของ tools", () => {
  for (const t of tools) {
    assert.match(t.name, /^[a-z]+(_[a-z0-9]+)+$/, `${t.name} ต้องเป็น verb_noun`);
    assert.doesNotMatch(t.name, /delete|purge|remove|sql|shell|exec|export|key|token|install|update_app/i, `${t.name} ชื่อต้องห้าม`);
    assert.ok(t.description.length >= 40, `${t.name} description สั้นไป`);
    assert.ok(["read", "write", "destructive"].includes(t.kind), `${t.name} kind ไม่ถูก`);
    if (t.kind === "destructive") assert.ok(t.confirm, `${t.name} destructive ต้องมีขั้นยืนยัน`);
    if (t.openWorld) assert.ok(t.confirm, `${t.name} ส่งข้อมูลออกนอกเครื่อง ต้องมีขั้นยืนยัน`);
  }
  const editsExisting = tools.find((t) => t.name === "edit_subtitles");
  assert.ok(editsExisting.required.includes("version"), "แก้ซับต้องส่ง version");
});
