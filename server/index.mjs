// Sub360 local server — ฟังเฉพาะ 127.0.0.1 วิดีโอและซับไม่ออกจากเครื่อง
// (ยกเว้นเมื่อผู้ใช้สั่ง "ขัดเกลาด้วย AI" หรือ "แปล" เอง — ตอนนั้นเสียง/ข้อความถูกส่งไป Gemini)
//
// งานหนักเข้าคิวทีละงาน เพราะถอดเสียง/เรนเดอร์ใช้ GPU/CPU เต็มเครื่อง
// รันพร้อมกันไม่ได้เร็วขึ้น แค่ช้าลงทั้งสองงาน
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline as streamPipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { ffmpeg, loadEnv } from "../pipeline/lib.mjs";
import {
  CAPTION_COLOR_SETS, TRANSLATE_LANGS, finalizeTimeline, geminiKeys, geminiModel, geminiReady, listStyles,
  loadStyle, parseSubtitles, prepareStyle, probe, refineSegments, renderSubtitles, rewordChunk,
  timelineForVideo, transcribeVideo, translateChunks, whisperReady,
} from "../pipeline/index.mjs";
import { createStore } from "./store.mjs";
import {
  cancelInstall, exposeBinOnPath, homeDir, installFfmpeg, installWhisper, invalidateSetupStatus, setEnvValue as writeEnv, setupStatus,
} from "./setup.mjs";
import { appVersion } from "./version.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// ที่เก็บงานและการตั้งค่า — แยกจากโค้ดได้ด้วย SUB360_HOME (แอป Windows ใช้ %LOCALAPPDATA%\Sub360)
const HOME = homeDir(ROOT);
fs.mkdirSync(HOME, { recursive: true });
const ENV_FILE = path.join(HOME, ".env");
loadEnv(HOME);
// FFmpeg ที่หน้าตั้งค่าติดตั้งไว้ใน data/bin — ใส่ใน PATH ให้ HyperFrames (โปรแกรมลูก) หาเจอด้วย
exposeBinOnPath(ROOT);
const PUBLIC = path.join(ROOT, "public");
// อ่านครั้งเดียวตอนเปิด — โค้ดใหม่จาก git pull มีผลหลังเปิดโปรแกรมใหม่อยู่แล้ว
const VERSION = appVersion(ROOT);
const HOST = "127.0.0.1";
const MAX_UPLOAD = 8 * 1024 ** 3;
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"]);
const JOB_TYPES = new Set(["transcribe", "refine", "translate", "render"]);
// SUB360_DATA_DIR ใช้ทดสอบกับสำเนาข้อมูลได้ โดยไม่ยุ่งกับโปรเจกต์จริงที่อีกตัวกำลังเปิดอยู่
const store = createStore(process.env.SUB360_DATA_DIR ? path.resolve(process.env.SUB360_DATA_DIR) : path.join(HOME, "data"));

/* ---------- คิวงาน ---------- */

const queue = [];
let current = null;

function setJob(id, patch) {
  const p = store.read(id);
  p.job = { ...(p.job || {}), ...patch, at: Date.now() };
  return store.write(p);
}

function enqueue(id, type, options = {}) {
  if (!JOB_TYPES.has(type)) throw httpError(400, "ไม่รู้จักงานนี้");
  const p = store.read(id);
  if (p.job && ["queued", "running"].includes(p.job.state)) throw httpError(409, "โปรเจกต์นี้มีงานค้างอยู่แล้ว รอให้เสร็จก่อน");
  if ((type === "refine" || type === "translate") && !geminiReady()) {
    throw httpError(409, "ยังไม่ได้ใส่ Gemini API key — ไปที่หน้าตั้งค่าก่อน");
  }
  setJob(id, { type, state: "queued", pct: 0, stage: "queued", message: "รอคิว", error: null, options });
  queue.push({ id, type, options });
  pump();
}

