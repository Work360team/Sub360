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
// ผู้ใช้ต้องเห็นเสมอว่าอัปเดตถึงไหน ไม่ต้องเดา (แบบเดียวกับ Clip360):
//   โหลดอยู่     → การ์ดมุมขวาล่างบอกกี่ % และกี่ MB + แถบบน taskbar
//   โหลดเสร็จ    → การ์ดมีปุ่ม อัปเดตเลย / ไว้ทีหลัง (และถามด้วยกล่องข้อความหนึ่งครั้ง)
//   กำลังติดตั้ง  → หน้าต่างสถานะ 3 ขั้น แล้วตัวติดตั้งแสดงแถบของมันเอง (ไม่ติดตั้งแบบเงียบ)
//   เปิดใหม่     → การ์ดบอกว่าอัปเดตเป็นเวอร์ชันไหนแล้ว
// เลือก "ไว้ทีหลัง" แล้วปิดโปรแกรม ก็ติดตั้งทางเดียวกัน ไม่ติดตั้งเงียบ ๆ อยู่เบื้องหลัง
// สถานะเก็บไว้ที่นี่ที่เดียว หน้าเว็บขอและฟังผ่าน preload.cjs
//
// state: idle · checking · not-available · available · downloading · downloaded · installing · error
// manual = ผู้ใช้กดตรวจเองจากหน้าตั้งค่า (ตรวจเบื้องหลังแล้วไม่เจอ/เน็ตหลุด ไม่ต้องรบกวนผู้ใช้)

let updater = null;
let updateState = { state: "idle" };
let manualCheck = false;
let promptedVersion = "";
let justUpdated = null;
let installing = false;

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

const UPDATE_PAGE = (version) => `<!doctype html><meta charset="utf-8"><title>กำลังอัปเดต Sub360</title>
<style>
body{margin:0;height:100vh;display:grid;place-items:center;background:#1a1e1a;color:#f5f4ef;font:15px 'Leelawadee UI',Tahoma,sans-serif}
.box{width:380px}h1{font-size:19px;margin:0 0 4px}p{margin:0 0 16px;color:#aab1a9}
ol{list-style:none;margin:0;padding:0}li{display:flex;gap:10px;align-items:center;padding:6px 0;color:#7c847b}
li i{width:18px;height:18px;border-radius:50%;border:2px solid #5f675f;flex:none;box-sizing:border-box}
li.now{color:#f5f4ef}li.now i{border-color:#ffd23f;border-top-color:transparent;animation:s 0.9s linear infinite}
li.done{color:#aab1a9}li.done i{background:#3a9a68;border-color:#3a9a68}
@keyframes s{to{transform:rotate(360deg)}}
</style>
<div class="box"><h1>กำลังอัปเดตเป็นเวอร์ชัน ${version}</h1><p>ไม่ต้องทำอะไร Sub360 จะเปิดขึ้นมาเองเมื่อเสร็จ</p>
<ol><li id="s1" class="now"><i></i>ปิดงานที่ค้างอยู่ให้เรียบร้อย</li>
<li id="s2"><i></i>ติดตั้งเวอร์ชันใหม่ (มีหน้าต่างแสดงความคืบหน้า)</li>
<li id="s3"><i></i>เปิด Sub360 ใหม่</li></ol></div>`;

