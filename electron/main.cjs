// Sub360 แอป Windows — ห่อ local server เดิม (server/index.mjs) ไว้ในหน้าต่างของตัวเอง
//
// server รันเป็น process ลูกด้วย Electron ในโหมด Node (ELECTRON_RUN_AS_NODE) ไม่ต้องมี Node.js ในเครื่อง
// ค่านี้ส่งต่อถึงหลาน ๆ ด้วย: HyperFrames ถูกเรียกด้วย process.execPath (= Sub360.exe) จึงรันเป็น Node ได้เหมือนกัน
//
// โค้ดของแอปอยู่ในโฟลเดอร์ติดตั้ง (อัปเดตแล้วถูกแทนที่ทั้งโฟลเดอร์) ส่วนงานและการตั้งค่าอยู่ที่
// %LOCALAPPDATA%\Sub360 (SUB360_HOME) — ที่เดียวกับที่ตัวติดตั้งแบบเก่าใช้ จึงย้ายงานเดิมมาได้ง่าย
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { fork, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const HOME = process.env.SUB360_HOME
  || path.join(process.env.LOCALAPPDATA || app.getPath("userData"), "Sub360");
const LOG_DIR = path.join(HOME, "logs");
const ICON = path.join(ROOT, "installer", "sub360.ico");
const SMOKE_TEST = process.argv.includes("--smoke-test");

let win = null;
let server = null;
let baseUrl = "";
let quitting = false;

function log(line) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, "app.log"), `[${new Date().toISOString()}] ${line}\n`);
  } catch { /* log ไม่ได้ก็ไม่เป็นไร */ }
}

/* ---------- ย้ายงานจากตัวติดตั้งแบบเก่า (%LOCALAPPDATA%\Sub360\app) ---------- */

function migrateLegacyInstall() {
  const legacy = path.join(HOME, "app");
  const oldData = path.join(legacy, "data");
  const newData = path.join(HOME, "data");
  try {
    if (fs.existsSync(oldData) && !fs.existsSync(newData)) {
      // ย้าย (ไม่คัดลอก) — วิดีโอในโปรเจกต์อาจใหญ่หลาย GB และอยู่ไดรฟ์เดียวกันอยู่แล้ว
      fs.renameSync(oldData, newData);
      log(`moved ${oldData} -> ${newData}`);
    }
    const oldEnv = path.join(legacy, ".env");
    const newEnv = path.join(HOME, ".env");
    if (fs.existsSync(oldEnv) && !fs.existsSync(newEnv)) {
      // .env เก็บ path เต็มของ ffmpeg/whisper ที่เคยอยู่ใน app\data\bin — ชี้ไปที่ใหม่ให้ด้วย
      const text = fs.readFileSync(oldEnv, "utf8").split(oldData).join(newData);
      fs.writeFileSync(newEnv, text);
      log(`copied ${oldEnv} -> ${newEnv}`);
    }
  } catch (error) {
    log(`migration failed: ${error.stack || error}`);
  }
}

/* ---------- local server ---------- */

function startServer() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const out = fs.createWriteStream(path.join(LOG_DIR, "server.log"), { flags: "w" });
    server = fork(path.join(ROOT, "server", "index.mjs"), [], {
      cwd: HOME,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", SUB360_HOME: HOME, SUB360_NO_OPEN: "1" },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    server.stdout.pipe(out);
    server.stderr.pipe(out);
    const timer = setTimeout(() => reject(new Error("server ไม่ตอบภายใน 60 วินาที")), 60_000);
    server.on("message", (msg) => {
      if (msg?.type !== "ready") return;
      clearTimeout(timer);
      resolve(msg);
    });
    server.on("exit", (code) => {
      clearTimeout(timer);
      log(`server exited (${code})`);
      reject(new Error(`server หยุดทำงาน (code ${code})`));
      if (!quitting && baseUrl) {
        dialog.showErrorBox("Sub360 หยุดทำงาน", `ส่วนประมวลผลของโปรแกรมหยุดทำงาน ลองเปิดโปรแกรมใหม่\n\nรายละเอียด: ${path.join(LOG_DIR, "server.log")}`);
        quitting = true;
        app.quit();
      }
    });
  });
}

