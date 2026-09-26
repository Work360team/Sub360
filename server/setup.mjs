// setup — ตรวจและติดตั้งเครื่องมือที่ Sub360 ต้องใช้ ให้ผู้ใช้แค่กดปุ่มในหน้าเว็บ
//
// ถอดแบบจาก server/setup.mjs + whisper-setup.mjs ของ Clip360 แต่ต่างกันสามจุด:
//   1. whisper.cpp ติดตั้งในที่ที่ path เป็นอักษรอังกฤษล้วน — Sub360 มักอยู่ใต้โฟลเดอร์ชื่อไทย
//      และ whisper.cpp บนวินโดวส์อ่านอาร์กิวเมนต์เป็น ANSI เปิดไฟล์โมเดลใต้ path ไทยไม่ได้
//   2. เลือกไบนารีจาก release ล่าสุดที่มีไฟล์วินโดวส์ (ไม่ตรึงรุ่นเดียว) ถอยไปรุ่นที่ทดสอบแล้วถ้าเน็ตล่ม
//   3. ดาวน์โหลดต่อจากที่ค้างได้ — โมเดลใหญ่ 1.6–3 GB เน็ตหลุดกลางทางไม่ต้องเริ่มใหม่
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const isAscii = (value) => /^[\x20-\x7E]*$/.test(String(value ?? ""));
const EXE = process.platform === "win32" ? ".exe" : "";

/* ---------- .env ---------- */

/** เขียน/ลบค่าเดียวใน .env โดยไม่แตะบรรทัดอื่น และอัปเดต process.env ทันที */
export function setEnvValue(envFile, key, value) {
  let text = "";
  try { text = fs.readFileSync(envFile, "utf8"); } catch { /* ยังไม่มีไฟล์ */ }
  const lines = text.split(/\r?\n/).filter((line, i, all) => line || i < all.length - 1);
  const at = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (value) {
    if (at >= 0) lines[at] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
    process.env[key] = value;
  } else {
    if (at >= 0) lines.splice(at, 1);
    delete process.env[key];
  }
  fs.writeFileSync(envFile, `${lines.join("\n")}\n`, "utf8");
}

/* ---------- เรียกคำสั่ง ---------- */

function runCli(command, args, { timeoutMs = 20_000, signal } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolve({ code: -1, out: "", err: String(error?.message ?? error) });
      return;
    }
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const onAbort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d) => { if (out.length < 400_000) out += d; });
    child.stderr.on("data", (d) => { if (err.length < 400_000) err += d; });
    child.on("error", (error) => { clearTimeout(timer); resolve({ code: -1, out, err: String(error.message) }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ code, out, err });
    });
  });
}

function abortError() {
  const error = new Error("ยกเลิกแล้ว");
  error.name = "AbortError";
  return error;
}

/**
 * ดาวน์โหลดไฟล์ใหญ่ พร้อมรายงานความคืบหน้าและต่อจากที่ค้างได้ (HTTP Range)
 * บังคับ HTTPS ทั้งต้นทางและปลายทางหลัง redirect และจำกัดขนาดไม่ให้โตผิดปกติ
 */
async function download(url, destination, { maxBytes, signal, onProgress = () => {} }) {
  if (new URL(url).protocol !== "https:") throw new Error("อนุญาตให้ดาวน์โหลดผ่าน HTTPS เท่านั้น");
  const partial = `${destination}.part`;
  let have = 0;
  try { have = fs.statSync(partial).size; } catch { /* เริ่มใหม่ */ }

  const response = await fetch(url, {
    redirect: "follow",
    signal,
    headers: have ? { Range: `bytes=${have}-` } : {},
  });
  if (response.url && new URL(response.url).protocol !== "https:") throw new Error("ปลายทางดาวน์โหลดไม่ได้ใช้ HTTPS");
  if (response.status === 416) {
    // ไฟล์ .part ครบแล้วแต่ยังไม่ได้เปลี่ยนชื่อ (ปิดโปรแกรมพอดีจังหวะ)
    fs.renameSync(partial, destination);
    return;
  }
  if (!response.ok || !response.body) throw new Error(`ดาวน์โหลดไม่สำเร็จ (HTTP ${response.status})`);
  const resumed = response.status === 206;
  if (!resumed) have = 0;
  const length = Number(response.headers.get("content-length") || 0);
  const total = length ? have + length : null;
  if (total && total > maxBytes) throw new Error("ไฟล์มีขนาดใหญ่ผิดปกติ");

  const handle = await fs.promises.open(partial, resumed ? "a" : "w");
  let received = have;
  let lastReport = 0;
  try {
    const reader = response.body.getReader();
    while (true) {
      if (signal?.aborted) throw abortError();
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) throw new Error("ไฟล์มีขนาดใหญ่ผิดปกติ");
      await handle.write(Buffer.from(value));
      if (Date.now() - lastReport > 250) {
        lastReport = Date.now();
        onProgress({ received, total, ratio: total ? received / total : null });
      }
    }
  } finally {
    await handle.close();
  }
  onProgress({ received, total, ratio: 1 });
  fs.renameSync(partial, destination);
}