async function pump() {
  if (current || !queue.length) return;
  const job = queue.shift();
  const controller = new AbortController();
  current = { ...job, controller };
  let lastWrite = 0;
  let lastMessage = "";
  const onProgress = async (stage, pct, message) => {
    // เขียนดิสก์ไม่เกินวินาทีละ 3 ครั้ง ffmpeg รายงานถี่มาก — แต่ข้อความใหม่ต้องผ่านเสมอ
    // ไม่งั้นขั้นที่นานที่สุด (เรนเดอร์ HyperFrames) จะค้างป้ายของขั้นก่อนหน้า
    if (message === lastMessage && Date.now() - lastWrite < 300 && pct < 100) return;
    lastWrite = Date.now();
    lastMessage = message;
    setJob(job.id, { state: "running", stage, pct, message });
  };
  const runners = { transcribe: runTranscribe, refine: runRefine, translate: runTranslate, render: runRender };
  try {
    setJob(job.id, { state: "running", pct: 1, stage: "start", message: "เริ่มงาน" });
    const note = await runners[job.type](job.id, controller.signal, onProgress, job.options || {});
    setJob(job.id, { state: "done", pct: 100, stage: "done", message: "เสร็จแล้ว", note: note || null });
  } catch (error) {
    const canceled = error?.name === "AbortError";
    console.error(`[${job.type}] ${job.id}:`, error?.message);
    try {
      setJob(job.id, { state: canceled ? "canceled" : "failed", message: canceled ? "ยกเลิกแล้ว" : "ทำไม่สำเร็จ", error: canceled ? null : String(error?.message || error) });
      const p = store.read(job.id);
      if (job.type === "transcribe" && !p.timeline) store.write({ ...p, status: canceled ? "uploaded" : "failed" });
    } catch { /* โปรเจกต์ถูกลบระหว่างทำงาน */ }
  } finally {
    current = null;
    pump();
  }
}

function sourcePath(p) {
  return path.join(store.projectDir(p.id), p.source.file);
}

const buildFor = (p, segments, meta = p.meta) => withIds(timelineForVideo(segments, meta, {
  styleSlug: p.settings.style, fontScale: p.settings.fontScale,
}));

async function runTranscribe(id, signal, onProgress) {
  const p = store.read(id);
  const { meta, segments } = await transcribeVideo({
    input: sourcePath(p),
    workDir: path.join(store.projectDir(id), "work"),
    language: p.settings.language || "th",
    prompt: p.settings.prompt || "",
    signal,
    onProgress,
  });
  let finalSegments = segments;
  let note = null;
  let refined = null;
  // ขัดเกลาต่อเลยถ้าผู้ใช้เลือกไว้ตอนอัปโหลด — ล้มก็ยังได้ซับจาก whisper ไม่ทำให้ทั้งงานล้ม
  if (p.settings.aiRefine && geminiReady()) {
    try {
      // ในงานเดียวกับการถอดเสียง แถบความคืบหน้าต้องเดินต่อ ไม่ใช่ย้อนกลับไปเริ่มที่ 5%
      const res = await refineSegments(segments, {
        videoFile: sourcePath(p), language: p.settings.language, glossary: p.settings.prompt, signal,
        onProgress: (stage, pct, message) => onProgress(stage, Math.round(60 + pct * 0.38), message),
      });
      finalSegments = res.segments;
      refined = { at: Date.now(), ...res.stats };
      note = `AI แก้คำให้ ${res.stats.changed} บรรทัด`;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      note = `ถอดเสียงเสร็จ แต่ AI ขัดเกลาไม่สำเร็จ (${String(error.message).slice(0, 160)}) — กดขัดเกลาใหม่ได้ในขั้นแก้ซับ`;
    }
  }
  const next = store.read(id);
  store.write({
    ...next, meta, segments: finalSegments, whisperSegments: segments, refined,
    timeline: buildFor(next, finalSegments, meta), status: "ready", editedAt: Date.now(),
  });
  return note;
}