function stopServer() {
  if (!server || server.exitCode !== null) return;
  // ถอดเสียง/เรนเดอร์อาจค้าง ffmpeg หรือ whisper เป็นหลานอยู่ — kill ธรรมดาบน Windows ฆ่าแค่ตัวลูก
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { windowsHide: true });
  else server.kill();
}

async function serverBusy() {
  try {
    const res = await fetch(`${baseUrl}/api/status`, { signal: AbortSignal.timeout(3000) });
    const status = await res.json();
    return Boolean(status.current) || status.queue > 0;
  } catch {
    return false;
  }
}

/* ---------- หน้าต่าง ---------- */

const SPLASH = `<!doctype html><meta charset="utf-8"><title>Sub360</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#f5f4ef;color:#1c201d;font:16px 'Leelawadee UI',Tahoma,sans-serif">
<div style="text-align:center"><svg width="56" height="56" viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#1c201d"/><rect x="7" y="23" width="26" height="8" rx="4" fill="#ffd23f"/><rect x="11" y="12" width="18" height="5.5" rx="2.75" fill="#f5f4ef"/></svg>
<p>กำลังเปิด Sub360…</p></div></body>`;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: "Sub360",
    icon: ICON,
    backgroundColor: "#f5f4ef",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.cjs") },
  });
  win.removeMenu();
  win.once("ready-to-show", () => win.show());
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH)}`);

  // ลิงก์ออกนอกแอป (nodejs.org, Google AI Studio ฯลฯ) เปิดในเบราว์เซอร์ปกติ
  const external = (url) => /^https?:/i.test(url) && !(baseUrl && url.startsWith(baseUrl));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (external(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!external(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  win.on("close", async (event) => {
    if (quitting) return;
    event.preventDefault();
    if (await serverBusy()) {
      const { response } = await dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["ปิดโปรแกรม", "ยกเลิก"],
        defaultId: 1,
        cancelId: 1,
        title: "Sub360",
        message: "ยังมีงานทำอยู่",
        detail: "ถ้าปิดตอนนี้ งานที่กำลังถอดเสียงหรือเรนเดอร์จะหยุดกลางทาง และต้องสั่งใหม่ภายหลัง",
      });
      if (response !== 0) return;
    }
    quitting = true;
    app.quit();
  });
}

/* ---------- อัปเดตอัตโนมัติ (GitHub Releases) ---------- */
// ผู้ใช้ต้องเห็นทุกช่วง: พบเวอร์ชันใหม่ → ดาวน์โหลดกี่ % → พร้อมติดตั้ง → ตัวติดตั้งทำงาน → เปิดมาแล้วบอกว่าเสร็จ
// สถานะเก็บไว้ที่นี่ที่เดียว หน้าเว็บขอและฟังผ่าน preload.cjs ส่วนแถบบน taskbar ก็อ่านจากที่นี่
//
// state: idle · checking · not-available · available · downloading · downloaded · installing · error
// manual = ผู้ใช้กดตรวจเองจากหน้าตั้งค่า (ตรวจเบื้องหลังแล้วไม่เจอ/เน็ตหลุด ไม่ต้องรบกวนผู้ใช้)

let updater = null;
let updateState = { state: "idle" };
let manualCheck = false;
let promptedVersion = "";
let justUpdated = null;

// เปิดครั้งแรกหลังอัปเดตหรือยัง — เทียบกับเวอร์ชันที่จดไว้ตอนเปิดครั้งก่อน
// ต้องเรียกก่อนเขียน log ใด ๆ: รุ่นก่อน 0.4.2 ยังไม่ได้จดเวอร์ชันไว้ ถ้ามี app.log อยู่แล้วแปลว่าเคยเปิดรุ่นเก่ามาก่อน
function detectJustUpdated() {
  const file = path.join(HOME, "app-version.txt");
  let previous = null;
  try { previous = fs.readFileSync(file, "utf8").trim(); } catch {
    if (fs.existsSync(path.join(LOG_DIR, "app.log"))) previous = "";
  }
  try { fs.writeFileSync(file, app.getVersion()); } catch { /* จดไม่ได้ก็แค่ไม่ได้แจ้งครั้งหน้า */ }
  if (previous === null || previous === app.getVersion()) return null;
  log(`updated ${previous || "(older)"} -> ${app.getVersion()}`);
  return { from: previous };
}

function setUpdateState(next) {
  updateState = next;
  if (!win || win.isDestroyed()) return;
  // แถบความคืบหน้าบนไอคอน taskbar — เห็นได้แม้ย่อหน้าต่างไว้ (มากกว่า 1 = วิ่งไปมาแบบยังไม่รู้ขนาด)
  const bar = { available: 2, downloading: Math.max(0.01, (next.percent || 0) / 100), installing: 2 }[next.state];
  win.setProgressBar(bar ?? -1);
  win.webContents.send("sub360:update", publicUpdateState());
}

function publicUpdateState() {
  return { ...updateState, enabled: Boolean(updater), current: app.getVersion(), justUpdated };
}

function checkForUpdates(manual = false) {
  if (!updater) return publicUpdateState();
  if (updateState.state === "checking") {
    manualCheck ||= manual;
    return publicUpdateState();
  }
  // พบแล้ว/กำลังโหลด/โหลดเสร็จแล้ว ไม่ต้องตรวจซ้ำ — ตรวจซ้ำตอนโหลดเสร็จแล้ว electron-updater จะแจ้งว่าโหลดเสร็จอีกรอบ
  if (["available", "downloading", "downloaded", "installing"].includes(updateState.state)) return publicUpdateState();
  manualCheck = manual;
  updater.checkForUpdates().catch((error) => log(`update check failed: ${error}`));
  return publicUpdateState();
}

async function installUpdate() {
  if (!updater || updateState.state !== "downloaded") return false;
  if (await serverBusy()) {
    const { response } = await dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["อัปเดตเลย", "ยกเลิก"],
      defaultId: 1,
      cancelId: 1,
      title: "Sub360",
      message: "ยังมีงานทำอยู่",
      detail: "ถ้าอัปเดตตอนนี้ งานที่กำลังถอดเสียงหรือเรนเดอร์จะหยุดกลางทาง และต้องสั่งใหม่ภายหลัง",
    });
    if (response !== 0) return false;
  }
  setUpdateState({ ...updateState, state: "installing" });
  quitting = true;
  // ไม่ใช้โหมดเงียบ (/S) — ตัวติดตั้งจะขึ้นหน้าต่างแถบวิ่ง "Installing, please wait..." ให้เห็นว่ากำลังทำงาน
  // แล้วเปิด Sub360 ให้เองเมื่อเสร็จ (โหมดเงียบทำให้หน้าต่างหายไปเฉย ๆ ผู้ใช้นึกว่าโปรแกรมพังแล้วกดเปิดซ้ำ)
  // หน่วงนิดหนึ่งให้หน้าเว็บทันแสดงว่ากำลังปิดเพื่อติดตั้ง
  setTimeout(() => updater.quitAndInstall(false, true), 900);
  return true;
}

async function promptInstall(version) {
  if (promptedVersion === version) return;
  promptedVersion = version;
  if (!win.isFocused()) win.flashFrame(true);
  const { response } = await dialog.showMessageBox(win, {
    type: "info",
    buttons: ["เปิดใหม่เพื่ออัปเดต", "ไว้ทีหลัง"],
    defaultId: 0,
    cancelId: 1,
    title: "Sub360",
    message: `Sub360 เวอร์ชัน ${version} ดาวน์โหลดเสร็จแล้ว พร้อมติดตั้ง`,
    detail: "กด เปิดใหม่เพื่ออัปเดต แล้วโปรแกรมจะปิดไปสักครู่ระหว่างติดตั้ง (มีหน้าต่างแสดงความคืบหน้า) และเปิดขึ้นมาเองเมื่อเสร็จ\n\nหรือเลือก ไว้ทีหลัง แล้วระบบจะติดตั้งให้เองตอนปิดโปรแกรม — เปิดครั้งถัดไปจะเป็นเวอร์ชันใหม่",
  });
  if (response === 0) installUpdate();
}

function setupUpdateBridge() {
  // รับคำสั่งเฉพาะจากหน้าของ local server เรา ไม่รับจากหน้าอื่น
  const fromApp = (event) => Boolean(baseUrl && event.senderFrame?.url?.startsWith(`${baseUrl}/`));
  ipcMain.handle("sub360:update-state", () => publicUpdateState());
  ipcMain.handle("sub360:update-check", (event) => (fromApp(event) ? checkForUpdates(true) : null));
  ipcMain.handle("sub360:update-install", (event) => (fromApp(event) ? installUpdate() : false));
}

function setupUpdates() {
  if (!app.isPackaged || SMOKE_TEST) return;
  const { autoUpdater } = require("electron-updater");
  updater = autoUpdater;
  autoUpdater.logger = { info: log, warn: log, error: log, debug() {} };
  autoUpdater.on("checking-for-update", () => setUpdateState({ state: "checking", manual: manualCheck }));
  autoUpdater.on("update-not-available", () => setUpdateState({ state: "not-available", manual: manualCheck, checkedAt: Date.now() }));
  autoUpdater.on("update-available", (info) => setUpdateState({ state: "available", version: info.version }));
  autoUpdater.on("download-progress", (p) => setUpdateState({
    state: "downloading",
    version: updateState.version,
    percent: p.percent,
    transferred: p.transferred,
    total: p.total,
    bytesPerSecond: p.bytesPerSecond,
  }));
  autoUpdater.on("update-downloaded", (info) => {
    setUpdateState({ state: "downloaded", version: info.version });
    promptInstall(info.version);
  });
  autoUpdater.on("error", (error) => {
    log(`update error: ${error?.stack || error}`);
    // version มีค่า = พังระหว่างดาวน์โหลด ผู้ใช้เห็นแถบ % ไปแล้ว ต้องบอกว่าไม่สำเร็จ
    setUpdateState({ state: "error", manual: manualCheck, version: updateState.version, message: String(error?.message || error).split("\n")[0] });
  });
  checkForUpdates();
  setInterval(() => checkForUpdates(), 6 * 60 * 60 * 1000);
}

/* ---------- smoke test (CI บน Windows): เปิด server → เรียก /api/status → ปิด ---------- */

async function runSmokeTest() {
  const result = { ok: false };
  try {
    const ready = await startServer();
    baseUrl = ready.url;
    const status = await (await fetch(`${baseUrl}/api/status`)).json();
    const styles = await (await fetch(`${baseUrl}/api/styles`)).json();
    const page = await (await fetch(`${baseUrl}/`)).text();
    Object.assign(result, {
      ok: Boolean(status.version) && styles.styles?.length > 0 && page.includes("Sub360"),
      version: status.version, node: process.versions.node, electron: process.versions.electron,
      hyperframes: status.hyperframes, styles: styles.styles?.length,
    });
  } catch (error) {
    result.error = String(error?.stack || error);
  }
  if (process.env.SUB360_SMOKE_OUT) fs.writeFileSync(process.env.SUB360_SMOKE_OUT, JSON.stringify(result, null, 2));
  quitting = true;
  stopServer();
  app.exit(result.ok ? 0 : 1);
}

/* ---------- เริ่มแอป ---------- */

if (!SMOKE_TEST && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    fs.mkdirSync(HOME, { recursive: true });
    if (SMOKE_TEST) return runSmokeTest();
    justUpdated = detectJustUpdated();
    migrateLegacyInstall();
    setupUpdateBridge();
    createWindow();
    try {
      const ready = await startServer();
      baseUrl = ready.url;
      log(`server ready at ${baseUrl} (${ready.version?.label})`);
      await win.loadURL(baseUrl);
    } catch (error) {
      log(`start failed: ${error.stack || error}`);
      dialog.showErrorBox("เปิด Sub360 ไม่สำเร็จ", `${error.message}\n\nรายละเอียด: ${path.join(LOG_DIR, "server.log")}`);
      quitting = true;
      app.quit();
      return;
    }
    setupUpdates();
  });

  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", stopServer);
}