/** แตก zip ด้วย tar.exe ที่มากับ Windows 10 ขึ้นไป — ทำในโฟลเดอร์ชั่วคราว (path อังกฤษ) เสมอ */
async function extractZip(zipPath, outDir, signal) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const cmd of ["tar.exe", "tar", "unzip"]) {
    const args = cmd === "unzip" ? ["-q", zipPath, "-d", outDir] : ["-xf", zipPath, "-C", outDir];
    const res = await runCli(cmd, args, { timeoutMs: 10 * 60_000, signal });
    if (res.code === 0) return;
  }
  throw new Error("แตกไฟล์ไม่สำเร็จ — ไม่พบเครื่องมือแตกไฟล์ในเครื่อง");
}

function findFile(root, wanted) {
  const pending = [root];
  while (pending.length) {
    const dir = pending.shift();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === wanted) return full;
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(full);
    }
  }
  return null;
}

/* ---------- สถานะการติดตั้งที่กำลังทำ (อยู่ในหน่วยความจำ) ---------- */

const installs = {
  ffmpeg: { state: "idle", pct: 0, message: "", error: null },
  whisper: { state: "idle", pct: 0, message: "", error: null },
};
const controllers = {};
let statusCache = null;

export function installState() {
  return structuredClone(installs);
}

function setInstall(name, patch) {
  Object.assign(installs[name], patch);
}

/**
 * เริ่มติดตั้งเบื้องหลัง — เรียกซ้ำระหว่างที่ยังทำอยู่จะไม่เริ่มใหม่ (ปุ่มถูกกดสองครั้ง/เปิดสองแท็บ)
 * หน้าเว็บ poll สถานะผ่าน installState() จึงปิดหน้าไปแล้วเปิดใหม่ก็ยังเห็นความคืบหน้า
 */
function startInstall(name, runner) {
  if (installs[name].state === "running") return installState();
  const controller = new AbortController();
  controllers[name] = controller;
  setInstall(name, { state: "running", pct: 0, message: "กำลังเริ่ม", error: null });
  runner(controller.signal, (pct, message) => setInstall(name, { pct: Math.round(pct), message }))
    .then(() => setInstall(name, { state: "done", pct: 100, message: "ติดตั้งเสร็จแล้ว" }))
    .catch((error) => setInstall(name, {
      state: error?.name === "AbortError" ? "idle" : "failed",
      message: "",
      error: error?.name === "AbortError" ? null : String(error?.message || error),
    }))
    .finally(() => { statusCache = null; delete controllers[name]; });
  return installState();
}

export function cancelInstall(name) {
  controllers[name]?.abort();
}

/* ---------- FFmpeg ---------- */

function binDir(root) {
  return path.join(root, "data", "bin");
}

/** ให้โปรแกรมลูก (HyperFrames) หา ffmpeg ที่เราติดตั้งเจอด้วย ไม่ใช่แค่ pipeline ของเราเอง */
export function exposeBinOnPath(root) {
  const dir = binDir(root);
  const parts = String(process.env.PATH || "").split(path.delimiter);
  if (fs.existsSync(dir) && !parts.includes(dir)) process.env.PATH = `${dir}${path.delimiter}${process.env.PATH || ""}`;
}