async function runRefine(id, signal, onProgress) {
  const p = store.read(id);
  // ขัดเกลาจากผล whisper ดิบเสมอ ไม่ใช่ผลที่ขัดไปแล้ว — กดซ้ำจะไม่ทำให้คำเพี้ยนสะสม
  const base = p.whisperSegments || p.segments;
  if (!base?.length) throw new Error("ยังไม่มีผลถอดเสียงให้ขัดเกลา");
  const res = await refineSegments(base, {
    videoFile: sourcePath(p), language: p.settings.language, glossary: p.settings.prompt, signal, onProgress,
  });
  const next = store.read(id);
  store.write({
    ...next, whisperSegments: base, segments: res.segments, refined: { at: Date.now(), ...res.stats },
    timeline: buildFor(next, res.segments), translation: null, editedAt: Date.now(),
  });
  return `AI แก้คำให้ ${res.stats.changed} บรรทัด${res.stats.dropped ? ` · ลบบรรทัดที่ไม่มีเสียงพูด ${res.stats.dropped} บรรทัด` : ""}`;
}

async function runTranslate(id, signal, onProgress, { to, onlyMissing = false } = {}) {
  const p = store.read(id);
  const chunks = p.timeline?.chunks || [];
  if (!chunks.length) throw new Error("ยังไม่มีซับให้แปล");
  const sameLang = p.translation?.lang === to;
  const targets = onlyMissing && sameLang ? chunks.filter((c) => !String(c.translation || "").trim()) : chunks;
  if (!targets.length) return "ทุกท่อนมีคำแปลอยู่แล้ว";
  const map = await translateChunks(targets.map((c) => ({ id: c.id, text: c.text })), {
    to, glossary: p.settings.prompt, signal, onProgress,
  });
  // อ่านโปรเจกต์ใหม่ก่อนเขียน — ระหว่างแปลผู้ใช้อาจแก้ท่อนอื่นอยู่
  const next = store.read(id);
  next.timeline.chunks = next.timeline.chunks.map((c) => {
    if (map.has(c.id)) return { ...c, translation: map.get(c.id) };
    return sameLang ? c : { ...c, translation: "" };
  });
  next.translation = { lang: to, at: Date.now() };
  if (!next.settings.display || next.settings.display === "original") next.settings.display = "both";
  next.editedAt = Date.now();
  store.write(next);
  return `แปลแล้ว ${map.size} ท่อน`;
}

async function runRender(id, signal, onProgress) {
  const p = store.read(id);
  if (!p.timeline?.chunks?.length) throw new Error("ยังไม่มีซับให้เรนเดอร์");
  const outDir = path.join(store.projectDir(id), "out");
  const result = await renderSubtitles({
    input: sourcePath(p),
    workDir: outDir,
    timeline: p.timeline,
    meta: p.meta,
    styleSlug: p.settings.style,
    colorSet: p.settings.colorSet,
    anchor: p.settings.anchor,
    fontScale: p.settings.fontScale,
    display: p.translation ? p.settings.display || "original" : "original",
    translationLang: p.translation?.lang || null,
    signal,
    onProgress,
  });
  const files = Object.fromEntries(Object.entries(result.outputs).map(([k, v]) => [k, path.basename(v)]));
  const next = store.read(id);
  store.write({
    ...next, status: "rendered",
    result: { files, lane: result.lane, warnings: result.warnings, style: result.style, display: p.settings.display, translationLang: result.translationLang, at: Date.now() },
  });
}

let seq = 0;
const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;
const withIds = (tl) => ({ ...tl, chunks: tl.chunks.map((c) => ({ id: c.id || newId(), ...c })) });

/**
 * รับ timeline ที่ผู้ใช้แก้จากหน้าเว็บ
 * ท่อนที่ข้อความเหมือนเดิมเก็บเวลาคำเดิมไว้ (ได้จาก whisper แม่นกว่า) ท่อนที่แก้ข้อความ
 * หรือขยับเวลาจะแบ่งเวลาคำใหม่ตามสัดส่วน · คำแปลแก้ได้อิสระ ไม่กระทบเวลา
 */