function openUpdateWindow(version) {
  const status = new BrowserWindow({
    width: 460,
    height: 260,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    title: "กำลังอัปเดต Sub360",
    icon: ICON,
    backgroundColor: "#1a1e1a",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  status.removeMenu();
  const loaded = status.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(UPDATE_PAGE(version))}`).catch(() => {});
  return {
    step(done, now) {
      loaded.then(() => {
        if (status.isDestroyed()) return;
        return status.webContents.executeJavaScript(
          `document.getElementById(${JSON.stringify(done)}).className="done";`
          + `document.getElementById(${JSON.stringify(now)}).className="now";`,
        );
      }).catch(() => {});
    },
  };
}

/**
 * ติดตั้งเวอร์ชันที่โหลดไว้ — ทางเดียวที่ใช้ทั้งปุ่มในการ์ด กล่องข้อความ และตอนปิดโปรแกรม
 * @param {boolean} askIfBusy ถามก่อนถ้ายังมีงานค้าง (ตอนปิดโปรแกรม หน้าต่างถามไปแล้ว)
 */
async function installUpdate({ askIfBusy = true } = {}) {
  if (!updater || installing || updateState.state !== "downloaded") return false;
  const { version } = updateState;
  if (askIfBusy && await serverBusy()) {
    const { response } = await dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["อัปเดตเลย", "รอให้เสร็จก่อน"],
      defaultId: 1,
      cancelId: 1,
      title: "Sub360",
      message: "ยังมีงานทำอยู่",
      detail: "ถ้าอัปเดตตอนนี้ งานที่กำลังถอดเสียงหรือเรนเดอร์จะหยุดกลางทาง เลือก รอให้เสร็จก่อน แล้วระบบจะอัปเดตให้ตอนปิดโปรแกรม",
    });
    if (response !== 0) return false;
  }
  installing = true;
  quitting = true;
  setUpdateState({ ...updateState, state: "installing" });
  const status = openUpdateWindow(version);
  if (win && !win.isDestroyed()) win.hide();
  stopServer();
  status.step("s1", "s2");
  log(`installing ${version}`);
  // ให้เห็นขั้นที่ 2 ก่อนหน้าต่างนี้ปิด แล้วตัวติดตั้งแสดงแถบความคืบหน้าของมันเองต่อ
  // (ไม่ใช้โหมดเงียบ /S — ผู้ใช้เห็นแอปหายไปเฉย ๆ แล้วนึกว่าโปรแกรมพัง)
  setTimeout(() => updater.quitAndInstall(false, true), 1500);
  return true;
}

async function promptInstall(version) {
  if (promptedVersion === version) return;
  promptedVersion = version;
  if (!win.isFocused()) win.flashFrame(true);
  const { response } = await dialog.showMessageBox(win, {
    type: "info",
    buttons: ["อัปเดตเลย", "ไว้ทีหลัง"],
    defaultId: 0,
    cancelId: 1,
    title: "Sub360",
    message: `Sub360 เวอร์ชัน ${version} พร้อมติดตั้งแล้ว`,
    detail: "กด อัปเดตเลย แล้วรอราว 1 นาที จะมีหน้าต่างบอกความคืบหน้า และ Sub360 จะเปิดขึ้นมาเองเมื่อเสร็จ\n\n"
      + "ถ้าเลือก ไว้ทีหลัง กดอัปเดตได้จากการ์ดมุมขวาล่าง หรือระบบจะอัปเดตให้ตอนปิดโปรแกรม",
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
  // ติดตั้งตอนปิดโปรแกรมเองใน will-quit ด้วยหน้าต่างสถานะ แทนที่ electron-updater จะติดตั้งเงียบ ๆ
  autoUpdater.autoInstallOnAppQuit = false;
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
    if (installing) {
      // เปิดตัวติดตั้งไม่ได้ — หน้าต่างหลักถูกซ่อนไปแล้ว บอกแล้วปิดโปรแกรม เปิดใหม่ก็จะลองอัปเดตอีกรอบ
      dialog.showErrorBox("อัปเดต Sub360 ไม่สำเร็จ", `เปิดโปรแกรมใหม่อีกครั้งแล้วระบบจะลองอัปเดตให้อีกรอบ\n\nรายละเอียด: ${path.join(LOG_DIR, "app.log")}`);
      app.exit(1);
      return;
    }
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
  app.on("will-quit", (event) => {
    stopServer();
    // เลือก "ไว้ทีหลัง" ไว้ — ติดตั้งตอนนี้ แต่ให้เห็นความคืบหน้า ไม่ใช่ติดตั้งเงียบ ๆ หลังปิดหน้าต่าง
    if (installing || updateState.state !== "downloaded") return;
    event.preventDefault();
    installUpdate({ askIfBusy: false });
  });
}