/** FFmpeg ใช้ได้ = เรียกได้ และมีฟิลเตอร์ ass (libass) สำหรับเผาซับไทย */
async function probeFfmpeg(candidate) {
  const version = await runCli(candidate, ["-hide_banner", "-version"]);
  if (version.code !== 0) return null;
  const filters = await runCli(candidate, ["-hide_banner", "-filters"]);
  const libass = /\s(ass|subtitles)\s/.test(filters.out);
  return {
    path: candidate,
    version: /ffmpeg version (\S+)/.exec(version.out)?.[1] || "?",
    libass,
  };
}

export async function checkFfmpeg(root) {
  const local = path.join(binDir(root), `ffmpeg${EXE}`);
  const candidates = [process.env.FFMPEG_PATH, fs.existsSync(local) ? local : null, "ffmpeg"].filter(Boolean);
  let firstFound = null;
  for (const candidate of [...new Set(candidates)]) {
    const found = await probeFfmpeg(candidate);
    if (!found) continue;
    firstFound ||= found;
    if (found.libass) {
      return { ready: true, ...found, source: candidate === local ? "data/bin" : candidate === "ffmpeg" ? "PATH" : ".env" };
    }
  }
  return {
    ready: false,
    found: Boolean(firstFound),
    version: firstFound?.version || null,
    reason: firstFound ? "FFmpeg ที่พบไม่มี libass จึงเผาซับภาษาไทยไม่ได้" : "ยังไม่พบ FFmpeg บนเครื่องนี้",
  };
}