function mergeEditedTimeline(project, chunks) {
  if (!Array.isArray(chunks)) throw httpError(400, "chunks ต้องเป็นรายการ");
  const old = new Map((project.timeline?.chunks || []).map((c) => [c.id, c]));
  const next = chunks.slice(0, 5000).map((raw) => {
    const text = String(raw.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    const translation = String(raw.translation ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    const startMs = Math.max(0, Math.round(Number(raw.startMs) || 0));
    const endMs = Math.max(startMs + 100, Math.round(Number(raw.endMs) || 0));
    const prev = old.get(raw.id);
    if (prev && prev.text === text && prev.startMs === startMs && prev.endMs === endMs) return { ...prev, translation };
    const base = { id: prev ? raw.id : newId(), text, translation, startMs, endMs, words: [] };
    return text ? rewordChunk(base, text) : null;
  }).filter(Boolean);
  return finalizeTimeline(next, { durationMs: project.meta?.durationMs, holdMs: 0, minChunkMs: 200 });
}

/** นำเข้า SRT/VTT/ASS: หนึ่ง cue = หนึ่งท่อน (หรือแบ่งท่อนใหม่ให้พอดีจอถ้าเลือก) */
async function importSubtitles(project, text, { rechunk = false } = {}) {
  const cues = parseSubtitles(text);
  const meta = project.meta || await probe(sourcePath(project));
  const segments = cues.map((c) => ({ ...c, tokens: [] }));
  const timeline = rechunk
    ? buildFor(project, segments, meta)
    : withIds(finalizeTimeline(cues.map((c) => rewordChunk({ ...c, words: [] }, c.text)), { durationMs: meta.durationMs, holdMs: 0, minChunkMs: 200 }));
  return {
    ...project, meta, segments, whisperSegments: null, refined: null, translation: null, timeline,
    status: "ready", imported: { at: Date.now(), cues: cues.length }, editedAt: Date.now(),
  };
}

/* ---------- ตั้งค่า (.env) ---------- */

/** เขียน/ลบค่าเดียวใน .env โดยไม่แตะบรรทัดอื่น */
const setEnvValue = (key, value) => writeEnv(ENV_FILE, key, value);

async function checkGeminiKey(key) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(15_000),
  }).catch((error) => ({ ok: false, status: 0, text: async () => error.message }));
  if (res.ok) return;
  throw httpError(400, res.status === 400 || res.status === 403 ? "คีย์นี้ใช้ไม่ได้ — ตรวจว่าคัดลอกมาครบ" : `ตรวจคีย์ไม่สำเร็จ (${res.status})`);
}

function geminiStatus() {
  return {
    ready: geminiReady(),
    model: geminiModel(),
    keys: geminiKeys().map((k) => ({ slot: k.slot, last4: k.last4 })),
  };
}

/* ---------- HTTP ---------- */

/** โปรเจกต์ + สไตล์ที่สเกลตามวิดีโอแล้ว หน้าเว็บใช้วาดตัวอย่างซับให้ตรงกับที่จะเรนเดอร์ */
function view(project) {
  const { segments, whisperSegments, ...rest } = project;
  rest.canRefine = Boolean(whisperSegments?.length || (segments?.length && !project.imported));
  if (!project.meta) return rest;
  const s = project.settings;
  const { style } = prepareStyle(loadStyle(s.style), {
    width: project.meta.width, height: project.meta.height,
    colorSet: s.colorSet, anchor: s.anchor, fontScale: s.fontScale,
  });
  return { ...rest, preparedStyle: style };
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(data);
}

async function readJson(req, limit = 20 * 1024 * 1024) {
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > limit) throw httpError(413, "ข้อมูลใหญ่เกินไป");
    parts.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8") || "{}");
  } catch {
    throw httpError(400, "JSON ไม่ถูกต้อง");
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ttf": "font/ttf", ".woff2": "font/woff2",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska",
  ".srt": "text/plain; charset=utf-8", ".vtt": "text/vtt; charset=utf-8", ".ass": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};

/** ส่งไฟล์ รองรับ Range — จำเป็นสำหรับ <video> เลื่อนเวลาได้ */
function sendFile(req, res, file, { download = null, cache = "no-cache" } = {}) {
  let stat;
  try { stat = fs.statSync(file); } catch { return sendJson(res, 404, { error: "ไม่พบไฟล์" }); }
  const headers = {
    "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": cache,
  };
  if (download) headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(download)}`;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) {
      res.writeHead(416, { "content-range": `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${stat.size}`, "content-length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "content-length": stat.size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

async function toolStatus() {
  const setup = await setupStatus(ROOT);
  return {
    ffmpeg: setup.ffmpeg.ready,
    whisper: setup.whisper.ready,
    hyperframes: setup.hyperframes.ready,
    whisperModel: setup.whisper.modelName || "",
    gemini: geminiStatus(),
    setupReady: setup.ffmpeg.ready && setup.whisper.ready,
    version: VERSION,
  };
}

const DOWNLOADS = {
  mp4: { file: "final.mp4", suffix: "-sub360.mp4" },
  srt: { file: "captions.srt", suffix: ".srt" },
  srtTranslated: { file: "captions.translated.srt", suffix: ".translated.srt" },
  ass: { file: "captions.ass", suffix: ".ass" },
  vtt: { file: "captions.vtt", suffix: ".vtt" },
  txt: { file: "transcript.txt", suffix: ".txt" },
};

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const method = req.method;

  if (parts[1] === "status" && method === "GET") {
    return sendJson(res, 200, { ...(await toolStatus()), queue: queue.length, current: current?.id ?? null });
  }
  if (parts[1] === "styles" && method === "GET") {
    return sendJson(res, 200, { styles: listStyles(), colorSets: CAPTION_COLOR_SETS, languages: TRANSLATE_LANGS });
  }
  if (parts[1] === "setup") {
    if (parts[2] === "status" && method === "GET") {
      return sendJson(res, 200, { ...(await setupStatus(ROOT, { refresh: url.searchParams.has("refresh") })), gemini: geminiStatus() });
    }
    if (parts[2] === "ffmpeg" && method === "POST") return sendJson(res, 202, { installs: installFfmpeg(ROOT, ENV_FILE) });
    if (parts[2] === "whisper" && method === "POST") {
      const { model } = await readJson(req, 1024);
      return sendJson(res, 202, { installs: installWhisper(ROOT, ENV_FILE, model) });
    }
    if (parts[2] === "cancel" && method === "POST") {
      const { name } = await readJson(req, 1024);
      if (["ffmpeg", "whisper"].includes(name)) cancelInstall(name);
      return sendJson(res, 200, { ok: true });
    }
  }
  if (parts[1] === "settings" && parts[2] === "gemini") {
    if (method === "GET") return sendJson(res, 200, geminiStatus());
    if (method === "PUT") {
      const { key } = await readJson(req, 4096);
      const clean = String(key || "").trim();
      if (!/^[A-Za-z0-9_\-.]{20,200}$/.test(clean)) throw httpError(400, "รูปแบบคีย์ไม่ถูกต้อง");
      await checkGeminiKey(clean);
      setEnvValue("GEMINI_API_KEY", clean);
      invalidateSetupStatus();
      return sendJson(res, 200, geminiStatus());
    }
    if (method === "DELETE") {
      setEnvValue("GEMINI_API_KEY", "");
      delete process.env.GOOGLE_API_KEY;
      return sendJson(res, 200, geminiStatus());
    }
  }
  if (parts[1] !== "projects") throw httpError(404, "ไม่พบ API");

  if (parts.length === 2 && method === "GET") return sendJson(res, 200, { projects: store.list() });

  // อัปโหลด: ส่งไฟล์ดิบใน body ชื่อไฟล์อยู่ใน header — ไม่ต้อง parse multipart และสตรีมลงดิสก์ได้ทันที
  if (parts.length === 2 && method === "POST") {
    const name = decodeURIComponent(String(req.headers["x-filename"] || "video.mp4")).slice(0, 200);
    const ext = path.extname(name).toLowerCase();
    if (!VIDEO_EXT.has(ext)) throw httpError(415, `ไม่รองรับไฟล์ ${ext || "นี้"} (ใช้ได้: ${[...VIDEO_EXT].join(" ")})`);
    const length = Number(req.headers["content-length"] || 0);
    if (length > MAX_UPLOAD) throw httpError(413, "ไฟล์ใหญ่เกิน 8 GB");
    const language = ["th", "en", "auto"].includes(req.headers["x-language"]) ? req.headers["x-language"] : "th";
    const skipTranscribe = req.headers["x-skip-transcribe"] === "1";
    const project = store.create({
      title: path.parse(name).name.slice(0, 120) || "วิดีโอใหม่",
      source: { file: `source${ext}`, name, size: length },
    });
    project.settings.language = language;
    project.settings.aiRefine = req.headers["x-ai-refine"] === "1" && geminiReady();
    // สไตล์เริ่มต้นที่ผู้ใช้เลือกไว้ในคลังสไตล์ — มีผลกับการแบ่งท่อนตั้งแต่ถอดเสียงเสร็จ
    const style = String(req.headers["x-style"] || "");
    if (listStyles().some((s) => s.slug === style)) project.settings.style = style;
    const glossary = decodeURIComponent(String(req.headers["x-glossary"] || "")).slice(0, 400);
    if (glossary) project.settings.prompt = glossary;
    store.write(project);
    const dest = path.join(store.projectDir(project.id), `source${ext}`);
    try {
      await streamPipeline(req, fs.createWriteStream(dest));
    } catch (error) {
      store.remove(project.id);
      throw error;
    }
    let meta = null;
    try { meta = await probe(dest); } catch (error) {
      store.remove(project.id);
      throw httpError(415, `เปิดไฟล์วิดีโอนี้ไม่ได้: ${String(error.message).slice(0, 160)}`);
    }
    store.write({ ...store.read(project.id), meta, status: "uploaded" });
    if (!skipTranscribe) enqueue(project.id, "transcribe");
    return sendJson(res, 201, { project: view(store.read(project.id)) });
  }

  const id = parts[2];
  const project = store.read(id);

  if (parts.length === 3) {
    if (method === "GET") return sendJson(res, 200, { project: view(project) });
    if (method === "DELETE") {
      if (current?.id === id) current.controller.abort();
      const i = queue.findIndex((j) => j.id === id);
      if (i >= 0) queue.splice(i, 1);
      store.remove(id);
      return sendJson(res, 200, { ok: true });
    }
    if (method === "PATCH") {
      const body = await readJson(req);
      if (typeof body.title === "string") project.title = body.title.trim().slice(0, 120) || project.title;
      if (body.settings && typeof body.settings === "object") {
        const s = body.settings;
        const styles = new Set(listStyles().map((x) => x.slug));
        if (s.style && styles.has(s.style)) project.settings.style = s.style;
        if ("colorSet" in s) project.settings.colorSet = CAPTION_COLOR_SETS.some((c) => c.id === s.colorSet) ? s.colorSet : null;
        if ("anchor" in s) project.settings.anchor = ["top", "middle", "bottom"].includes(s.anchor) ? s.anchor : null;
        if (s.fontScale != null) project.settings.fontScale = Math.min(1.8, Math.max(0.5, Number(s.fontScale) || 1));
        if (typeof s.prompt === "string") project.settings.prompt = s.prompt.slice(0, 400);
        if (["th", "en", "auto"].includes(s.language)) project.settings.language = s.language;
        if (["original", "translation", "both"].includes(s.display)) project.settings.display = s.display;
        // เวลาที่แก้ของที่มีผลต่อวิดีโอ — หน้าเว็บใช้เตือนว่าไฟล์ที่เรนเดอร์ไว้ไม่ตรงแล้ว
        project.editedAt = Date.now();
      }
      return sendJson(res, 200, { project: view(store.write(project)) });
    }
  }

  const action = parts[3];
  const busy = () => project.job && ["queued", "running"].includes(project.job.state);
  if (action === "timeline" && method === "PUT") {
    if (busy() && ["refine", "translate", "transcribe"].includes(project.job.type)) {
      throw httpError(409, "AI กำลังทำงานกับซับนี้อยู่ รอสักครู่แล้วแก้ต่อได้");
    }
    const body = await readJson(req);
    project.timeline = withIds(mergeEditedTimeline(project, body.chunks));
    project.editedAt = Date.now();
    return sendJson(res, 200, { project: view(store.write(project)) });
  }
  if (action === "rechunk" && method === "POST") {
    // แบ่งท่อนใหม่จากผลถอดเสียงเดิม (เช่นหลังเปลี่ยนขนาดตัวอักษร) — ทับการแก้ไขทั้งหมด
    const full = store.read(id);
    if (!full.segments) throw httpError(409, "ยังไม่มีผลถอดเสียง");
    full.timeline = buildFor(full, full.segments);
    full.translation = null;
    full.editedAt = Date.now();
    return sendJson(res, 200, { project: view(store.write(full)) });
  }
  if (action === "import" && method === "POST") {
    if (busy()) {
      if (project.job.type !== "transcribe") throw httpError(409, "โปรเจกต์นี้มีงานค้างอยู่ รอให้เสร็จก่อน");
      // นำเข้าไฟล์ซับแทนการถอดเสียง — หยุดงานถอดเสียงที่รออยู่
      if (current?.id === id) current.controller.abort();
      const i = queue.findIndex((j) => j.id === id);
      if (i >= 0) queue.splice(i, 1);
    }
    const body = await readJson(req, 5 * 1024 * 1024);
    let next;
    try {
      next = await importSubtitles(store.read(id), body.text, { rechunk: Boolean(body.rechunk) });
    } catch (error) {
      throw httpError(400, error.message);
    }
    next.job = { type: "import", state: "done", pct: 100, message: `นำเข้า ${next.imported.cues} ท่อน`, at: Date.now() };
    return sendJson(res, 200, { project: view(store.write(next)) });
  }
  if (action === "transcribe" && method === "POST") {
    enqueue(id, "transcribe");
    return sendJson(res, 202, { project: view(store.read(id)) });
  }
  if (action === "refine" && method === "POST") {
    if (!store.read(id).segments?.length) throw httpError(409, "ยังไม่มีผลถอดเสียง");
    enqueue(id, "refine");
    return sendJson(res, 202, { project: view(store.read(id)) });
  }
  if (action === "translate" && method === "POST") {
    const body = await readJson(req, 4096);
    if (!TRANSLATE_LANGS.some((l) => l.id === body.to)) throw httpError(400, "เลือกภาษาที่จะแปลก่อน");
    if (!project.timeline?.chunks?.length) throw httpError(409, "ยังไม่มีซับให้แปล");
    enqueue(id, "translate", { to: body.to, onlyMissing: Boolean(body.onlyMissing) });
    return sendJson(res, 202, { project: view(store.read(id)) });
  }
  if (action === "render" && method === "POST") {
    if (!project.timeline?.chunks?.length) throw httpError(409, "ยังไม่มีซับ");
    enqueue(id, "render");
    return sendJson(res, 202, { project: view(store.read(id)) });
  }
  if (action === "cancel" && method === "POST") {
    if (current?.id === id) current.controller.abort();
    const i = queue.findIndex((j) => j.id === id);
    if (i >= 0) {
      queue.splice(i, 1);
      setJob(id, { state: "canceled", message: "ยกเลิกแล้ว" });
    }
    return sendJson(res, 200, { ok: true });
  }
  if (action === "poster" && ["GET", "HEAD"].includes(method)) {
    // ภาพนิ่งจากคลิปจริง ใช้เป็นพื้นหลังตัวอย่างสไตล์และภาพย่อ — เบากว่าให้หน้าเว็บโหลด <video> ทีละสิบกว่าตัว
    // เลือกเฟรมตอนท่อนแรกกำลังพูด (มักเห็นคนหรือสินค้าชัดกว่าเฟรมแรกที่มักดำหรือเบลอ)
    const file = path.join(store.projectDir(id), "poster.jpg");
    if (!fs.existsSync(file)) {
      if (!project.meta) throw httpError(404, "ยังไม่มีภาพตัวอย่าง");
      const first = project.timeline?.chunks?.[0];
      const atSec = first ? (first.startMs + 400) / 1000 : Math.min(3, project.meta.durationMs / 2000);
      await ffmpeg([
        "-ss", Math.min(atSec, project.meta.durationMs / 1000 - 0.1).toFixed(2), "-i", sourcePath(project),
        "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", "-y", file,
      ], { timeoutMs: 30_000 });
    }
    return sendFile(req, res, file, { cache: "max-age=3600" });
  }
  if (action === "source" && ["GET", "HEAD"].includes(method)) {
    return sendFile(req, res, sourcePath(project));
  }
  if (action === "file" && ["GET", "HEAD"].includes(method)) {
    const spec = DOWNLOADS[parts[4]];
    if (!spec) throw httpError(404, "ไม่พบไฟล์");
    const suffix = parts[4] === "srtTranslated" && project.translation?.lang ? `.${project.translation.lang}.srt` : spec.suffix;
    return sendFile(req, res, path.join(store.projectDir(id), "out", spec.file), {
      download: url.searchParams.has("download") ? `${project.title}${suffix}` : null,
    });
  }
  throw httpError(404, "ไม่พบ API");
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/" || !path.extname(rel)) rel = "/index.html";
  // ฟอนต์สำหรับเรนเดอร์ (ttf) อยู่ใน pipeline/fonts — ฟอนต์หน้าเว็บ (woff2) อยู่ใน public/fonts
  if (rel.startsWith("/fonts/") && rel.endsWith(".ttf")) {
    return sendFile(req, res, path.join(ROOT, "pipeline", "fonts", path.basename(rel)), { cache: "max-age=86400" });
  }
  const file = path.resolve(PUBLIC, `.${rel}`);
  if (!file.startsWith(PUBLIC + path.sep)) return sendJson(res, 403, { error: "forbidden" });
  return sendFile(req, res, file, { cache: rel.startsWith("/fonts/") ? "max-age=86400" : "no-cache" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  // กัน DNS rebinding: หน้าเว็บอื่นจะยิงเข้ามาผ่านชื่อโดเมนของตัวเองไม่ได้
  const host = String(req.headers.host || "").replace(/:\d+$/, "");
  if (!["127.0.0.1", "localhost"].includes(host)) return sendJson(res, 403, { error: "forbidden host" });
  try {
    if (url.pathname.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD" && req.headers["x-sub360"] !== "1") {
        throw httpError(403, "ต้องเรียกจากหน้าเว็บ Sub360");
      }
      return await handleApi(req, res, url);
    }
    return serveStatic(req, res, url);
  } catch (error) {
    if (res.headersSent) return res.destroy();
    sendJson(res, error.status || 500, { error: error.message || "เกิดข้อผิดพลาด" });
  }
});

/* ---------- เริ่มทำงาน ---------- */

// งานที่ค้างตอนปิดโปรแกรม: ถือว่าล้มแล้วให้ผู้ใช้กดใหม่ ดีกว่าค้างสถานะ "กำลังทำ" ตลอดไป
for (const p of store.list()) {
  if (p.job && ["queued", "running"].includes(p.job.state)) {
    const full = store.read(p.id);
    full.job = { ...full.job, state: "failed", error: "โปรแกรมถูกปิดระหว่างทำงาน กดลองใหม่ได้เลย" };
    if (!full.timeline) full.status = "failed";
    store.write(full);
  }
}

const portFree = (port) => new Promise((resolve) => {
  const tester = net.createServer().once("error", () => resolve(false)).once("listening", () => tester.close(() => resolve(true)));
  tester.listen(port, HOST);
});

let port = Number(process.env.SUB360_PORT || 4360);
while (!(await portFree(port))) port += 1;
server.listen(port, HOST, () => {
  const address = `http://${HOST}:${port}`;
  console.log(`\n  Sub360 ${VERSION.label} พร้อมใช้งานที่ ${address}\n  (ปิดหน้าต่างนี้เพื่อหยุดโปรแกรม)\n`);
  if (process.argv.includes("--open") && process.env.SUB360_NO_OPEN !== "1") {
    const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", address]]
      : process.platform === "darwin" ? ["open", [address]] : ["xdg-open", [address]];
    spawn(opener[0], opener[1], { detached: true, stdio: "ignore" }).unref();
  }
  // เปิดจากแอป Windows (electron/main.cjs) — บอกพอร์ตให้หน้าต่างแอปโหลด และปิดตามเมื่อแอปปิด
  if (process.send) {
    process.send({ type: "ready", url: address, version: VERSION });
    process.on("disconnect", () => process.exit(0));
  }
});