export function installFfmpeg(root, envFile) {
  return startInstall("ffmpeg", async (signal, progress) => {
    if (process.platform !== "win32") throw new Error("ติดตั้งอัตโนมัติรองรับเฉพาะ Windows — ติดตั้ง FFmpeg เองแล้วกดตรวจอีกครั้ง");
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-ffmpeg-"));
    try {
      const zip = path.join(work, "ffmpeg.zip");
      progress(2, "กำลังดาวน์โหลด FFmpeg จาก gyan.dev");
      await download("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", zip, {
        maxBytes: 400 * 1024 * 1024,
        signal,
        onProgress: ({ received, ratio }) => progress(2 + (ratio ?? 0) * 78, `กำลังดาวน์โหลด FFmpeg · ${(received / 1e6).toFixed(0)} MB`),
      });
      progress(82, "กำลังแตกไฟล์");
      await extractZip(zip, path.join(work, "x"), signal);
      const ffmpeg = findFile(path.join(work, "x"), `ffmpeg${EXE}`);
      const ffprobe = findFile(path.join(work, "x"), `ffprobe${EXE}`);
      if (!ffmpeg) throw new Error("ไฟล์ที่โหลดมาไม่มี ffmpeg");
      progress(90, "กำลังตรวจว่ารองรับซับภาษาไทย");
      const checked = await probeFfmpeg(ffmpeg);
      if (!checked?.libass) throw new Error("FFmpeg ที่โหลดมาไม่มี libass");
      const dir = binDir(root);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(ffmpeg, path.join(dir, `ffmpeg${EXE}`));
      if (ffprobe) fs.copyFileSync(ffprobe, path.join(dir, `ffprobe${EXE}`));
      setEnvValue(envFile, "FFMPEG_PATH", path.join(dir, `ffmpeg${EXE}`));
      if (ffprobe) setEnvValue(envFile, "FFPROBE_PATH", path.join(dir, `ffprobe${EXE}`));
      exposeBinOnPath(root);
      progress(100, "ติดตั้ง FFmpeg เรียบร้อย");
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });
}

/* ---------- whisper.cpp ---------- */

export const WHISPER_MODELS = {
  large: { file: "ggml-large-v3.bin", bytes: 3_095_033_483, name: "Large v3", note: "แม่นที่สุดสำหรับภาษาไทย · ทดสอบกับ Sub360 แล้ว" },
  turbo: { file: "ggml-large-v3-turbo.bin", bytes: 1_624_555_275, name: "Large v3 Turbo", note: "ไฟล์เล็กกว่าครึ่ง เร็วกว่า · แม่นน้อยกว่าเล็กน้อย" },
};
const MODEL_BASE = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";
const FALLBACK_RELEASE = "b4938";

/**
 * ที่ติดตั้ง whisper.cpp — ต้องเป็น path อักษรอังกฤษล้วน
 * โฟลเดอร์โปรแกรมก่อน (ถ้าชื่ออังกฤษ) → AppData\Local\Sub360 → C:\Users\Public\Sub360 (อังกฤษเสมอ)
 */
export function whisperHome(root) {
  const candidates = [
    path.join(binDir(root), "whisper"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Sub360", "whisper"),
    process.env.PUBLIC && path.join(process.env.PUBLIC, "Sub360", "whisper"),
    path.join(os.homedir(), ".sub360", "whisper"),
  ].filter(Boolean);
  return candidates.find(isAscii) || candidates[0];
}

let gpuCache = null;
export async function hasNvidiaGpu() {
  if (gpuCache !== null) return gpuCache;
  const res = await runCli("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], { timeoutMs: 8000 });
  gpuCache = res.code === 0 && res.out.trim() ? res.out.trim().split(/\r?\n/)[0] : false;
  return gpuCache;
}

/** release ล่าสุดที่มีไฟล์วินโดวส์ — แท็ก v1.x ใหม่ ๆ บางอันไม่มีไฟล์แนบ ต้องไล่หา */
async function pickWhisperBinary(gpu) {
  const wanted = gpu ? /^whisper-cublas-12\.[\d.]+-bin-x64\.zip$/ : /^whisper-blas-bin-x64\.zip$/;
  try {
    const res = await fetch("https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=12", {
      headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      for (const release of await res.json()) {
        const asset = (release.assets || []).filter((a) => wanted.test(a.name)).sort((a, b) => b.name.localeCompare(a.name))[0];
        if (asset) return { url: asset.browser_download_url, release: release.tag_name, name: asset.name, bytes: asset.size };
      }
    }
  } catch { /* ใช้รุ่นสำรองด้านล่าง */ }
  const name = gpu ? "whisper-cublas-12.4.0-bin-x64.zip" : "whisper-blas-bin-x64.zip";
  return { url: `https://github.com/ggml-org/whisper.cpp/releases/download/${FALLBACK_RELEASE}/${name}`, release: FALLBACK_RELEASE, name, bytes: gpu ? 671e6 : 21e6 };
}

export async function checkWhisper(root) {
  const home = whisperHome(root);
  const localCli = path.join(home, `whisper-cli${EXE}`);
  const localModel = Object.values(WHISPER_MODELS).map((m) => path.join(home, "models", m.file)).find((f) => fs.existsSync(f));
  const pairs = [
    { cli: process.env.WHISPER_CLI_PATH, model: process.env.WHISPER_MODEL_PATH, source: ".env" },
    { cli: localCli, model: localModel, source: "ติดตั้งโดย Sub360" },
  ];
  for (const pair of pairs) {
    if (!pair.cli || !pair.model || !fs.existsSync(pair.cli) || !fs.existsSync(pair.model)) continue;
    const probe = await runCli(pair.cli, ["--help"]);
    if (!/whisper|usage/i.test(`${probe.out}${probe.err}`)) continue;
    const ascii = isAscii(pair.model);
    return {
      ready: ascii,
      cli: pair.cli,
      model: pair.model,
      modelName: path.basename(pair.model),
      source: pair.source,
      reason: ascii ? null : "ไฟล์โมเดลอยู่ใต้โฟลเดอร์ที่มีอักษรไทย whisper.cpp เปิดไม่ได้ — ติดตั้งใหม่ด้วยปุ่มด้านล่าง",
    };
  }
  return { ready: false, reason: "ยังไม่ได้ติดตั้งตัวถอดเสียง whisper.cpp", home };
}

export function installWhisper(root, envFile, modelKey = "large") {
  const model = WHISPER_MODELS[modelKey] || WHISPER_MODELS.large;
  return startInstall("whisper", async (signal, progress) => {
    if (process.platform !== "win32") throw new Error("ติดตั้งอัตโนมัติรองรับเฉพาะ Windows — macOS ใช้ `brew install whisper-cpp` แล้วตั้งค่าใน .env");
    const home = whisperHome(root);
    if (!isAscii(home)) throw new Error("หาโฟลเดอร์ติดตั้งที่เป็นชื่ออังกฤษไม่ได้");
    fs.mkdirSync(path.join(home, "models"), { recursive: true });

    // ---- โปรแกรม (ข้ามถ้ามีแล้ว) ----
    const cli = path.join(home, `whisper-cli${EXE}`);
    if (!fs.existsSync(cli)) {
      const gpu = await hasNvidiaGpu();
      progress(1, "กำลังหารุ่นล่าสุดของ whisper.cpp");
      const bin = await pickWhisperBinary(Boolean(gpu));
      const work = fs.mkdtempSync(path.join(os.tmpdir(), "sub360-whisper-"));
      try {
        const zip = path.join(work, "whisper.zip");
        await download(bin.url, zip, {
          maxBytes: 1.2 * 1024 ** 3,
          signal,
          onProgress: ({ received, ratio }) => progress(2 + (ratio ?? 0) * 18,
            `กำลังโหลดโปรแกรม whisper.cpp ${bin.release}${gpu ? " (ใช้การ์ดจอ)" : ""} · ${(received / 1e6).toFixed(0)} MB`),
        });
        progress(21, "กำลังแตกไฟล์โปรแกรม");
        await extractZip(zip, path.join(work, "x"), signal);
        const found = findFile(path.join(work, "x"), `whisper-cli${EXE}`);
        if (!found) throw new Error("ไฟล์ที่โหลดมาไม่มี whisper-cli");
        // ต้องยกทั้งโฟลเดอร์ — ตัวโปรแกรมเรียก DLL (CUDA, ggml) ที่วางอยู่ข้าง ๆ
        fs.cpSync(path.dirname(found), home, { recursive: true });
      } finally {
        fs.rmSync(work, { recursive: true, force: true });
      }
    }

    // ---- โมเดล (โหลดต่อจากที่ค้างได้) ----
    const modelPath = path.join(home, "models", model.file);
    if (!fs.existsSync(modelPath)) {
      await download(`${MODEL_BASE}${model.file}`, modelPath, {
        maxBytes: 4.5 * 1024 ** 3,
        signal,
        onProgress: ({ received, total }) => progress(24 + (total ? received / total : 0) * 72,
          `กำลังโหลดโมเดล ${model.name} · ${(received / 1e9).toFixed(2)} / ${((total || model.bytes) / 1e9).toFixed(2)} GB`),
      });
    }

    progress(97, "กำลังตรวจว่าเรียกใช้ได้จริง");
    const probe = await runCli(cli, ["--help"]);
    if (!/whisper|usage/i.test(`${probe.out}${probe.err}`)) throw new Error("เรียก whisper-cli ไม่ได้หลังติดตั้ง");
    setEnvValue(envFile, "WHISPER_CLI_PATH", cli);
    setEnvValue(envFile, "WHISPER_MODEL_PATH", modelPath);
    progress(100, "ติดตั้งตัวถอดเสียงเรียบร้อย");
  });
}

/* ---------- สรุปสถานะทั้งหมด ---------- */

export async function setupStatus(root, { refresh = false } = {}) {
  if (!statusCache || refresh) {
    const [ffmpeg, whisper, gpu] = await Promise.all([checkFfmpeg(root), checkWhisper(root), hasNvidiaGpu()]);
    const [major, minor] = process.versions.node.split(".").map(Number);
    const fontDir = path.join(root, "pipeline", "fonts");
    const fonts = fs.existsSync(fontDir) ? fs.readdirSync(fontDir).filter((f) => /^Kanit.*\.ttf$/i.test(f)) : [];
    let storageOk = false;
    try {
      const dir = path.join(root, "data", "projects");
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      storageOk = true;
    } catch { /* แสดงเป็นยังไม่พร้อม */ }
    statusCache = {
      node: { version: process.versions.node, ready: major > 22 || (major === 22 && minor >= 13) },
      storage: { path: path.join(root, "data"), ready: storageOk },
      fonts: { files: fonts, ready: fonts.length >= 3 },
      hyperframes: { ready: fs.existsSync(path.join(root, "node_modules", "hyperframes", "package.json")) },
      ffmpeg,
      whisper,
      gpu: gpu || null,
      models: WHISPER_MODELS,
      whisperHome: whisperHome(root),
    };
  }
  return { ...statusCache, installs: installState() };
}

export function invalidateSetupStatus() {
  statusCache = null;
}
