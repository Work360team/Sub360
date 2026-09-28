// Sub360 — หน้าเว็บ (vanilla JS ไม่ต้อง build) หน้าตาถอดแบบ Clip360
//
// เส้นทาง: #/ ภาพรวม · #/projects · #/new · #/p/<id> (4 ขั้น) · #/styles · #/settings

/* ---------- ไอคอน (เส้นแบบ lucide) ---------- */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  captions: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15h4M13 15h4M7 11h10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.6M12 17h.01"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2c0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3a2 2 0 0 1 2-2h2.3A5.6 5.6 0 0 0 22 10c0-4.4-4.5-8-10-8"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  merge: '<path d="M8 6h8M8 12h8M8 18h8"/><path d="M4 9l2 3-2 3"/>',
  split: '<path d="M12 3v18M5 8l-3 4 3 4M19 8l3 4-3 4"/>',
  insert: '<path d="M12 8v8M8 12h8"/><rect x="3" y="3" width="18" height="18" rx="4"/>',
  pinStart: '<path d="M5 4v16M9 12h11M16 8l4 4-4 4"/>',
  pinEnd: '<path d="M19 4v16M4 12h11M11 8l4 4-4 4"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0"/>',
  wand: '<path d="m15 4 5 5L9 20l-5-5z"/><path d="M13 6l5 5M19 2v2M21 4h-2M5 3v2M6 4H4"/>',
  languages: '<path d="M4 5h9M8.5 3v2M11 5c-.8 3.5-3.3 6.5-7 8M6 9c1.2 2 3 3.5 5 4.2"/><path d="m13 21 4-9 4 9M14.5 18h5"/>',
  fileText: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  gem: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3l3 18M15 3l-3 18"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  external: '<path d="M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
const icon = (name, cls = "") => `<i data-icon="${name}"${cls ? ` class="${cls}"` : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg></i>`;
function hydrateIcons(root = document) {
  root.querySelectorAll("i[data-icon]:empty").forEach((el) => {
    el.outerHTML = icon(el.dataset.icon, el.getAttribute("class") || "");
  });
}

/* ---------- ตัวช่วย ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const store = {
  get(key, fallback = null) { try { return localStorage.getItem(`sub360.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`sub360.${key}`, value); } catch { /* โหมดส่วนตัว */ } },
};

function fmtTime(ms, withCs = true) {
  const t = Math.max(0, Math.round(ms || 0));
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const cs = Math.floor((t % 1000) / 10);
  return withCs ? `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function parseTime(text) {
  const m = /^\s*(?:(\d+):)?(\d+(?:\.\d+)?)\s*$/.exec(String(text));
  return m ? Math.round((Number(m[1] || 0) * 60 + Number(m[2])) * 1000) : null;
}
function fmtBytes(n) {
  if (!n) return "-";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
const fmtDuration = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)} นาที ${Math.round((ms % 60000) / 1000)} วิ` : `${Math.round(ms / 1000)} วินาที`);

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  if (MOTION) G.fromTo(el, { y: 18, scale: 0.94 }, { y: 0, scale: 1, duration: 0.35, ease: "back.out(2)", clearProps: "transform" });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
}

async function api(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "x-sub360": "1", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
  return data;
}

let catalogCache = null;
const getCatalog = async () => (catalogCache ||= await api("/styles"));
let statusCache = null;
const JOB_ACTIVE = (p) => Boolean(p?.job && ["queued", "running"].includes(p.job.state));
const JOB_LABEL = { transcribe: "ถอดเสียง", refine: "AI แก้คำ", translate: "แปลซับ", render: "เรนเดอร์", import: "นำเข้าซับ" };

/* ---------- กล่องโต้ตอบ ---------- */
function openModal({ title, text = "", body = "", actions = [{ label: "ตกลง", value: true, cls: "button-primary" }], onMount }) {
  return new Promise((resolve) => {
    const root = $("#modal-root");
    root.innerHTML = `
      <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal">
          <h3>${esc(title)}</h3>
          ${text ? `<p>${text}</p>` : ""}
          ${body ? `<div class="modal-body">${body}</div>` : ""}
          <div class="modal-actions">
            <button class="button button-quiet" data-v="__cancel">ยกเลิก</button>
            ${actions.map((a, i) => `<button class="button ${a.cls || "button-primary"}" data-i="${i}">${a.label}</button>`).join("")}
          </div>
        </div>
      </div>`;
    hydrateIcons(root);
    const modal = $(".modal", root);
    const onKey = (e) => { if (e.key === "Escape") close(null); };
    function close(value) {
      root.innerHTML = "";
      window.removeEventListener("keydown", onKey);
      resolve(value);
    }
    window.addEventListener("keydown", onKey);
    $(".modal-backdrop", root).addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop")) return close(null);
      const b = e.target.closest("button[data-v], button[data-i]");
      if (!b) return;
      if (b.dataset.v === "__cancel") return close(null);
      const action = actions[Number(b.dataset.i)];
      const value = typeof action.value === "function" ? action.value(modal) : action.value;
      if (value === undefined) return; // ค่าไม่ครบ — ปล่อยกล่องเปิดไว้
      close(value);
    });
    onMount?.(modal);
    if (MOTION) {
      G.fromTo($(".modal-backdrop", root), { opacity: 0 }, { opacity: 1, duration: 0.2 });
      G.fromTo(modal, { y: 24, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.8)", clearProps: "transform" });
    }
    $("button[data-i]", root)?.focus();
  });
}
const confirmBox = (title, text, label = "ยืนยัน", cls = "button-primary") => openModal({ title, text, actions: [{ label, value: true, cls }] });

/* ---------- ตัววาดซับตัวอย่าง ---------- */
// ใช้ค่าจากไฟล์สไตล์ตัวเดียวกับที่ตัวเรนเดอร์อ่าน (สเกลตามวิดีโอแล้วจากเซิร์ฟเวอร์)
// ใกล้เคียงของจริง แต่ไฟล์ที่เรนเดอร์ออกมาคือตัวตัดสิน

function hexAlpha(hex, alpha255) {
  const h = String(hex || "#000000").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${(1 - (alpha255 ?? 0) / 255).toFixed(3)})`;
}

function wordCss(style, scale) {
  const p = style.params;
  const hf = style.lane === "hyperframes";
  const ow = (p.outline?.width ?? 7) * scale * (hf ? 1 : 2);
  const shadows = [];
  if (p.glow) shadows.push(`0 0 ${(p.glow.blur ?? 18) * scale}px ${p.glow.color}`, `0 0 ${(p.glow.blur ?? 18) * 2.4 * scale}px ${p.glow.color}`);
  else if (p.glitch) shadows.push(`${-(p.glitch.offset ?? 6) * scale}px 0 0 ${p.glitch.cyan}`, `${(p.glitch.offset ?? 6) * scale}px 0 0 ${p.glitch.red}`);
  else if (p.shadow?.offset && !p.gradient && !p.box) shadows.push(`0 ${p.shadow.offset * scale}px 0 ${p.shadow.color || "rgba(0,0,0,.6)"}`);
  return [
    `font-family:'Kanit Caption',sans-serif`,
    `font-weight:${p.weightShift?.base ?? p.font?.weight ?? 800}`,
    `color:${p.fill}`,
    ow ? `-webkit-text-stroke:${ow.toFixed(2)}px ${p.outline?.color || "#000"}` : "",
    shadows.length ? `text-shadow:${shadows.join(",")}` : "",
    p.gradient ? `background-image:linear-gradient(${p.gradient.angle ?? 100}deg,${p.gradient.from},${p.gradient.to});-webkit-background-clip:text;background-clip:text;color:transparent` : "",
    `--pop:${p.animation?.scale ?? 1.1}`,
  ].filter(Boolean).join(";");
}

function lineCss(style, scale, fontPx) {
  const p = style.params;
  const css = [`font-size:${fontPx}px`];
  if (p.pill) css.push(`background:${p.pill.color};padding:${(p.pill.padV ?? 18) * scale}px ${(p.pill.padH ?? 34) * scale}px;border-radius:${Math.min(999, (p.pill.radius ?? 999) * scale)}px`);
  if (p.box) css.push(`background:${hexAlpha(p.box.color, p.box.alpha ?? 64)};padding:${(p.outline?.width ?? 8) * scale * 0.6}px ${(p.outline?.width ?? 8) * scale}px`);
  if (style.lane === "hyperframes") css.push("flex-wrap:nowrap");
  return css.join(";");
}

function subCss(style, scale) {
  const p = style.params;
  const hf = style.lane === "hyperframes";
  const size = (p.font?.size ?? 90) * 0.58 * scale;
  const ow = (p.outline?.width ?? 7) * 0.7 * scale * (hf ? 1 : 2);
  const css = [
    `font-size:${size}px`, `color:${p.fill}`, `margin-top:${(p.font?.size ?? 90) * 0.14 * scale}px`,
    ow ? `-webkit-text-stroke:${ow.toFixed(2)}px ${p.outline?.color || "#000"}` : "",
  ];
  if (p.pill) css.push(`background:${p.pill.color};padding:${(p.pill.padV ?? 18) * 0.6 * scale}px ${(p.pill.padH ?? 34) * 0.6 * scale}px;border-radius:${Math.min(999, (p.pill.radius ?? 999) * scale)}px`);
  if (p.box) css.push(`background:${hexAlpha(p.box.color, p.box.alpha ?? 64)};padding:${size * 0.1}px ${size * 0.25}px`);
  return css.filter(Boolean).join(";");
}

/** โหมดภาษา → ท่อนที่ขึ้นจอ (สูตรเดียวกับ displayChunks ฝั่งเซิร์ฟเวอร์) */
function displayChunks(chunks, display, hasTranslation) {
  if (!hasTranslation || !display || display === "original") return chunks;
  return chunks.map((c) => {
    const tr = String(c.translation || "").trim();
    if (!tr) return c;
    if (display === "both") return { ...c, sub: tr };
    const parts = tr.match(/\S+\s*/g) || [tr];
    const weights = parts.map((w) => Math.max(1, w.trim().length));
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = c.startMs;
    let pos = 0;
    return {
      ...c, text: tr,
      words: parts.map((w, i) => {
        const start = acc;
        acc += ((c.endMs - c.startMs) * weights[i]) / total;
        const out = { text: w.trim(), s: pos, e: pos + w.length, startMs: Math.round(start), endMs: Math.round(acc) };
        pos += w.length;
        return out;
      }),
    };
  });
}

/* ---------- การเคลื่อนไหวของซับ (GSAP) ---------- */
// ค่าท่าเข้าชุดเดียวกับ ENTERS ใน pipeline/hyperframes.mjs — ตัวอย่างบนเว็บจึงขยับแบบเดียวกับไฟล์ที่เรนเดอร์จริง
// ระยะ y ของตัวเรนเดอร์เป็นพิกเซลบนจอ 1080 ที่นี่แปลงเป็น em ให้ย่อ/ขยายตามขนาดตัวอักษร
const G = window.gsap || null;
const REDUCED = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const MOTION = Boolean(G) && !REDUCED;
// ปิด lag smoothing: เครื่องที่กำลังเรนเดอร์/ถอดเสียงอยู่เฟรมตกบ่อย ค่าปริยายของ GSAP จะยืดเวลาแอนิเมชัน
// ตามเฟรมที่หายไป หน้าเว็บจึงค้างครึ่งจางอยู่นาน — ให้จบตามเวลาจริงเสมอ ถึงจะกระตุกบ้างก็ยังดีกว่า
if (G) G.ticker.lagSmoothing(0);
const ENTERS = {
  blur: { from: { y: "0.36em", opacity: 0, filter: "blur(6px)" }, to: { y: 0, opacity: 1, filter: "blur(0px)" }, duration: 0.18, ease: "power3.out" },
  slam: { from: { scale: 1.9, opacity: 0 }, to: { scale: 1, opacity: 1 }, duration: 0.22, ease: "back.out(3)" },
  wipe: { from: { clipPath: "inset(0 100% 0 0)", opacity: 1 }, to: { clipPath: "inset(0 0% 0 0)", opacity: 1 }, duration: 0.26, ease: "power2.inOut" },
  rise: { from: { y: "0.75em", opacity: 0 }, to: { y: 0, opacity: 1 }, duration: 0.24, ease: "power4.out" },
  squeeze: { from: { scaleX: 0.35, scaleY: 1.25, opacity: 0 }, to: { scaleX: 1, scaleY: 1, opacity: 1 }, duration: 0.26, ease: "back.out(2.2)" },
  fade: { from: { opacity: 0 }, to: { opacity: 1 }, duration: 0.12, ease: "none" },
};

/**
 * ท่าเคลื่อนไหวของสไตล์ แยกตามเลน
 * HyperFrames: บรรทัดเข้าตาม animation.enter (ไม่รู้จักชื่อ → blur) และทุกคำเด้งตอนถึงคิว
 * libass: บรรทัดแค่เฟดเข้า คำเด้งเฉพาะสไตล์ที่ enter เป็น "pop" (\fscx ในไฟล์ .ass)
 */
function motionSpec(style) {
  const a = style.params.animation || {};
  if (style.lane === "hyperframes") {
    return { enter: ENTERS[a.enter] || ENTERS.blur, pop: a.scale ?? 1.12, popS: (a.durationMs ?? 160) / 1000, wiggle: style.params.wiggle || null };
  }
  return { enter: ENTERS.fade, pop: a.enter === "pop" ? (a.scale ?? 1.1) : null, popS: (a.durationMs ?? 110) / 1000, wiggle: null };
}

function playEnter(targets, spec) {
  if (!MOTION || !targets.length) return;
  G.fromTo(targets, spec.enter.from, { ...spec.enter.to, duration: spec.enter.duration, ease: spec.enter.ease, overwrite: true, clearProps: "filter,clipPath" });
}
function playPop(word, spec) {
  if (!MOTION || !word || !spec.pop) return;
  G.fromTo(word, { scale: spec.pop, y: "-0.08em" }, { scale: 1, y: 0, duration: spec.popS, ease: "back.out(2.4)", overwrite: "auto" });
}
function startWiggle(line, spec, scale) {
  if (!MOTION || !spec.wiggle || !line) return;
  const period = (spec.wiggle.durationMs || 1600) / 1000;
  G.fromTo(line, { y: -(spec.wiggle.amountPx || 4) * scale, rotation: -(spec.wiggle.rotateDeg || 1.2) },
    { y: (spec.wiggle.amountPx || 4) * scale, rotation: spec.wiggle.rotateDeg || 1.2, duration: period / 2, ease: "sine.inOut", repeat: -1, yoyo: true });
}

/** วาดท่อนหนึ่งลงใน layer — คำที่ถึงคิวเปลี่ยนสีและเด้ง (ไม่สร้าง DOM ใหม่ทุกเฟรม) */
function paintCaption(layer, style, chunk, tMs, scale) {
  if (!style || !chunk) {
    if (layer.dataset.key) { layer.innerHTML = ""; layer.dataset.key = ""; layer.dataset.chunk = ""; }
    return;
  }
  const p = style.params;
  const spec = motionSpec(style);
  const key = `${chunk.id}|${chunk.text}|${chunk.sub || ""}|${scale.toFixed(4)}|${style.slug}|${p.activeFill}|${p.fill}|${p.font?.size}|${p.position?.anchor}`;
  if (layer.dataset.key !== key) {
    const hf = style.lane === "hyperframes";
    const chars = (chunk.words || []).reduce((n, w) => n + [...w.text].length, 0);
    const fit = hf ? clamp((p.fitChars ?? 14) / Math.max(1, chars), 0.68, 1) : 1;
    const fontPx = (p.font?.size ?? 90) * scale * fit;
    const words = chunk.words?.length ? chunk.words : [{ text: chunk.text, s: 0, e: chunk.text.length }];
    const wc = wordCss(style, scale);
    const spans = words.map((w, i) => {
      const trailing = /\s$/.test(chunk.text.slice(w.s, w.e)) ? " " : "";
      return `<span class="cap-w" data-i="${i}" style="${wc}">${esc(w.text)}${trailing}</span>`;
    }).join("");
    const sameChunk = layer.dataset.chunk === chunk.id;
    if (MOTION) G.killTweensOf(layer.querySelectorAll(".cap-line, .cap-sub, .cap-w"));
    layer.innerHTML = `<div class="cap-line" style="${lineCss(style, scale, fontPx)}">${spans}</div>` +
      (chunk.sub ? `<div class="cap-sub" style="${subCss(style, scale)}">${esc(chunk.sub)}</div>` : "");
    const anchor = p.position?.anchor || "bottom";
    const mv = (p.position?.marginV ?? 400) * scale;
    layer.style.top = anchor === "top" ? `${mv}px` : anchor === "middle" ? "50%" : "auto";
    layer.style.bottom = anchor === "bottom" ? `${mv}px` : "auto";
    layer.style.transform = anchor === "middle" ? "translateY(-50%)" : "none";
    layer.style.padding = `0 ${(p.position?.marginH ?? 80) * scale}px`;
    layer.dataset.key = key;
    layer.dataset.chunk = chunk.id;
    layer.dataset.active = "";
    // ท่าเข้าเล่นเฉพาะตอนท่อนใหม่ขึ้นจอ — แค่แก้ข้อความหรือเปลี่ยนสีท่อนเดิมไม่ต้องเล่นซ้ำ
    if (!sameChunk) playEnter([...layer.children], spec);
    startWiggle(layer.firstElementChild, spec, scale);
  }
  const words = chunk.words || [];
  let active = -1;
  for (let i = 0; i < words.length; i += 1) if (tMs >= words[i].startMs && tMs < words[i].endMs) active = i;
  if (String(active) === layer.dataset.active) return;
  layer.dataset.active = String(active);
  const idle = p.idleAlpha != null ? (1 - p.idleAlpha / 255).toFixed(2) : null;
  $$(".cap-w", layer).forEach((el, i) => {
    const on = i === active;
    if (!p.gradient) el.style.color = on ? p.activeFill : p.fill;
    el.style.opacity = idle && !on ? idle : "1";
    if (p.weightShift) el.style.fontWeight = on ? p.weightShift.active : p.weightShift.base;
    if (on) playPop(el, spec);
  });
}

/* ---------- ตัวอย่างสไตล์ที่ขยับจริง (การ์ดสไตล์) ---------- */
// แบบเดียวกับ StyleCaptionPreview ของ Clip360: ไล่คำทีละคำวนไปเรื่อย ๆ ทุกการ์ดเดินพร้อมกัน
// ต่างกันตรงที่ท่าเข้า/ท่าเด้งมาจาก GSAP ค่าเดียวกับตัวเรนเดอร์ ไม่ใช่ CSS ที่เดาให้คล้าย
const PREVIEW_WORDS = ["ตัวนี้", "ต้องมี", "บอกเลย", "ว่าคุ้ม"];
const WORD_MS = 620;
const liveLoops = new Set();
let liveTimer = 0;

function ensureLiveTicker() {
  if (liveTimer) return;
  liveTimer = window.setInterval(() => {
    for (const loop of liveLoops) {
      if (!loop.el.isConnected) { loop.stop(); liveLoops.delete(loop); continue; }
      loop.advance();
    }
    if (!liveLoops.size) { clearInterval(liveTimer); liveTimer = 0; }
  }, WORD_MS);
}
function stopLivePreviews() {
  for (const loop of liveLoops) loop.stop();
  liveLoops.clear();
}

/**
 * ติดตั้งซับตัวอย่างที่ขยับได้ลงในกล่อง (กล่องต้องมีขนาดแล้ว)
 * @param {HTMLElement} host กล่องภาพตัวอย่าง (position: relative)
 * @param {object} style สไตล์ดิบจาก /api/styles (ขนาดอ้างอิงจอกว้าง 1080)
 * @param {string[]} words คำที่จะไล่ — ไม่ส่งมาใช้ประโยคตัวอย่าง
 */
function mountLivePreview(host, style, words = PREVIEW_WORDS, { anchor } = {}) {
  host.querySelector(".live-cap")?.remove();
  const p = style.params;
  const spec = motionSpec(style);
  const scale = ((host.clientWidth || 180) / 1080) * 1.15;
  const fontPx = (p.font?.size ?? 90) * scale * ((p.font?.size ?? 90) >= 110 ? 0.85 : 1);
  const layer = document.createElement("div");
  const pos = anchor || p.position?.anchor || "bottom";
  layer.className = `live-cap anchor-${pos}${p.scanlines ? " scan" : ""}`;
  if (p.scanlines) {
    layer.style.setProperty("--scan-alpha", p.scanlines.alpha ?? 0.22);
    layer.style.setProperty("--scan-gap", `${p.scanlines.gap ?? 4}px`);
  }
  const wc = wordCss(style, scale);
  layer.innerHTML = `<div class="cap-line" style="${lineCss(style, scale, fontPx)};flex-wrap:wrap">${
    words.map((w, i) => `<span class="cap-w" data-i="${i}" style="${wc}">${esc(w)}${i < words.length - 1 ? " " : ""}</span>`).join("")}</div>`;
  host.appendChild(layer);
  const line = layer.firstElementChild;
  const spans = [...line.children];
  const idle = p.idleAlpha != null ? 1 - p.idleAlpha / 255 : (p.pill || p.box ? 1 : 0.72);
  let step = 0;
  const render = () => {
    spans.forEach((el, i) => {
      const now = step > 0 && i === step - 1;
      const todo = step === 0 || i > step - 1;
      if (!p.gradient) el.style.color = now ? p.activeFill : p.fill;
      el.style.opacity = todo && !now ? String(idle) : "1";
      if (p.weightShift) el.style.fontWeight = now ? p.weightShift.active : p.weightShift.base;
      if (now) playPop(el, spec);
    });
    if (step === 0) playEnter([line], spec);
  };
  render();
  startWiggle(line, spec, scale);
  const loop = {
    el: layer,
    advance() { step = (step + 1) % (spans.length + 1); render(); },
    stop() { if (MOTION) G.killTweensOf([line, ...spans]); },
  };
  liveLoops.add(loop);
  ensureLiveTicker();
  return loop;
}

/* ---------- ลูกเล่นหน้าเว็บ (GSAP) ---------- */
/** ส่วนต่าง ๆ ของหน้าเลื่อนขึ้นมาทีละชิ้น — clearProps คืนค่าเดิมหลังจบ ไม่ให้ transform ค้างจน sticky พัง */
function revealIn(targets, opts = {}) {
  if (!MOTION) return;
  const list = [...targets].filter(Boolean);
  if (!list.length) return;
  G.fromTo(list, { y: opts.y ?? 18, opacity: 0 }, {
    y: 0, opacity: 1, duration: opts.duration ?? 0.5, ease: "power3.out", stagger: opts.stagger ?? 0.06,
    delay: opts.delay ?? 0, clearProps: "transform,opacity",
  });
}
function popIn(targets, opts = {}) {
  if (!MOTION) return;
  const list = [...targets].filter(Boolean);
  if (!list.length) return;
  G.fromTo(list, { scale: opts.from ?? 0.6, opacity: 0 }, {
    scale: 1, opacity: 1, duration: opts.duration ?? 0.45, ease: "back.out(2.2)", stagger: opts.stagger ?? 0.05,
    delay: opts.delay ?? 0, clearProps: "transform,opacity",
  });
}
function countUp(el, value, { duration = 1.1, decimals = 0, suffix = "" } = {}) {
  if (!el) return;
  if (!MOTION) { el.textContent = `${value.toFixed(decimals)}${suffix}`; return; }
  const obj = { v: 0 };
  G.to(obj, { v: value, duration, ease: "power2.out", onUpdate: () => { el.textContent = `${obj.v.toFixed(decimals)}${suffix}`; } });
}
/** แถบความคืบหน้าเลื่อนนุ่ม ๆ แทนกระโดด */
function tweenBar(bar, pct) {
  if (!bar) return;
  if (!MOTION) { bar.style.width = `${pct}%`; return; }
  G.to(bar, { width: `${pct}%`, duration: 0.6, ease: "power2.out", overwrite: true });
}

/** เครื่องเล่นวิดีโอ + เลเยอร์ซับตัวอย่าง (อยู่ในแผงมืดด้านขวา) */
function createPlayer(host, { src, meta, getChunks, getStyle, onTick }) {
  host.innerHTML = `
    <div class="phone-stage"><div class="player ${meta && meta.height > meta.width ? "portrait" : ""}"><video preload="metadata" playsinline src="${esc(src)}"></video><div class="cap-layer"></div></div></div>
    <div class="player-bar">
      <button class="icon-button sm" data-act="toggle" aria-label="เล่น/หยุด">${icon("play")}</button>
      <input class="scrub" type="range" min="0" max="${meta?.durationMs || 1000}" value="0" step="10" aria-label="ตำแหน่งวิดีโอ" />
      <span class="time">0:00.00</span>
    </div>`;
  const video = $("video", host);
  const layer = $(".cap-layer", host);
  const scrub = $(".scrub", host);
  const time = $(".time", host);
  const toggle = $('[data-act="toggle"]', host);
  let raf = 0;
  let lastIdx = -2;
  let alive = true;

  const tick = () => {
    if (!alive) return;
    const t = video.currentTime * 1000;
    const chunks = getChunks?.() || [];
    let idx = -1;
    for (let i = 0; i < chunks.length; i += 1) { if (t >= chunks[i].startMs && t < chunks[i].endMs) { idx = i; break; } }
    // วาง layer ทับเฉพาะพื้นที่ภาพจริง ไม่ใช่ทั้งกล่อง
    layer.style.left = `${video.offsetLeft}px`;
    layer.style.width = `${video.clientWidth}px`;
    layer.style.right = "auto";
    const scale = meta?.width ? video.clientWidth / meta.width : 1;
    paintCaption(layer, getStyle?.(), chunks[idx], t, scale);
    if (idx !== lastIdx) { lastIdx = idx; onTick?.(idx, t); }
    if (document.activeElement !== scrub) scrub.value = String(Math.round(t));
    time.textContent = fmtTime(t);
    raf = requestAnimationFrame(tick);
  };

  const flip = () => (video.paused ? video.play().catch(() => {}) : video.pause());
  toggle.addEventListener("click", flip);
  video.addEventListener("click", flip);
  video.addEventListener("play", () => { toggle.innerHTML = icon("pause"); });
  video.addEventListener("pause", () => { toggle.innerHTML = icon("play"); });
  scrub.addEventListener("input", () => { video.currentTime = Number(scrub.value) / 1000; });
  raf = requestAnimationFrame(tick);

  return {
    video,
    seek(ms, play = false) {
      video.currentTime = Math.max(0, ms) / 1000 + 0.001;
      if (play) video.play().catch(() => {});
    },
    refresh() { layer.dataset.key = ""; lastIdx = -2; },
    destroy() { alive = false; cancelAnimationFrame(raf); video.pause(); video.removeAttribute("src"); video.load(); },
  };
}

/* ---------- โครงหน้า ---------- */
let cleanup = () => {};
const view = () => $("#view");

function setPage(nav, crumb) {
  $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === nav));
  $("#crumb-page").textContent = crumb;
  document.title = `${crumb} · Sub360`;
  closeSidebar();
}
function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#sidebar-scrim").classList.remove("open");
}
$("#menu-button").addEventListener("click", () => {
  $("#sidebar").classList.add("open");
  $("#sidebar-scrim").classList.add("open");
});
$("#sidebar-close").addEventListener("click", closeSidebar);
$("#sidebar-scrim").addEventListener("click", closeSidebar);

function projectState(p) {
  if (JOB_ACTIVE(p)) return { cls: "running", pill: "yellow", text: `${JOB_LABEL[p.job.type] || "กำลังทำงาน"} ${Math.round(p.job.pct || 0)}%` };
  if (p.status === "rendered") return { cls: "done", pill: "green", text: "พร้อมดาวน์โหลด" };
  if (p.status === "ready") return { cls: "", pill: "dark", text: "รอตรวจซับ" };
  if (p.status === "failed") return { cls: "failed", pill: "red", text: "ถอดเสียงไม่สำเร็จ" };
  return { cls: "", pill: "", text: "รอถอดเสียง" };
}
const statusPill = (p) => {
  const s = projectState(p);
  return `<span class="pill ${s.pill}">${s.cls === "done" ? icon("check") : s.cls === "running" ? '<span class="spinner" style="width:10px;height:10px"></span>' : ""}${s.text}</span>`;
};
const thumbVideo = (p) => (p.meta ? `<img src="/api/projects/${p.id}/poster" alt="" loading="lazy" onerror="this.remove()" />` : "");

async function refreshSidebar() {
  try {
    const { projects } = await api("/projects");
    const current = location.hash.split("/")[2];
    const host = $("#side-projects");
    const html = projects.slice(0, 6).map((p) => {
      const s = projectState(p);
      return `<a class="mini-project ${p.id === current ? "active" : ""}" href="#/p/${p.id}" data-id="${p.id}">
        <span class="mini-project-thumb">${thumbVideo(p)}</span>
        <span><b>${esc(p.title)}</b><small class="${s.cls}">${s.text}</small></span></a>`;
    }).join("") || `<div class="mini-empty">ยังไม่มีโปรเจกต์</div>`;
    // วาดใหม่เฉพาะตอนมีอะไรเปลี่ยน — ไม่งั้นภาพย่อวิดีโอกระพริบทุก 5 วินาที
    if (host.dataset.html !== html) {
      host.innerHTML = html;
      host.dataset.html = html;
    }
    return projects;
  } catch {
    return [];
  }
}

async function refreshStatus() {
  const card = $("#system-ready");
  const chip = $("#engine-chip");
  try {
    statusCache = await api("/status");
    const s = statusCache;
    const ok = s.ffmpeg && s.whisper;
    card.className = `system-ready ${ok ? "" : "warn"}`;
    card.innerHTML = `<span class="status-orbit"><span></span></span><div><b>${ok ? "เครื่องพร้อมใช้งาน" : "ยังตั้งค่าไม่ครบ"}</b><small>${[
      s.whisper ? "whisper" : "ไม่มี whisper", s.ffmpeg ? "FFmpeg" : "ไม่มี FFmpeg", s.gemini?.ready ? "Gemini" : null,
    ].filter(Boolean).join(" · ")}${ok ? " พร้อมแล้ว" : " — ดูหน้าตั้งค่า"}</small></div>`;
    chip.className = `engine-chip ${ok ? "ok" : "warn"}`;
    chip.innerHTML = `${icon("radio", "i-sm")}<span>LOCAL ${ok ? "เชื่อมต่อแล้ว" : "ตั้งค่าไม่ครบ"}</span>`;
    if (s.version) {
      const v = $("#app-version");
      v.textContent = `Sub360 v${s.version.version}${s.version.commit ? ` · ${s.version.commit}` : ""}`;
      v.title = s.version.date ? `อัปเดตล่าสุด ${s.version.date}` : "";
    }
  } catch {
    card.className = "system-ready warn";
    card.innerHTML = `<span class="status-orbit"><span></span></span><div><b>ติดต่อเซิร์ฟเวอร์ไม่ได้</b><small>เปิดโปรแกรมด้วย เริ่มโปรแกรม.bat</small></div>`;
    chip.className = "engine-chip warn";
    chip.innerHTML = `${icon("radio", "i-sm")}<span>LOCAL ออฟไลน์</span>`;
  }
  return statusCache;
}

async function route() {
  cleanup();
  cleanup = () => {};
  stopLivePreviews();
  $("#modal-root").innerHTML = "";
  const [head, id] = location.hash.replace(/^#\/?/, "").split("/");
  // เปิดครั้งแรกแล้วเครื่องยังไม่พร้อม (ไม่มี FFmpeg หรือตัวถอดเสียง) → พาไปหน้าตั้งค่าครั้งแรกเลย
  // ไม่ต้องให้ผู้ใช้หาเองว่าต้องเริ่มตรงไหน แบบเดียวกับ Clip360
  if (head !== "setup" && store.get("setupDone") !== "1") {
    const status = statusCache || await refreshStatus();
    if (status && !status.setupReady) {
      location.replace("#/setup");
      return;
    }
  }
  document.body.classList.toggle("setup-mode", head === "setup");
  try {
    if (head === "new") await pageNew();
    else if (head === "p" && id) await pageProject(id);
    else if (head === "projects") await pageProjects();
    else if (head === "styles") await pageStyles();
    else if (head === "setup") await pageSetup();
    else if (head === "settings") await pageSettings();
    else await pageHome();
  } catch (error) {
    view().innerHTML = `<div class="page"><div class="form-alert error">${icon("alert")}<div>${esc(error.message)}</div></div></div>`;
  }
  hydrateIcons();
  refreshSidebar();
  window.scrollTo(0, 0);
  // หน้าโปรเจกต์คุมจังหวะเองตอนเปลี่ยนขั้น — ที่นี่เล่นเฉพาะหน้าอื่น
  if (head !== "p") revealIn($$(".page > *, .wizard-page > *:not(#step)", view()), { stagger: 0.07 });
  else revealIn($$(".wizard-heading, .wizard-stepper", view()), { y: 12, stagger: 0.06 });
}

/* ---------- ภาพรวม ---------- */
async function pageHome() {
  setPage("home", "ภาพรวม");
  const [{ projects }, status] = await Promise.all([api("/projects"), statusCache ? Promise.resolve(statusCache) : refreshStatus()]);
  const latest = projects.find((p) => p.status === "rendered") || projects.find((p) => p.meta);
  const phoneMedia = latest
    ? `<video muted autoplay loop playsinline preload="metadata" src="/api/projects/${latest.id}/${latest.status === "rendered" ? "file/mp4" : "source"}"></video>`
    : `<div class="phone-fill"></div>`;
  const showFakeCaption = !latest || latest.status !== "rendered";
  const running = projects.find(JOB_ACTIVE);

  view().innerHTML = `<div class="page page-stack">
    <div class="dashboard-heading">
      <div>
        <p class="eyebrow">แดชบอร์ดครีเอเตอร์</p>
        <h1>สวัสดีครับ ครีเอเตอร์ 👋</h1>
        <p class="sub">อัปโหลดวิดีโอที่มีเสียงพูด Sub360 จะถอดเสียงบนเครื่องคุณ ให้ตรวจแก้ทีละท่อน แล้วเรนเดอร์ซับสวย ๆ พร้อมไฟล์ SRT ในไม่กี่นาที</p>
      </div>
      <a class="button button-primary" href="#/new">${icon("plus")}สร้างซับใหม่</a>
    </div>

    <section class="stats-strip">
      <div class="stat"><span class="stat-icon yellow">${icon("film")}</span><div><small>โปรเจกต์ทั้งหมด</small><b data-count="${projects.length}">0</b></div></div>
      <div class="stat"><span class="stat-icon green">${icon("check")}</span><div><small>เรนเดอร์เสร็จแล้ว</small><b data-count="${projects.filter((p) => p.status === "rendered").length}">0</b></div></div>
      <div class="stat"><span class="stat-icon purple">${icon("captions")}</span><div><small>ท่อนซับที่ทำไว้</small><b data-count="${projects.reduce((n, p) => n + (p.chunkCount || 0), 0)}">0</b></div></div>
      <div class="stat"><span class="stat-icon dark">${icon("clock")}</span><div><small>นาทีวิดีโอที่ทำซับ</small><b data-count="${(projects.reduce((n, p) => n + (p.meta?.durationMs || 0), 0) / 60000).toFixed(1)}" data-decimals="1">0</b></div></div>
    </section>

    <section class="creator-hero">
      <div class="hero-copy">
        <span class="hero-pill">${icon("sparkles", "i-sm")}ถอดเสียงไทยบนเครื่องคุณ ไม่ต้องอัปโหลดขึ้นเว็บ</span>
        <h2><span class="hero-line">ซับไทยตรงทุกคำ</span><br/><mark>ในไม่กี่นาที</mark></h2>
        <p>whisper ถอดเสียงพร้อมจังหวะรายคำ ให้ AI ช่วยแก้คำผิดหรือแปลเป็นภาษาอื่นได้ เลือกสไตล์ซับ 15 แบบ แล้วได้ MP4 พร้อมโพสต์</p>
        <div class="hero-actions">
          <a class="button button-dark" href="#/new">${icon("upload")}อัปโหลดวิดีโอ</a>
          <a class="button button-ghost-dark" href="#/styles">ดูสไตล์ซับ ${icon("arrowRight", "i-sm")}</a>
        </div>
        <div class="hero-proof"><span>${icon("check")}ไม่มีค่าใช้จ่ายต่อคลิป</span><span>${icon("check")}วิดีโออยู่บนเครื่องคุณ</span><span>${icon("check")}แก้ได้ทุกคำก่อนเรนเดอร์</span></div>
      </div>
      <div class="hero-studio" aria-hidden="true">
        <div class="hero-grid-lines"></div>
        <div class="floating-card fc-1"><span class="float-icon">${icon("mic")}</span><div><small>WHISPER</small><b>ถอดเสียงรายคำ</b></div></div>
        <div class="floating-card fc-2"><span class="float-icon">${icon("languages")}</span><div><small>GEMINI</small><b>แก้คำ · แปล 9 ภาษา</b></div></div>
        <div class="hero-sticker">ซับ<br/>ตรงปาก!</div>
        <div class="hero-phone">${phoneMedia}${showFakeCaption ? `<div class="phone-cap">ซับไทย <b>สวย ๆ</b></div><div class="phone-sub">Beautiful Thai subtitles</div>` : ""}</div>
      </div>
    </section>

    <div class="dashboard-grid">
      <section class="panel projects-panel">
        <div class="section-heading">
          <div><h2>โปรเจกต์ล่าสุด</h2><p>คลิปที่ทำไว้ในเครื่องนี้ กดเพื่อแก้ต่อหรือดาวน์โหลด</p></div>
          <a class="text-link" href="#/projects">ดูทั้งหมด ${icon("chevronRight", "i-sm")}</a>
        </div>
        <div class="project-list">${projects.slice(0, 6).map(projectRow).join("") || `
          <div class="empty-state"><span class="quick-icon yellow">${icon("film")}</span><b>ยังไม่มีโปรเจกต์</b><span>เริ่มจากอัปโหลดวิดีโอแรกของคุณ</span><a class="button button-primary button-sm" href="#/new">สร้างซับใหม่</a></div>`}</div>
      </section>
      <div class="page-stack" style="gap:18px">
        <section class="panel-dark running-card" id="running-card">${runningCard(running)}</section>
        <section class="panel quick-card">
          <div class="section-heading" style="margin-bottom:8px"><div><h2>ทางลัด</h2></div></div>
          <a class="quick-link" href="#/new"><span class="quick-icon yellow">${icon("upload")}</span><span><b>อัปโหลดวิดีโอ</b><small>ถอดเสียงอัตโนมัติด้วย whisper</small></span></a>
          <a class="quick-link" href="#/styles"><span class="quick-icon purple">${icon("captions")}</span><span><b>คลังสไตล์ซับ</b><small>15 สไตล์ · 8 ชุดสี</small></span></a>
          <a class="quick-link" href="#/settings"><span class="quick-icon green">${icon("key")}</span><span><b>${status?.gemini?.ready ? "Gemini พร้อมใช้" : "ใส่ Gemini API key"}</b><small>สำหรับ AI แก้คำและแปลซับ</small></span></a>
        </section>
      </div>
    </div>
  </div>`;
  $$("[data-count]").forEach((el) => countUp(el, Number(el.dataset.count), { decimals: Number(el.dataset.decimals || 0) }));
  heroMotion();
  let lastRunning = JSON.stringify(running?.job || null);
  const timer = setInterval(async () => {
    const { projects: next } = await api("/projects").catch(() => ({ projects: [] }));
    const r = next.find(JOB_ACTIVE);
    const key = JSON.stringify(r?.job || null);
    if (key === lastRunning) return;
    lastRunning = key;
    const card = $("#running-card");
    if (card) { card.innerHTML = runningCard(r); hydrateIcons(card); }
  }, 2500);
  cleanup = () => clearInterval(timer);
}

/** ไทม์ไลน์ของ hero: ข้อความไล่ขึ้น → ไฮไลต์ปาดสีเหลือง → มือถือลอยขึ้น → การ์ดเด้ง แล้วลอยวนเบา ๆ */
function heroMotion() {
  if (!MOTION || !$(".creator-hero")) return;
  const tl = G.timeline({ defaults: { ease: "power3.out" } });
  tl.from(".hero-pill", { y: 12, opacity: 0, duration: 0.4 })
    .from(".hero-line", { y: 30, opacity: 0, duration: 0.55 }, "-=0.15")
    .from(".hero-copy h2 mark", { clipPath: "inset(0 100% 0 0)", duration: 0.6, ease: "power2.inOut" }, "-=0.25")
    .from(".hero-copy > p, .hero-actions, .hero-proof", { y: 16, opacity: 0, duration: 0.45, stagger: 0.08, clearProps: "transform,opacity" }, "-=0.3")
    .from(".hero-phone", { y: 120, rotation: 10, opacity: 0, duration: 0.9, ease: "back.out(1.2)" }, 0.15)
    .from(".floating-card", { scale: 0.4, opacity: 0, duration: 0.5, stagger: 0.15, ease: "back.out(2.4)" }, 0.6)
    .from(".hero-sticker", { scale: 0, rotation: -140, duration: 0.7, ease: "back.out(2)" }, 0.8)
    .add(() => {
      // ลอยวนหลังเข้ามาครบ — ให้หน้าแรกมีชีวิตแต่ไม่แย่งสายตา
      G.to(".floating-card.fc-1", { y: -10, duration: 2.2, repeat: -1, yoyo: true, ease: "sine.inOut" });
      G.to(".floating-card.fc-2", { y: 10, duration: 2.6, repeat: -1, yoyo: true, ease: "sine.inOut" });
      G.to(".hero-sticker", { rotation: 16, duration: 1.8, repeat: -1, yoyo: true, ease: "sine.inOut" });
      G.to(".hero-phone", { y: -8, duration: 3, repeat: -1, yoyo: true, ease: "sine.inOut" });
    });
  // ถ้ามีซับตัวอย่างปลอม ไล่คำให้ดูเหมือนคาราโอเกะจริง
  const cap = $(".phone-cap b");
  if (cap) G.fromTo(cap, { scale: 1 }, { scale: 1.16, duration: 0.18, repeat: -1, yoyo: true, repeatDelay: 1.2, ease: "power2.out" });
}

function projectRow(p) {
  return `<a class="project-row" href="#/p/${p.id}">
    <span class="project-thumb">${thumbVideo(p)}</span>
    <span class="project-main"><h3>${esc(p.title)}</h3>
      <p>${p.meta ? `${fmtTime(p.meta.durationMs, false)} นาที · ${p.meta.width}×${p.meta.height}` : fmtBytes(p.source?.size)} · ${p.chunkCount} ท่อน${p.translation ? " · แปลแล้ว" : ""}</p>
      ${statusPill(p)}</span>
    <time>${fmtDate(p.updatedAt)}</time></a>`;
}

function runningCard(p) {
  if (!p) {
    return `<div class="running-top"><span class="live-pill">ว่าง</span>${icon("clock")}</div>
      <h3>พร้อมสร้างซับใหม่</h3><p>ยังไม่มีงานที่กำลังทำ อัปโหลดวิดีโอเพื่อเริ่มถอดเสียงได้เลย</p>
      <a class="button button-ghost-dark" href="#/new">เริ่มทำซับ ${icon("arrowRight", "i-sm")}</a>`;
  }
  return `<div class="running-top"><span class="live-pill"><i></i>กำลังทำงาน</span>${icon("clock")}</div>
    <h3>${esc(p.title)}</h3><p>${esc(JOB_LABEL[p.job.type] || "")} · ${esc(p.job.message || "")}</p>
    <div class="progress"><span style="width:${p.job.pct || 0}%"></span></div>
    <div class="running-meta"><span>${Math.round(p.job.pct || 0)}%</span><span>ปิดหน้านี้ได้ งานยังทำต่อ</span></div>
    <a class="button button-ghost-dark" href="#/p/${p.id}">ดูความคืบหน้า ${icon("arrowRight", "i-sm")}</a>`;
}

/* ---------- รายการโปรเจกต์ ---------- */
async function pageProjects() {
  setPage("projects", "โปรเจกต์ของฉัน");
  const { projects } = await api("/projects");
  const filters = [
    ["all", "ทั้งหมด", () => true],
    ["running", "กำลังทำ", JOB_ACTIVE],
    ["review", "รอตรวจซับ", (p) => p.status === "ready" && !JOB_ACTIVE(p)],
    ["done", "พร้อมดาวน์โหลด", (p) => p.status === "rendered"],
  ];
  let filter = "all";
  let q = "";
  view().innerHTML = `<div class="page page-stack" style="width:min(1000px,100%)">
    <div class="dashboard-heading">
      <div><h1 style="font-size:clamp(24px,2.6vw,32px)">โปรเจกต์ของฉัน</h1><p class="sub">${projects.length} คลิป เก็บอยู่บนเครื่องนี้</p></div>
      <a class="button button-primary" href="#/new">${icon("plus")}สร้างซับใหม่</a>
    </div>
    <div class="projects-toolbar">
      <label class="search-box">${icon("search")}<input class="input" id="q" placeholder="ค้นหาจากชื่อโปรเจกต์" /></label>
      <div class="filter-row" id="filters">${filters.map(([fid, label, fn]) => `<button data-f="${fid}" class="${fid === filter ? "active" : ""}">${label}<em>${projects.filter(fn).length}</em></button>`).join("")}</div>
    </div>
    <section class="panel projects-list" id="list"></section>
  </div>`;
  const draw = () => {
    const fn = filters.find((f) => f[0] === filter)[2];
    const rows = projects.filter(fn).filter((p) => !q || p.title.toLowerCase().includes(q));
    $("#list").innerHTML = rows.map((p) => projectRow(p).replace("<time>", `<span class="row-actions"><button class="icon-button sm" data-del="${p.id}" aria-label="ลบ">${icon("trash")}</button></span><time>`)).join("")
      || `<div class="empty-state"><span class="quick-icon yellow">${icon("search")}</span><span>${projects.length ? "ไม่พบโปรเจกต์ที่ตรงกับเงื่อนไข" : "ยังไม่มีโปรเจกต์"}</span></div>`;
  };
  draw();
  $("#q").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    filter = b.dataset.f;
    $$("#filters button").forEach((x) => x.classList.toggle("active", x === b));
    draw();
  });
  $("#list").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-del]");
    if (!b) return;
    e.preventDefault();
    const p = projects.find((x) => x.id === b.dataset.del);
    if (!(await confirmBox("ลบโปรเจกต์นี้?", `"${esc(p.title)}" และไฟล์ทั้งหมดของมัน (วิดีโอต้นฉบับ ซับ และผลลัพธ์) จะถูกลบออกจากเครื่อง`, "ลบโปรเจกต์", "button-danger"))) return;
    await api(`/projects/${p.id}`, { method: "DELETE" });
    projects.splice(projects.indexOf(p), 1);
    draw();
    refreshSidebar();
  });
}

/* ---------- สร้างซับใหม่ ---------- */
const STEPS = [
  { id: 1, label: "วิดีโอ", helper: "ถอดเสียง", icon: "mic" },
  { id: 2, label: "แก้ซับ", helper: "ตรวจทุกคำ", icon: "edit" },
  { id: 3, label: "สไตล์", helper: "หน้าตาซับ", icon: "palette" },
  { id: 4, label: "ผลลัพธ์", helper: "เรนเดอร์/โหลด", icon: "download" },
];
const stepperHtml = (active, enabled = () => true, done = () => false) => STEPS.map((s, i) => {
  const complete = done(s.id);
  return `<button data-step="${s.id}" class="${s.id === active ? "active" : ""} ${complete ? "complete" : ""}" ${enabled(s.id) ? "" : "disabled"}>
    <span class="step-number">${complete ? icon("check") : icon(s.icon)}</span><span class="step-copy"><b>${s.label}</b><small>${s.helper}</small></span>
    ${i < STEPS.length - 1 ? '<i class="step-rail"></i>' : ""}</button>`;
}).join("");

async function pageNew() {
  setPage("new", "สร้างซับใหม่");
  const status = await refreshStatus();
  const gemini = Boolean(status?.gemini?.ready);
  let file = null;
  let subFile = null;
  let lang = store.get("lang", "th");
  let aiRefine = gemini && store.get("aiRefine", "0") === "1";
  let previewUrl = null;

  view().innerHTML = `<div class="wizard-page">
    <div class="wizard-heading">
      <div class="wizard-title-row">
        <a class="back-link" href="#/" aria-label="กลับ">${icon("arrowLeft")}</a>
        <div><div class="title-line"><h1 style="font-size:21px;font-weight:600;letter-spacing:-0.03em">โปรเจกต์ใหม่</h1></div><p>อัปโหลดวิดีโอเพื่อเริ่ม · บันทึกอัตโนมัติทุกขั้น</p></div>
      </div>
    </div>
    <nav class="wizard-stepper">${stepperHtml(1, (sid) => sid === 1)}</nav>
    <div class="wizard-workspace">
      <section class="wizard-card">
        <div class="step-panel">
          <div class="step-panel-heading"><div>
            <span class="step-kicker">ขั้นที่ 1 จาก 4</span>
            <h2>อัปโหลดวิดีโอของคุณ</h2>
            <p>เลือกวิดีโอที่มีเสียงพูด ระบบจะถอดเสียงด้วย whisper บนเครื่องนี้ แบ่งเป็นท่อนซับพร้อมจังหวะรายคำ แล้วพาไปตรวจแก้ต่อ</p>
          </div></div>
          <div class="step-body">
            ${status && !status.whisper ? `<div class="form-alert error">${icon("alert")}<div>ยังไม่ได้ตั้งค่าตัวถอดเสียง whisper — <a href="#/settings"><u>ไปหน้าตั้งค่า</u></a> หรือแนบไฟล์ซับที่มีอยู่แล้วแทน</div></div>` : ""}
            <label class="upload-zone" id="drop">
              <span class="upload-illustration">${icon("upload")}</span>
              <h3>ลากวิดีโอมาวางตรงนี้</h3>
              <p>หรือ <span>เลือกไฟล์จากเครื่องของคุณ</span></p>
              <small>MP4, MOV, MKV, WEBM · ไม่เกิน 8 GB · แนวตั้งหรือแนวนอนก็ได้</small>
              <input type="file" accept="video/*,.mkv" hidden id="file" />
            </label>
            <div class="upload-progress" id="picked" hidden></div>
            <div class="option-grid">
              <div class="field"><span>ภาษาที่พูดในวิดีโอ</span>
                <div class="seg" id="lang">${[["th", "ไทย"], ["en", "อังกฤษ"], ["auto", "ให้ระบบเดา"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${v === lang ? "on" : ""}">${l}</button>`).join("")}</div>
              </div>
              <label class="field"><span>คำเฉพาะในคลิป <small>ไม่บังคับ</small></span>
                <input class="input" id="glossary" maxlength="400" placeholder="เช่น ชื่อแบรนด์ ชื่อคน ศัพท์เทคนิค" />
              </label>
            </div>
            <label class="toggle ${gemini ? "" : "disabled"}">
              <input type="checkbox" id="ai" ${aiRefine ? "checked" : ""} ${gemini ? "" : "disabled"} />
              <span><b>ให้ AI ฟังซ้ำและแก้คำผิดหลังถอดเสียง</b>
              <small>${gemini ? "ส่งเสียงของคลิปไปให้ Google Gemini ตรวจทานชื่อเฉพาะ ศัพท์อังกฤษ และคำที่ถอดผิด — เวลาของแต่ละคำยังมาจาก whisper เหมือนเดิม" : `ต้องใส่ Gemini API key ก่อน — <a href="#/settings"><u>ไปหน้าตั้งค่า</u></a>`}</small></span>
            </label>
            <div class="attach-row">${icon("fileText")}<span style="flex:1" id="sub-label"></span>
              <label class="button button-quiet button-sm">เลือกไฟล์ซับ<input type="file" id="subfile" accept=".srt,.vtt,.ass,.ssa,text/plain" hidden /></label>
            </div>
            <div class="form-alert">${icon("shield")}<div>วิดีโอเก็บอยู่ในโฟลเดอร์ <b>data/</b> ของ Sub360 บนเครื่องนี้เท่านั้น — จะมีข้อมูลออกไปภายนอกก็ต่อเมื่อคุณเลือกใช้ AI ของ Gemini</div></div>
          </div>
        </div>
        <div class="wizard-card-footer">
          <a class="button button-quiet" href="#/">ยกเลิก</a>
          <span class="faint" id="footer-note">เลือกวิดีโอก่อน</span>
          <button class="button button-primary" id="start" disabled></button>
        </div>
      </section>
      <aside class="live-preview-panel">
        <div class="preview-panel-head"><div><b>ดูวิดีโอก่อนเริ่ม</b><p>เลือกไฟล์แล้วจะเห็นตัวอย่างตรงนี้</p></div><span class="live-pill">ขั้นที่ 1</span></div>
        <div class="phone-stage" id="preview-stage"><div class="empty-phone">${icon("film")}</div></div>
        <ol class="preview-checklist">
          <li class="now"><span>1</span>อัปโหลดวิดีโอ</li>
          <li><span>2</span>ถอดเสียงและตรวจแก้ซับ</li>
          <li><span>3</span>เลือกสไตล์และชุดสี</li>
          <li><span>4</span>เรนเดอร์และดาวน์โหลด</li>
        </ol>
      </aside>
    </div>
  </div>`;

  const refresh = () => {
    $("#start").disabled = !file;
    $("#start").innerHTML = `${subFile ? "นำเข้าซับและไปต่อ" : aiRefine ? "ถอดเสียงและให้ AI ตรวจ" : "เริ่มถอดเสียง"} ${icon("arrowRight", "i-sm")}`;
    $("#footer-note").textContent = file ? `${file.name} · ${fmtBytes(file.size)}` : "เลือกวิดีโอก่อน";
    $("#sub-label").innerHTML = subFile
      ? `แนบไฟล์ซับ <b>${esc(subFile.name)}</b> แล้ว — ใช้ซับนี้แทนการถอดเสียง · <a href="#" id="sub-clear"><u>เอาออก</u></a>`
      : "มีไฟล์ซับอยู่แล้ว? แนบ <b>SRT / VTT / ASS</b> เพื่อข้ามการถอดเสียงแล้วแต่งสไตล์ได้เลย";
    $("#sub-clear")?.addEventListener("click", (e) => { e.preventDefault(); subFile = null; $("#subfile").value = ""; refresh(); });
  };
  refresh();
  const pick = (f) => {
    if (!f) return;
    file = f;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(f);
    $("#preview-stage").innerHTML = `<div class="player"><video controls playsinline preload="metadata" src="${previewUrl}"></video></div>`;
    $("#picked").hidden = false;
    $("#picked").innerHTML = `<div class="row">${icon("film")}<b style="font-weight:500">${esc(f.name)}</b><span class="faint">${fmtBytes(f.size)}</span><span class="spacer"></span><button type="button" class="button button-quiet button-sm" id="change">เปลี่ยนไฟล์</button></div>`;
    $("#drop").hidden = true;
    $("#change").addEventListener("click", () => $("#file").click());
    refresh();
  };
  $("#file").addEventListener("change", (e) => pick(e.target.files[0]));
  $("#subfile").addEventListener("change", (e) => { subFile = e.target.files[0] || null; refresh(); });
  const drop = $("#drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const files = [...e.dataTransfer.files];
    const sub = files.find((f) => /\.(srt|vtt|ass|ssa)$/i.test(f.name));
    if (sub) subFile = sub;
    pick(files.find((f) => /^video\//.test(f.type) || /\.(mkv|mov|mp4|webm|m4v|avi)$/i.test(f.name)));
    refresh();
  });
  $("#lang").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    lang = b.dataset.v;
    store.set("lang", lang);
    $$("#lang button").forEach((x) => x.classList.toggle("on", x === b));
  });
  $("#ai").addEventListener("change", (e) => { aiRefine = e.target.checked; store.set("aiRefine", aiRefine ? "1" : "0"); refresh(); });

  let xhr = null;
  $("#start").addEventListener("click", async () => {
    if (!file) return;
    const subText = subFile ? await subFile.text() : null;
    $("#start").disabled = true;
    $("#picked").innerHTML = `<div class="row"><span class="spinner"></span><b style="font-weight:500">กำลังอัปโหลด ${esc(file.name)}</b><span class="spacer"></span><span class="faint" id="up-pct">0%</span></div><div class="progress"><span id="up-bar" style="width:0%"></span></div>`;
    xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/projects");
    xhr.setRequestHeader("x-sub360", "1");
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
    xhr.setRequestHeader("x-language", lang);
    xhr.setRequestHeader("x-glossary", encodeURIComponent($("#glossary").value.trim()));
    xhr.setRequestHeader("x-style", store.get("style", "karaoke-pop"));
    if (aiRefine) xhr.setRequestHeader("x-ai-refine", "1");
    if (subText) xhr.setRequestHeader("x-skip-transcribe", "1");
    xhr.upload.onprogress = (e) => {
      const pct = e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : 0;
      $("#up-bar").style.width = `${pct}%`;
      $("#up-pct").textContent = pct < 100 ? `${pct}%` : "กำลังตรวจไฟล์…";
    };
    xhr.onload = async () => {
      const data = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 300) {
        toast(data.error || "อัปโหลดไม่สำเร็จ");
        route();
        return;
      }
      const pid = data.project.id;
      if (subText) {
        try {
          await api(`/projects/${pid}/import`, { method: "POST", body: { text: subText } });
          stepMemory.set(pid, 2);
          toast("นำเข้าซับแล้ว");
        } catch (error) {
          toast(`นำเข้าซับไม่สำเร็จ: ${error.message}`);
        }
      }
      location.hash = `#/p/${pid}`;
    };
    xhr.onerror = () => { toast("อัปโหลดไม่สำเร็จ"); route(); };
    xhr.send(file);
  });
  cleanup = () => {
    if (xhr && xhr.readyState !== 4) xhr.abort();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  };
}

/* ---------- โปรเจกต์ (4 ขั้น) ---------- */
const stepMemory = new Map();

async function pageProject(id) {
  setPage("", "โปรเจกต์");
  let { project } = await api(`/projects/${id}`);
  const catalog = await getCatalog();
  if (!statusCache) await refreshStatus();
  const langName = (code) => catalog.languages.find((l) => l.id === code)?.name || code;
  let step = stepMemory.get(id) || (project.status === "rendered" ? 4 : project.timeline ? 2 : 1);
  let player = null;
  let pollTimer = null;
  let stepCleanup = () => {};
  let stepApi = {};
  $("#crumb-page").textContent = project.title;

  // สถานะหน้าแก้ซับ — เก็บไว้ระดับหน้า เปลี่ยนขั้นไปมาแล้วไม่หาย
  const edit = { chunks: structuredClone(project.timeline?.chunks || []), version: 0, saved: 0, saving: false, timer: null };
  const hasTr = () => Boolean(project.translation);
  const shown = () => displayChunks(edit.chunks, project.settings.display, hasTr());
  const aiBusy = () => JOB_ACTIVE(project) && ["transcribe", "refine", "translate"].includes(project.job.type);
  const gemini = () => Boolean(statusCache?.gemini?.ready);

  view().innerHTML = `<div class="wizard-page">
    <div class="wizard-heading">
      <div class="wizard-title-row">
        <a class="back-link" href="#/projects" aria-label="กลับไปหน้าโปรเจกต์">${icon("arrowLeft")}</a>
        <div>
          <div class="title-line"><input class="title-input" id="title" value="${esc(project.title)}" aria-label="ชื่อโปรเจกต์" /><span id="save-pill"></span></div>
          <p id="head-meta"></p>
        </div>
      </div>
      <div class="heading-actions row"><span id="head-pill"></span><button class="button button-quiet button-sm" id="del">${icon("trash")}<span>ลบ</span></button></div>
    </div>
    <nav class="wizard-stepper" id="stepper"></nav>
    <div id="step"></div>
  </div>`;

  const renderHead = () => {
    const m = project.meta;
    $("#head-meta").textContent = [
      m ? `${m.width}×${m.height}` : null, m ? fmtDuration(m.durationMs) : null,
      project.timeline ? `${edit.chunks.length} ท่อน` : null,
      project.refined ? "AI ตรวจแล้ว" : null,
      project.translation ? `แปลเป็น${langName(project.translation.lang)}` : null,
      project.imported ? "นำเข้าจากไฟล์ซับ" : null,
    ].filter(Boolean).join(" · ");
    $("#head-pill").innerHTML = statusPill(project);
    hydrateIcons($("#head-pill"));
  };
  renderHead();

  $("#title").addEventListener("change", async (e) => {
    ({ project } = await api(`/projects/${id}`, { method: "PATCH", body: { title: e.target.value } }));
    $("#crumb-page").textContent = project.title;
    refreshSidebar();
  });
  $("#del").addEventListener("click", async () => {
    if (!(await confirmBox("ลบโปรเจกต์นี้?", `"${esc(project.title)}" และไฟล์ทั้งหมดของมันจะถูกลบออกจากเครื่อง`, "ลบโปรเจกต์", "button-danger"))) return;
    await api(`/projects/${id}`, { method: "DELETE" });
    location.hash = "#/projects";
  });

  const canGo = (s) => s === 1 || Boolean(project.timeline?.chunks?.length);
  const renderStepper = () => {
    $("#stepper").innerHTML = stepperHtml(step, canGo, (s) => (s < step && canGo(s)) || (s === 4 && project.status === "rendered" && step !== 4));
  };
  $("#stepper").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-step]");
    if (b && !b.disabled) go(Number(b.dataset.step));
  });

  /* ----- บันทึกซับอัตโนมัติ ----- */
  async function flushSave() {
    if (edit.version === edit.saved) return;
    clearTimeout(edit.timer);
    const version = edit.version;
    edit.saving = true;
    setSaveState();
    try {
      const res = await api(`/projects/${id}/timeline`, { method: "PUT", body: { chunks: edit.chunks } });
      project = res.project;
      edit.saved = version;
      // ระหว่างบันทึกผู้ใช้ไม่ได้พิมพ์เพิ่ม → รับเวลาคำที่เซิร์ฟเวอร์คำนวณใหม่มาใช้
      if (edit.version === version) {
        edit.chunks = structuredClone(project.timeline.chunks);
        stepApi.onServerChunks?.();
      }
    } catch (error) {
      toast(`บันทึกไม่สำเร็จ: ${error.message}`);
    } finally {
      edit.saving = false;
      setSaveState();
    }
  }
  function markDirty() {
    edit.version += 1;
    setSaveState();
    clearTimeout(edit.timer);
    edit.timer = setTimeout(flushSave, 900);
  }
  function setSaveState() {
    const el = $("#save-pill");
    if (!el) return;
    if (!project.timeline) { el.innerHTML = ""; return; }
    el.innerHTML = edit.saving ? `<span class="autosave dirty"><span class="spinner" style="width:10px;height:10px"></span>กำลังบันทึก</span>`
      : edit.version !== edit.saved ? `<span class="autosave dirty">ยังไม่บันทึก</span>`
        : `<span class="autosave">${icon("check")}บันทึกอัตโนมัติ</span>`;
  }
  const reloadChunks = () => {
    edit.chunks = structuredClone(project.timeline?.chunks || []);
    edit.version = edit.saved = 0;
  };

  async function go(next) {
    await flushSave();
    stepCleanup();
    stepCleanup = () => {};
    stepApi = {};
    stopLivePreviews();
    if (player) { player.destroy(); player = null; }
    const changed = step !== next;
    step = next;
    stepMemory.set(id, step);
    renderStepper();
    renderHead();
    setSaveState();
    const host = $("#step");
    if (step === 1) renderSource(host);
    else if (step === 2) renderEditor(host);
    else if (step === 3) renderStyle(host);
    else renderResult(host);
    hydrateIcons(host);
    if (changed || !host.dataset.shown) {
      host.dataset.shown = "1";
      revealIn($$(".wizard-card, .live-preview-panel", host), { y: 22, stagger: 0.08 });
      popIn($$(".wizard-stepper button.active .step-number"), { from: 0.4, duration: 0.5 });
    }
  }

  function poll() {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const wasActive = JOB_ACTIVE(project);
        const res = await api(`/projects/${id}`);
        project = res.project;
        renderHead();
        stepApi.onJob?.();
        if (wasActive && !JOB_ACTIVE(project)) {
          const j = project.job || {};
          refreshSidebar();
          if (j.state === "done") {
            if (["transcribe", "refine", "translate"].includes(j.type)) reloadChunks();
            toast(j.note || `${JOB_LABEL[j.type] || "งาน"}เสร็จแล้ว`);
            if (j.type === "transcribe") return go(2);
            if (j.type === "render") return go(4);
            return go(step);
          }
          if (j.state === "failed") toast(`${JOB_LABEL[j.type] || "งาน"}ไม่สำเร็จ`);
          go(step);
        }
      } catch { /* ลองรอบหน้า */ }
    }, 1000);
  }
  poll();

  /* ----- งาน AI (ใช้ได้จากขั้น 1 และ 2) ----- */
  const needGemini = () => {
    if (gemini()) return false;
    toast("ต้องใส่ Gemini API key ในหน้าตั้งค่าก่อน");
    location.hash = "#/settings";
    return true;
  };

  async function startRefine() {
    if (needGemini()) return;
    const edited = edit.version > 0 || project.translation || project.editedAt > (project.refined?.at || 0) + 5000;
    const ok = await confirmBox("ให้ AI ฟังซ้ำและแก้คำ?",
      `Gemini จะฟังเสียงของคลิปแล้วแก้คำที่ถอดผิด ชื่อเฉพาะ และศัพท์อังกฤษ — <b>เสียงของคลิปจะถูกส่งไปที่ Google</b><br/>ใช้เวลาประมาณ 10–30 วินาทีต่อเสียง 4 นาที${edited ? "<br/><br/>⚠️ ซับที่แก้ไว้และคำแปลจะถูกแทนที่ด้วยผลใหม่" : ""}`,
      `${icon("wand")}เริ่มให้ AI ตรวจ`);
    if (!ok) return;
    try {
      await flushSave();
      ({ project } = await api(`/projects/${id}/refine`, { method: "POST" }));
      go(step);
    } catch (error) { toast(error.message); }
  }

  async function startTranslate() {
    if (needGemini()) return;
    const current = project.translation?.lang;
    let chosen = current || (project.settings.language === "en" ? "th" : "en");
    const missing = edit.chunks.filter((c) => !String(c.translation || "").trim()).length;
    const result = await openModal({
      title: "แปลซับเป็นภาษาอื่น",
      text: "Gemini แปลทีละท่อนโดยอ่านบริบททั้งเรื่อง คำแปลขึ้นจอพร้อมท่อนต้นฉบับพอดี และแก้ได้ทุกท่อนหลังแปล",
      body: `<div class="lang-grid" id="langs">${catalog.languages.map((l) => `<button type="button" data-l="${l.id}" class="${l.id === chosen ? "on" : ""}">${esc(l.name)}</button>`).join("")}</div>
        ${current && missing ? `<label class="toggle"><input type="checkbox" id="only-missing" checked /><span><b>แปลเฉพาะ ${missing} ท่อนที่ยังไม่มีคำแปล</b><small>คำแปลที่แก้ไว้แล้วจะไม่ถูกแตะ (ใช้ได้เมื่อเลือกภาษาเดิม)</small></span></label>` : ""}
        <div class="form-alert">${icon("shield")}<div>ข้อความซับจะถูกส่งไปที่ Google Gemini (ไม่ส่งวิดีโอหรือเสียง)</div></div>`,
      actions: [{ label: `${icon("languages")}เริ่มแปล`, value: (m) => ({ to: chosen, onlyMissing: Boolean($("#only-missing", m)?.checked) && chosen === current }) }],
      onMount: (m) => $("#langs", m).addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        chosen = b.dataset.l;
        $$("#langs button", m).forEach((x) => x.classList.toggle("on", x === b));
      }),
    });
    if (!result) return;
    try {
      await flushSave();
      ({ project } = await api(`/projects/${id}/translate`, { method: "POST", body: result }));
      go(step);
    } catch (error) { toast(error.message); }
  }

  async function startImport() {
    const result = await openModal({
      title: "นำเข้าไฟล์ซับ",
      text: "ใช้ซับที่มีอยู่แล้ว (SRT, VTT หรือ ASS) แทนผลถอดเสียง แล้วไปแต่งสไตล์และเรนเดอร์ได้เลย — ซับเดิมในโปรเจกต์นี้จะถูกแทนที่",
      body: `<input class="input" type="file" id="subf" accept=".srt,.vtt,.ass,.ssa,text/plain" />
        <label class="toggle"><input type="checkbox" id="rechunk" /><span><b>แบ่งท่อนใหม่ให้พอดีจอ</b><small>เหมาะเมื่อไฟล์ซับมีบรรทัดยาว ๆ และจะใช้สไตล์คาราโอเกะ</small></span></label>`,
      actions: [{
        label: `${icon("upload")}นำเข้า`,
        value: (m) => {
          const f = $("#subf", m).files[0];
          if (!f) { toast("เลือกไฟล์ซับก่อน"); return undefined; }
          return { file: f, rechunk: $("#rechunk", m).checked };
        },
      }],
    });
    if (!result) return;
    try {
      ({ project } = await api(`/projects/${id}/import`, { method: "POST", body: { text: await result.file.text(), rechunk: result.rechunk } }));
      reloadChunks();
      toast(`นำเข้า ${project.imported?.cues ?? ""} ท่อนแล้ว`);
      go(2);
    } catch (error) { toast(error.message); }
  }

  const jobBox = (types) => {
    const j = project.job;
    if (!JOB_ACTIVE(project) || !types.includes(j.type)) return "";
    return `<div class="job-box">
      <div class="row"><span class="spinner" style="color:var(--yellow)"></span><b>${esc(j.message || "กำลังทำงาน")}</b><span class="spacer"></span><button class="button button-ghost-dark button-sm" data-cancel>ยกเลิก</button></div>
      <div class="progress"><span style="width:${j.pct || 0}%"></span></div>
      <span class="faint">${esc(JOB_LABEL[j.type])} · ${Math.round(j.pct || 0)}% · ปิดหน้านี้ได้ งานยังทำต่อ</span></div>`;
  };
  const bindCancel = (root) => $$("[data-cancel]", root).forEach((b) => b.addEventListener("click", () => api(`/projects/${id}/cancel`, { method: "POST" })));
  const jobSlot = (host, types) => () => {
    const slot = $("#job-slot", host);
    if (!slot) return;
    const html = jobBox(types);
    // เปลี่ยนแค่แถบ % ถ้ากล่องมีอยู่แล้ว — วาดใหม่ทุกวินาทีทำให้กดปุ่มยกเลิกไม่ติด
    if (html && slot.firstElementChild) {
      const j = project.job;
      tweenBar($(".progress span", slot), j.pct || 0);
      $(".row b", slot).textContent = j.message || "";
      $(".faint", slot).textContent = `${JOB_LABEL[j.type]} · ${Math.round(j.pct || 0)}% · ปิดหน้านี้ได้ งานยังทำต่อ`;
      return;
    }
    slot.innerHTML = html;
    hydrateIcons(slot);
    bindCancel(slot);
  };

  const previewPanel = (title, subtitle, extra = "") => `
    <aside class="live-preview-panel">
      <div class="preview-panel-head"><div><b>${title}</b><p>${subtitle}</p></div><span class="live-pill"><i></i>ตัวอย่างสด</span></div>
      <div id="player"></div>
      ${extra}
    </aside>`;
  const mountPlayer = (host, opts = {}) => {
    player = createPlayer($("#player", host), {
      src: `/api/projects/${id}/source`,
      meta: project.meta,
      getChunks: shown,
      getStyle: () => project.preparedStyle,
      ...opts,
    });
    return player;
  };

  /* ----- ขั้น 1: วิดีโอ + ถอดเสียง ----- */
  function renderSource(host) {
    const j = project.job;
    const failed = j?.type === "transcribe" && j.state === "failed";
    const aiFailed = j?.type === "refine" && j.state === "failed";
    const refined = project.refined;
    host.innerHTML = `<div class="wizard-workspace">
      <section class="wizard-card">
        <div class="step-panel">
          <div class="step-panel-heading"><div>
            <span class="step-kicker">ขั้นที่ 1 จาก 4</span>
            <h2>วิดีโอและการถอดเสียง</h2>
            <p>${project.timeline ? "ถอดเสียงเรียบร้อยแล้ว ไปตรวจแก้ซับต่อได้เลย หรือให้ AI ช่วยตรวจทานคำก่อน" : JOB_ACTIVE(project) ? "ระบบกำลังถอดเสียงจากวิดีโอนี้ด้วย whisper บนเครื่องคุณ — ปิดหน้านี้ได้ งานยังทำต่อ" : "เลือกวิธีทำซับด้านล่าง"}</p>
          </div></div>
          <div class="step-body">
            <div id="job-slot">${jobBox(["transcribe", "refine"])}</div>
            ${failed ? `<div class="form-alert error">${icon("alert")}<div><b>ถอดเสียงไม่สำเร็จ</b><br/>${esc(j.error || "")}</div></div>` : ""}
            ${aiFailed ? `<div class="form-alert error">${icon("alert")}<div><b>AI แก้คำไม่สำเร็จ</b> — ซับจาก whisper ยังอยู่ครบ<br/>${esc(j.error || "")}</div></div>` : ""}
            ${j?.state === "done" && j.note && ["transcribe", "refine"].includes(j.type) ? `<div class="form-alert ok">${icon("check")}<div>${esc(j.note)}</div></div>` : ""}
            <div class="spec-list">
              <div class="spec"><small>ไฟล์</small><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(project.source?.name || "-")}</b></div>
              <div class="spec"><small>ขนาดภาพ</small><b>${project.meta ? `${project.meta.width}×${project.meta.height}` : "-"}</b></div>
              <div class="spec"><small>ความยาว</small><b>${project.meta ? fmtDuration(project.meta.durationMs) : "-"}</b></div>
              <div class="spec"><small>ท่อนซับ</small><b>${edit.chunks.length || "-"}</b></div>
            </div>
            <div class="option-grid">
              <div class="field"><span>ภาษาที่พูด</span>
                <div class="seg" id="lang">${[["th", "ไทย"], ["en", "อังกฤษ"], ["auto", "ให้ระบบเดา"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${project.settings.language === v ? "on" : ""}">${l}</button>`).join("")}</div>
              </div>
              <label class="field"><span>คำเฉพาะในคลิป <small>ช่วยทั้ง whisper และ AI</small></span>
                <input class="input" id="prompt" maxlength="400" value="${esc(project.settings.prompt || "")}" placeholder="เช่น ชื่อแบรนด์ ชื่อคน ศัพท์เทคนิค" />
              </label>
            </div>
            <div class="setting-block"><h3>ทางเลือกสำหรับซับ</h3>
              <div class="action-cards">
                <button class="action-card" data-a="transcribe" ${aiBusy() ? "disabled" : ""}><span class="quick-icon yellow">${icon("mic")}</span><b>${project.timeline ? "ถอดเสียงใหม่" : "เริ่มถอดเสียง"}</b><small>whisper บนเครื่องนี้ · ${project.timeline ? "แทนที่ซับที่แก้ไว้ทั้งหมด" : "ฟรี ไม่ส่งข้อมูลออก"}</small></button>
                <button class="action-card" data-a="refine" ${!project.canRefine || aiBusy() ? "disabled" : ""}><span class="quick-icon purple">${icon("wand")}</span><b>ให้ AI ฟังซ้ำและแก้คำ</b><small>${refined ? `ตรวจแล้ว · แก้ ${refined.changed} บรรทัด` : gemini() ? "Gemini แก้ชื่อเฉพาะและคำที่ถอดผิด" : "ต้องใส่ Gemini key ก่อน"}</small></button>
                <button class="action-card" data-a="import" ${aiBusy() && j.type !== "transcribe" ? "disabled" : ""}><span class="quick-icon green">${icon("fileText")}</span><b>นำเข้าไฟล์ซับ</b><small>มี SRT / VTT / ASS อยู่แล้ว ใช้แทนการถอดเสียง</small></button>
              </div>
            </div>
          </div>
        </div>
        <div class="wizard-card-footer">
          <a class="button button-quiet" href="#/projects">${icon("arrowLeft", "i-sm")}โปรเจกต์</a>
          <span class="faint">${project.timeline ? "ขั้นถัดไป: ตรวจแก้ทุกคำ" : ""}</span>
          <button class="button button-primary" data-next ${project.timeline ? "" : "disabled"}>ไปแก้ซับ ${icon("arrowRight", "i-sm")}</button>
        </div>
      </section>
      ${previewPanel("วิดีโอต้นฉบับ", project.timeline ? "ซับตัวอย่างซ้อนบนวิดีโอ" : "ซับจะขึ้นตรงนี้หลังถอดเสียงเสร็จ", `
        <div class="preview-config">
          <div class="config-row ${project.timeline ? "" : "pending"}"><span class="config-icon">${icon("mic")}</span><div><small>ถอดเสียง</small><b>${project.imported ? `นำเข้าจากไฟล์ซับ ${project.imported.cues} ท่อน` : project.timeline ? `whisper · ${edit.chunks.length} ท่อน` : "รอถอดเสียง"}</b></div></div>
          <div class="config-row ${refined ? "" : "pending"}"><span class="config-icon">${icon("wand")}</span><div><small>AI ตรวจทาน</small><b>${refined ? `แก้ ${refined.changed} บรรทัด` : "ยังไม่ได้ใช้"}</b></div></div>
          <div class="config-row ${project.translation ? "" : "pending"}"><span class="config-icon">${icon("languages")}</span><div><small>คำแปล</small><b>${project.translation ? langName(project.translation.lang) : "ยังไม่ได้แปล"}</b></div></div>
        </div>`)}
    </div>`;
    mountPlayer(host);
    bindCancel(host);
    stepApi.onJob = jobSlot(host, ["transcribe", "refine"]);
    $("#lang", host).addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      ({ project } = await api(`/projects/${id}`, { method: "PATCH", body: { settings: { language: b.dataset.v } } }));
      $$("#lang button", host).forEach((x) => x.classList.toggle("on", x === b));
    });
    $("#prompt", host).addEventListener("change", async (e) => {
      ({ project } = await api(`/projects/${id}`, { method: "PATCH", body: { settings: { prompt: e.target.value } } }));
    });
    host.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "transcribe") {
        if (project.timeline && !(await confirmBox("ถอดเสียงใหม่?", "ซับที่แก้ไว้ คำแปล และผลจาก AI จะถูกแทนที่ด้วยผลถอดเสียงใหม่", "ถอดเสียงใหม่"))) return;
        try { ({ project } = await api(`/projects/${id}/transcribe`, { method: "POST" })); go(1); } catch (error) { toast(error.message); }
      } else if (a === "refine") startRefine();
      else if (a === "import") startImport();
    });
    $("[data-next]", host).addEventListener("click", () => go(2));
  }

  /* ----- ขั้น 2: แก้ซับ ----- */
  function renderEditor(host) {
    const locked = aiBusy();
    host.innerHTML = `<div class="wizard-workspace wide-preview">
      <section class="wizard-card">
        <div class="step-panel" style="padding-bottom:10px">
          <div class="step-panel-heading" style="margin-bottom:${locked ? 14 : 0}px"><div>
            <span class="step-kicker">ขั้นที่ 2 จาก 4</span>
            <h2>ตรวจแก้ซับทุกคำ</h2>
            <p>คลิกเลขท่อนเพื่อเล่นตรงนั้น แก้คำในช่องได้เลย ระบบบันทึกให้อัตโนมัติ${hasTr() ? ` · ช่องสีม่วงคือคำแปล${esc(langName(project.translation.lang))}` : ""}</p>
          </div>
          <div class="row" style="flex-wrap:nowrap">
            <button class="button button-quiet button-sm" id="ai-refine" ${!project.canRefine || locked ? "disabled" : ""} title="ให้ Gemini ฟังเสียงแล้วแก้คำที่ถอดผิด">${icon("wand")}AI แก้คำ</button>
            <button class="button button-quiet button-sm" id="ai-translate" ${locked ? "disabled" : ""}>${icon("languages")}${hasTr() ? "แปลใหม่" : "แปลซับ"}</button>
          </div></div>
          <div id="job-slot">${jobBox(["refine", "translate", "transcribe"])}</div>
        </div>
        <div class="editor-toolbar">
          <input class="input" id="find" placeholder="ค้นหาคำ" />
          <input class="input" id="replace" placeholder="แทนที่ด้วย" />
          <button class="button button-quiet button-sm" id="replace-all">แทนที่ทั้งหมด</button>
          <span class="spacer"></span>
          <button class="icon-button sm" id="rechunk" title="แบ่งท่อนใหม่จากผลถอดเสียง" ${locked || project.imported ? "disabled" : ""}>${icon("refresh")}</button>
        </div>
        <div class="editor-meta"><span id="count"></span><span class="spacer"></span><span>Ctrl+Enter แยกท่อน · Space เล่น/หยุด</span></div>
        <div class="chunks ${locked ? "editor-lock" : ""}" id="chunks"></div>
        <div class="wizard-card-footer">
          <button class="button button-quiet" data-back>${icon("arrowLeft", "i-sm")}วิดีโอ</button>
          <button class="button button-quiet button-sm" id="add-end" ${locked ? "disabled" : ""}>${icon("insert")}เพิ่มท่อน</button>
          <button class="button button-primary" data-next>ไปเลือกสไตล์ ${icon("arrowRight", "i-sm")}</button>
        </div>
      </section>
      ${previewPanel("ตัวอย่างซับ", "ท่อนที่กำลังเล่นจะไฮไลต์ในรายการ", hasTr() ? `
        <div class="preview-config"><div class="config-row"><span class="config-icon">${icon("languages")}</span><div style="flex:1"><small>แสดงบนวิดีโอ</small>
          <div class="seg" id="display" style="margin-top:6px;background:#1f241f;border-color:#2c322c">${[["original", "ต้นฉบับ"], ["both", "สองภาษา"], ["translation", "คำแปล"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${(project.settings.display || "both") === v ? "on" : ""}" style="color:#b9c0b8">${l}</button>`).join("")}</div></div></div></div>` : "")}
    </div>`;
    setSaveState();
    const list = $("#chunks", host);
    mountPlayer(host, {
      onTick: (idx) => {
        $$(".chunk.active", list).forEach((el) => el.classList.remove("active"));
        const row = list.children[idx];
        if (row) {
          row.classList.add("active");
          if (!player.video.paused && !row.contains(document.activeElement)) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      },
    });
    bindCancel(host);
    stepApi.onJob = jobSlot(host, ["refine", "translate", "transcribe"]);

    const autosize = (ta) => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight}px`; };
    const rowHtml = (c, i) => {
      const dur = c.endMs - c.startMs;
      const fast = dur > 0 && [...c.text].length / (dur / 1000) > 22;
      return `<div class="chunk" data-i="${i}">
        <div class="idx" data-act="play" title="เล่นท่อนนี้">${i + 1}</div>
        <div>
          <textarea rows="1" data-f="text" aria-label="ข้อความท่อนที่ ${i + 1}" ${locked ? "disabled" : ""}>${esc(c.text)}</textarea>
          ${hasTr() ? `<textarea rows="1" class="tr" data-f="translation" placeholder="ยังไม่มีคำแปล" aria-label="คำแปลท่อนที่ ${i + 1}" ${locked ? "disabled" : ""}>${esc(c.translation || "")}</textarea>` : ""}
          <div class="meta">
            <input class="t" data-f="startMs" value="${fmtTime(c.startMs)}" aria-label="เวลาเริ่ม" ${locked ? "disabled" : ""} />
            <span class="arrow">→</span>
            <input class="t" data-f="endMs" value="${fmtTime(c.endMs)}" aria-label="เวลาจบ" ${locked ? "disabled" : ""} />
            <span class="dur ${fast ? "warn" : ""}" title="${fast ? "ท่อนนี้อ่านไม่ทัน ลองแยกหรือยืดเวลา" : ""}">${(dur / 1000).toFixed(1)} วิ</span>
            <span class="acts">
              <button class="icon-button sm" data-act="setStart" title="ตั้งเวลาเริ่ม = ตำแหน่งวิดีโอ">${icon("pinStart")}</button>
              <button class="icon-button sm" data-act="setEnd" title="ตั้งเวลาจบ = ตำแหน่งวิดีโอ">${icon("pinEnd")}</button>
              <button class="icon-button sm" data-act="split" title="แยกท่อนตรงเคอร์เซอร์">${icon("split")}</button>
              <button class="icon-button sm" data-act="merge" title="รวมกับท่อนถัดไป">${icon("merge")}</button>
              <button class="icon-button sm" data-act="insert" title="เพิ่มท่อนต่อจากนี้">${icon("insert")}</button>
              <button class="icon-button sm" data-act="delete" title="ลบท่อน">${icon("trash")}</button>
            </span>
          </div>
        </div>
      </div>`;
    };
    const renderList = (focus = null) => {
      list.innerHTML = edit.chunks.map(rowHtml).join("") || `<div class="empty-state">ไม่มีซับ — เพิ่มท่อนได้จากปุ่มด้านล่าง</div>`;
      $$("textarea", list).forEach(autosize);
      const missing = hasTr() ? edit.chunks.filter((c) => !String(c.translation || "").trim()).length : 0;
      $("#count", host).textContent = `${edit.chunks.length} ท่อน${missing ? ` · ยังไม่มีคำแปล ${missing} ท่อน` : ""}`;
      player?.refresh();
      renderHead();
      if (focus) {
        const ta = list.children[focus.i]?.querySelector("textarea");
        if (ta) { ta.focus(); ta.setSelectionRange(focus.caret ?? 0, focus.caret ?? 0); }
      }
    };
    renderList();
    stepApi.onServerChunks = () => {
      if (edit.chunks.length !== list.children.length) renderList();
      player?.refresh();
    };

    const newChunk = (startMs, endMs, text = "", translation = "") => ({ id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text, translation, startMs, endMs, words: [] });

    list.addEventListener("input", (e) => {
      const row = e.target.closest(".chunk");
      const f = e.target.dataset.f;
      if (!row || (f !== "text" && f !== "translation")) return;
      autosize(e.target);
      const c = edit.chunks[Number(row.dataset.i)];
      c[f] = e.target.value.replace(/\n/g, " ");
      if (f === "text") c.words = [{ text: c.text, s: 0, e: c.text.length, startMs: c.startMs, endMs: c.endMs }];
      player?.refresh();
      markDirty();
    });
    list.addEventListener("change", (e) => {
      const row = e.target.closest(".chunk");
      const f = e.target.dataset.f;
      if (!row || !["startMs", "endMs"].includes(f)) return;
      const c = edit.chunks[Number(row.dataset.i)];
      const ms = parseTime(e.target.value);
      if (ms == null) { e.target.value = fmtTime(c[f]); toast("รูปแบบเวลา: นาที:วินาที เช่น 1:05.30"); return; }
      c[f] = ms;
      if (c.endMs <= c.startMs) c.endMs = c.startMs + 500;
      edit.chunks.sort((a, b) => a.startMs - b.startMs);
      renderList();
      markDirty();
    });
    list.addEventListener("keydown", (e) => {
      if (e.target.tagName === "TEXTAREA" && e.key === "Enter") {
        e.preventDefault();
        if ((e.ctrlKey || e.metaKey) && e.target.dataset.f === "text") act("split", e.target.closest(".chunk"));
      }
      if (e.target.classList.contains("t") && e.key === "Enter") e.target.blur();
    });
    list.addEventListener("focusin", (e) => {
      const row = e.target.closest(".chunk");
      if (row && e.target.tagName === "TEXTAREA" && player.video.paused) player.seek(edit.chunks[Number(row.dataset.i)].startMs);
    });
    list.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "play" || !locked) act(b.dataset.act, b.closest(".chunk"));
    });

    function act(name, row) {
      const i = Number(row.dataset.i);
      const c = edit.chunks[i];
      const now = Math.round(player.video.currentTime * 1000);
      if (name === "play") return player.seek(c.startMs, true);
      if (name === "setStart") c.startMs = Math.min(now, c.endMs - 100);
      else if (name === "setEnd") c.endMs = Math.max(now, c.startMs + 100);
      else if (name === "delete") edit.chunks.splice(i, 1);
      else if (name === "merge") {
        const n = edit.chunks[i + 1];
        if (!n) return toast("ไม่มีท่อนถัดไปให้รวม");
        edit.chunks.splice(i, 2, { ...newChunk(c.startMs, n.endMs, `${c.text} ${n.text}`.trim(), `${c.translation || ""} ${n.translation || ""}`.trim()), id: c.id });
      } else if (name === "split") {
        const ta = row.querySelector('textarea[data-f="text"]');
        const caret = ta.selectionStart;
        const left = c.text.slice(0, caret).trim();
        const right = c.text.slice(caret).trim();
        if (!left || !right) return toast("วางเคอร์เซอร์ไว้ตรงจุดที่ต้องการแยกก่อน");
        // ถ้ากำลังเล่นอยู่ในช่วงท่อน ใช้ตำแหน่งวิดีโอเป็นจุดแบ่งเวลา แม่นกว่าเดาจากจำนวนตัวอักษร
        const at = now > c.startMs + 100 && now < c.endMs - 100 && !player.video.paused
          ? now : Math.round(c.startMs + ((c.endMs - c.startMs) * left.length) / (left.length + right.length));
        edit.chunks.splice(i, 1, { ...newChunk(c.startMs, at, left, c.translation || ""), id: c.id }, newChunk(at, c.endMs, right));
        renderList({ i: i + 1, caret: 0 });
        markDirty();
        return;
      } else if (name === "insert") {
        const next = edit.chunks[i + 1];
        if (next && next.startMs - c.endMs < 300) return toast("ไม่มีช่องว่างพอระหว่างท่อนนี้กับท่อนถัดไป ลองลดเวลาจบของท่อนนี้ก่อน");
        const start = c.endMs;
        const end = next ? next.startMs : start + 1500;
        edit.chunks.splice(i + 1, 0, newChunk(start, Math.min(end, start + 2500)));
        renderList({ i: i + 1 });
        markDirty();
        return;
      }
      renderList();
      markDirty();
    }

    $("#add-end", host).addEventListener("click", () => {
      const last = edit.chunks.at(-1);
      const start = Math.max(last?.endMs ?? 0, Math.round(player.video.currentTime * 1000));
      edit.chunks.push(newChunk(start, start + 2000));
      renderList({ i: edit.chunks.length - 1 });
      markDirty();
    });
    $("#replace-all", host).addEventListener("click", () => {
      if (locked) return;
      const find = $("#find", host).value;
      if (!find) return toast("พิมพ์คำที่ต้องการค้นหาก่อน");
      const rep = $("#replace", host).value;
      let n = 0;
      for (const c of edit.chunks) {
        for (const f of ["text", "translation"]) {
          if (c[f]?.includes(find)) {
            n += c[f].split(find).length - 1;
            c[f] = c[f].split(find).join(rep);
          }
        }
      }
      if (!n) return toast("ไม่พบคำนี้ในซับ");
      renderList();
      markDirty();
      toast(`แทนที่แล้ว ${n} จุด`);
    });
    $("#find", host).addEventListener("input", (e) => {
      const q = e.target.value;
      $$(".chunk", list).forEach((row, i) => {
        const c = edit.chunks[i];
        row.style.display = !q || c.text.includes(q) || (c.translation || "").includes(q) ? "" : "none";
      });
    });
    $("#rechunk", host).addEventListener("click", async () => {
      if (!(await confirmBox("แบ่งท่อนใหม่?", "แบ่งท่อนใหม่จากผลถอดเสียงให้พอดีกับขนาดตัวอักษรปัจจุบัน — การแก้ไขในหน้านี้และคำแปลจะหายทั้งหมด", "แบ่งท่อนใหม่"))) return;
      ({ project } = await api(`/projects/${id}/rechunk`, { method: "POST" }));
      reloadChunks();
      go(2);
    });
    $("#ai-refine", host).addEventListener("click", startRefine);
    $("#ai-translate", host).addEventListener("click", startTranslate);
    $("#display", host)?.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      $$("#display button", host).forEach((x) => x.classList.toggle("on", x === b));
      ({ project } = await api(`/projects/${id}`, { method: "PATCH", body: { settings: { display: b.dataset.v } } }));
      player.refresh();
    });
    $("[data-back]", host).addEventListener("click", () => go(1));
    $("[data-next]", host).addEventListener("click", () => go(3));

    const onKey = (e) => {
      if (e.code === "Space" && !e.target.closest("input,textarea,button,select")) {
        e.preventDefault();
        player.video.paused ? player.video.play() : player.video.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    stepCleanup = () => window.removeEventListener("keydown", onKey);
  }

  /* ----- ขั้น 3: สไตล์ ----- */
  function renderStyle(host) {
    const { styles, colorSets } = catalog;
    const s = () => project.settings;
    let filter = "all";
    const poster = `/api/projects/${id}/poster`;
    // พรีวิวด้วยคำจากคลิปจริง (ท่อนสั้น ๆ 3–5 คำ) — เห็นเลยว่าซับของตัวเองจะออกมาหน้าตาแบบไหน
    const sampleWords = (() => {
      const c = edit.chunks.find((x) => x.words?.length >= 3 && x.words.length <= 5 && [...x.text].length <= 22);
      return c ? c.words.map((w) => w.text) : PREVIEW_WORDS;
    })();
    const shortNote = (st) => String(st.description || "").split(/[—–]/)[0].trim();
    const laneCount = { all: styles.length, ass: styles.filter((x) => x.lane === "ass").length, hyperframes: styles.filter((x) => x.lane === "hyperframes").length };
    const colorName = () => colorSets.find((c) => c.id === s().colorSet)?.name || "ตามสไตล์";
    const anchorName = () => ({ top: "บน", middle: "กลาง", bottom: "ล่าง" }[s().anchor] || "ตามสไตล์");

    host.innerHTML = `<div class="wizard-workspace wide-preview">
      <section class="wizard-card">
        <div class="step-panel">
          <div class="step-panel-heading"><div>
            <span class="step-kicker">ขั้นที่ 3 จาก 4</span>
            <h2>หน้าตาซับ</h2>
            <p>เลือกสไตล์และตำแหน่งให้เข้ากับคลิป ทุกการ์ดขยับจริงด้วยท่าเดียวกับไฟล์ที่จะเรนเดอร์ และใช้คำจากคลิปของคุณเอง</p>
          </div></div>

          <div class="subsection-heading"><div><h3>สไตล์ซับ</h3><p>พรีวิวจากคลิปจริงของคุณ</p></div><a class="text-link" href="#/styles">ดูแกลเลอรี ${icon("arrowRight", "i-sm")}</a></div>
          <div class="filter-row" id="filters" style="margin-bottom:12px">
            ${[["all", "ทั้งหมด"], ["hyperframes", "HyperFrames"], ["ass", "เรนเดอร์เร็ว"]].map(([v, l]) => `<button data-f="${v}" class="${v === filter ? "active" : ""}">${l}<em>${laneCount[v]}</em></button>`).join("")}
            <span class="style-filter-note" id="filter-note">สองวิธีเรนเดอร์ ต่างกันทั้งลูกเล่นและเวลาที่ใช้</span>
          </div>
          <div class="caption-style-grid" id="styles">${styles.map((st) => `
            <button type="button" class="caption-style-card ${st.slug === s().style ? "selected" : ""}" data-slug="${st.slug}" data-lane="${st.lane}">
              <span class="style-preview" data-preview="${st.slug}"><img src="${poster}" alt="" loading="lazy" onerror="this.remove()" /></span>
              <span class="style-info"><b>${esc(st.name)}</b><small>${esc(shortNote(st))}</small></span>
              <em>${st.lane === "hyperframes" ? "พรีเมียม" : "เร็ว"}</em>
              <i class="style-selected">${icon("check")}</i>
            </button>`).join("")}</div>

          <div class="color-control">
            <div class="color-control-head"><b>สีไฮไลต์</b><small>กดเลือกสีที่อยากให้คำเด้งขึ้นมาตอนพูด · เปลี่ยนแล้วไม่ต้องถอดเสียงใหม่</small></div>
            <div class="color-samples" id="colors" role="radiogroup" aria-label="สีไฮไลต์">
              ${[{ id: "", name: "ตามสไตล์" }, ...colorSets].map((c) => `
                <button type="button" role="radio" class="color-sample ${(s().colorSet || "") === c.id ? "active" : ""}" data-id="${c.id}" title="${esc(c.hint || "")}" aria-checked="${(s().colorSet || "") === c.id}">
                  <span class="color-sample-stage" data-stage="${c.id}"></span>
                  <span class="color-sample-name">${esc(c.name)}</span>
                  <span class="color-sample-check">${icon("check")}</span>
                </button>`).join("")}
            </div>
          </div>

          <div class="position-control">
            <div><b>ตำแหน่งซับ</b><small>หลบหน้าคน สินค้า และปุ่มบนแพลตฟอร์ม</small></div>
            <div id="anchor">${[["", "ตามสไตล์"], ["top", "บน"], ["middle", "กลาง"], ["bottom", "ล่าง"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${(s().anchor || "") === v ? "active" : ""}">${l}</button>`).join("")}</div>
          </div>
          <div class="position-control">
            <div><b>ขนาดตัวอักษร <span class="size-value" id="scale-label">${Math.round(s().fontScale * 100)}%</span></b><small>ขยายเมื่อคนดูบนมือถือ · ลดเมื่อข้อความยาว</small></div>
            <div class="range-box"><span>ก</span><input class="range" type="range" id="scale" min="0.5" max="1.8" step="0.05" value="${s().fontScale}" aria-label="ขนาดตัวอักษร" /><span style="font-size:17px">ก</span></div>
          </div>
          ${hasTr() ? `<div class="position-control">
            <div><b>ภาษาบนวิดีโอ</b><small>มีคำแปล${esc(langName(project.translation.lang))}</small></div>
            <div id="display">${[["original", "ต้นฉบับ"], ["both", "สองภาษา"], ["translation", "คำแปล"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${(s().display || "both") === v ? "active" : ""}">${l}</button>`).join("")}</div>
          </div>` : ""}
        </div>
        <div class="wizard-card-footer">
          <button class="button button-quiet" data-back>${icon("arrowLeft", "i-sm")}แก้ซับ</button>
          <span class="faint" id="style-note"></span>
          <button class="button button-primary" data-next>ไปเรนเดอร์ ${icon("arrowRight", "i-sm")}</button>
        </div>
      </section>
      ${previewPanel("ตัวอย่างบนคลิปจริง", "กดเล่นเพื่อดูซับขยับตามเสียง", `
        <div class="preview-config" id="preview-config"></div>`)}
    </div>`;

    // สีที่เลือกต้องเห็นบนการ์ดทุกใบทันที ไม่ใช่แค่ตัวอย่างใหญ่ — สูตรเดียวกับ applyColorSet ฝั่งเซิร์ฟเวอร์
    const paint = (st) => {
      const set = colorSets.find((c) => c.id === s().colorSet);
      if (!set) return st;
      const out = structuredClone(st);
      const p = out.params;
      if (String(p.activeFill).toUpperCase() !== String(p.fill).toUpperCase()) {
        p.activeFill = set.primary;
        if (p.emphasisFill) p.emphasisFill = set.secondary;
      } else p.emphasisFill = set.primary;
      if (p.glow) p.glow.color = set.primary;
      return out;
    };
    const mountCards = () => {
      stopLivePreviews();
      $$("[data-preview]", host).forEach((el) => {
        if (el.closest(".caption-style-card").hidden) return;
        mountLivePreview(el, paint(styles.find((x) => x.slug === el.dataset.preview)), sampleWords, { anchor: s().anchor || undefined });
      });
    };
    const paintStages = () => {
      const base = styles.find((x) => x.slug === s().style) || styles[0];
      $$("[data-stage]", host).forEach((el) => {
        const set = colorSets.find((c) => c.id === el.dataset.stage);
        el.innerHTML = `<em style="color:${set ? set.primary : base.params.activeFill}">ข้อความ</em><i style="color:${set ? set.secondary : base.params.emphasisFill || base.params.activeFill}">เน้น</i>`;
      });
    };
    const renderConfig = () => {
      const st = styles.find((x) => x.slug === s().style);
      const set = colorSets.find((c) => c.id === s().colorSet);
      $("#preview-config", host).innerHTML = `
        <div class="config-row"><span class="config-icon">${icon("captions")}</span><div><small>สไตล์</small><b>${esc(st?.name || "-")} · ${st?.lane === "hyperframes" ? "พรีเมียม" : "เร็ว"}</b></div></div>
        <div class="config-row"><span class="config-icon" style="${set ? `background:${set.primary}22;color:${set.primary}` : ""}">${icon("palette")}</span><div><small>สีไฮไลต์</small><b>${esc(colorName())}</b></div></div>
        <div class="config-row"><span class="config-icon">${icon("monitor")}</span><div><small>ตำแหน่ง · ขนาด</small><b>${anchorName()} · ${Math.round(s().fontScale * 100)}%</b></div></div>`;
      $("#style-note", host).textContent = st ? `${st.name} · ${st.lane === "hyperframes" ? "พรีเมียม" : "เร็ว"}` : "";
    };
    // การ์ดต้องมีขนาดจริงก่อนถึงจะคำนวณขนาดตัวอักษรได้ — รอเฟรมถัดไปหลังวาง DOM
    requestAnimationFrame(() => {
      mountCards();
      popIn($$(".caption-style-card", host), { from: 0.9, stagger: 0.025, duration: 0.35 });
    });
    paintStages();
    renderConfig();
    mountPlayer(host);
    if (edit.chunks[0]) player.seek(edit.chunks[0].startMs + 250);

    const save = async (settings) => {
      try {
        ({ project } = await api(`/projects/${id}`, { method: "PATCH", body: { settings } }));
        player.refresh();
        renderConfig();
      } catch (error) { toast(error.message); }
    };
    const NOTES = {
      all: "สองวิธีเรนเดอร์ ต่างกันทั้งลูกเล่นและเวลาที่ใช้",
      hyperframes: "เลเยอร์ซับเรนเดอร์แยกแล้ววางทับ ลูกเล่นเยอะกว่า แต่ใช้เวลานานกว่า",
      ass: "เผาซับลงภาพตรง ๆ เสร็จไวที่สุด เหมาะกับงานด่วน",
    };
    $("#filters", host).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      filter = b.dataset.f;
      $$("#filters button", host).forEach((x) => x.classList.toggle("active", x === b));
      $("#filter-note", host).textContent = NOTES[filter];
      $$(".caption-style-card", host).forEach((x) => { x.hidden = filter !== "all" && x.dataset.lane !== filter; });
      mountCards();
      popIn($$(".caption-style-card:not([hidden])", host), { from: 0.92, stagger: 0.02, duration: 0.3 });
    });
    $("#styles", host).addEventListener("click", (e) => {
      const b = e.target.closest("[data-slug]");
      if (!b || b.classList.contains("selected")) return;
      $$(".caption-style-card", host).forEach((x) => x.classList.toggle("selected", x === b));
      if (MOTION) G.fromTo(b, { scale: 0.95 }, { scale: 1, duration: 0.45, ease: "back.out(3)", clearProps: "transform" });
      popIn([$(".style-selected", b)], { from: 0.2, duration: 0.4 });
      store.set("style", b.dataset.slug);
      save({ style: b.dataset.slug }).then(paintStages);
    });
    $("#colors", host).addEventListener("click", (e) => {
      const b = e.target.closest("[data-id]");
      if (!b) return;
      $$(".color-sample", host).forEach((x) => { x.classList.toggle("active", x === b); x.setAttribute("aria-checked", String(x === b)); });
      popIn([$(".color-sample-check", b)], { from: 0.2, duration: 0.4 });
      project.settings.colorSet = b.dataset.id || null;
      mountCards();
      save({ colorSet: b.dataset.id || null });
    });
    $("#anchor", host).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      $$("#anchor button", host).forEach((x) => x.classList.toggle("active", x === b));
      project.settings.anchor = b.dataset.v || null;
      mountCards();
      save({ anchor: b.dataset.v || null });
    });
    $("#display", host)?.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      $$("#display button", host).forEach((x) => x.classList.toggle("active", x === b));
      save({ display: b.dataset.v });
    });
    let scaleTimer;
    $("#scale", host).addEventListener("input", (e) => {
      $("#scale-label", host).textContent = `${Math.round(e.target.value * 100)}%`;
      clearTimeout(scaleTimer);
      scaleTimer = setTimeout(() => save({ fontScale: Number(e.target.value) }), 250);
    });
    $("[data-back]", host).addEventListener("click", () => go(2));
    $("[data-next]", host).addEventListener("click", () => go(4));
  }

  /* ----- ขั้น 4: ผลลัพธ์ ----- */
  function renderResult(host) {
    const { styles } = catalog;
    let lastKey = "";
    let lastDrawn = "";
    const draw = () => {
      const j = project.job;
      const rendering = JOB_ACTIVE(project) && j.type === "render";
      const failed = j?.type === "render" && j.state === "failed";
      const r = project.result;
      const style = styles.find((x) => x.slug === project.settings.style);
      const premium = style?.lane === "hyperframes";
      const stale = r && project.editedAt && r.at < project.editedAt;
      const stage = rendering ? (j.stage === "overlay" ? 1 : j.stage === "burn" ? 2 : 0) : -1;
      lastKey = `${j?.state}|${j?.type}|${r?.at}`;
      if (player) { player.destroy(); player = null; }
      const displayLabel = hasTr() ? { original: "ต้นฉบับ", both: "สองภาษา", translation: "คำแปลอย่างเดียว" }[project.settings.display || "both"] : null;

      const left = rendering ? `
        <div class="step-panel-heading"><div><span class="step-kicker">ขั้นที่ 4 จาก 4</span><h2>กำลังเรนเดอร์วิดีโอ</h2>
          <p>${premium ? "สไตล์พรีเมียมใช้เวลาประมาณ 2–3 เท่าของความยาววิดีโอ" : "สไตล์แบบเร็ว ใช้เวลาไม่นาน"} · ปิดหน้านี้ได้ งานยังทำต่อ</p></div></div>
        <div class="render-progress">
          <div class="row"><b id="r-msg" style="font-weight:500">${esc(j.message || "")}</b><span class="spacer"></span><b id="r-pct">${Math.round(j.pct || 0)}%</b></div>
          <div class="progress"><span id="r-bar" style="width:${j.pct || 0}%"></span></div>
          <ol class="render-stages">
            ${[["เตรียมไฟล์ซับ", 0], [premium ? "เรนเดอร์ซับพรีเมียม (HyperFrames)" : "ข้ามขั้นนี้ (สไตล์เร็ว)", 1], ["ประกอบซับลงวิดีโอด้วย FFmpeg", 2]]
              .map(([l, i]) => `<li class="${i < stage ? "done" : i === stage ? "now" : ""}"><span>${i < stage ? "✓" : i + 1}</span>${l}</li>`).join("")}
          </ol>
          <div><button class="button button-quiet button-sm" data-cancel>ยกเลิก</button></div>
        </div>` : r ? `
        <div class="step-panel-heading"><div><span class="step-kicker">ขั้นที่ 4 จาก 4</span><h2>วิดีโอพร้อมแล้ว 🎉</h2>
          <p>สไตล์ ${esc(styles.find((x) => x.slug === r.style)?.name || r.style)} · ${r.lane === "hyperframes" ? "เรนเดอร์แบบพรีเมียม" : "เรนเดอร์แบบเร็ว"}${r.translationLang && r.display && r.display !== "original" ? ` · ${r.display === "both" ? "สองภาษา" : "คำแปล"} (${esc(langName(r.translationLang))})` : ""}</p></div></div>
        <div class="step-body">
          ${(r.warnings || []).map((w) => `<div class="form-alert">${icon("alert")}<div>${esc(w)}</div></div>`).join("")}
          ${stale ? `<div class="form-alert">${icon("alert")}<div>มีการแก้ซับหรือสไตล์หลังเรนเดอร์ครั้งล่าสุด — กด <b>เรนเดอร์ใหม่</b> เพื่อให้ไฟล์ตรงกัน</div></div>` : ""}
          <div class="final-download">
            <span class="quick-icon yellow">${icon("download")}</span>
            <h3>ดาวน์โหลดวิดีโอพร้อมซับ</h3>
            <p class="faint">MP4 · เสียงเดิมของคลิป · พร้อมโพสต์</p>
            <a class="button button-primary" href="/api/projects/${id}/file/mp4?download">${icon("download")}ดาวน์โหลด MP4</a>
          </div>
          <div class="setting-block"><h3>ไฟล์ซับ <small>เอาไปใช้ต่อใน YouTube, Premiere, CapCut</small></h3>
            <div class="downloads">
              <a class="dl" href="/api/projects/${id}/file/srt?download"><b>SRT</b><small>${r.display === "both" && r.translationLang ? "สองภาษา" : "ใช้ได้ทุกโปรแกรม"}</small></a>
              ${r.files?.srtTranslated ? `<a class="dl" href="/api/projects/${id}/file/srtTranslated?download"><b>SRT คำแปล</b><small>${esc(langName(r.translationLang))} อย่างเดียว</small></a>` : ""}
              <a class="dl" href="/api/projects/${id}/file/ass?download"><b>ASS</b><small>ซับพร้อมสไตล์ · Aegisub</small></a>
              <a class="dl" href="/api/projects/${id}/file/vtt?download"><b>VTT</b><small>เว็บ / HTML5 video</small></a>
              <a class="dl" href="/api/projects/${id}/file/txt?download"><b>TXT</b><small>ข้อความล้วน</small></a>
            </div>
          </div>
        </div>` : `
        <div class="step-panel-heading"><div><span class="step-kicker">ขั้นที่ 4 จาก 4</span><h2>พร้อมเรนเดอร์</h2>
          <p>ตรวจสรุปด้านล่าง แล้วกดเรนเดอร์ ระบบจะวางซับลงบนวิดีโอต้นฉบับและใช้เสียงเดิมของคลิป</p></div></div>
        <div class="step-body">
          ${failed ? `<div class="form-alert error">${icon("alert")}<div><b>เรนเดอร์ไม่สำเร็จ</b><br/>${esc(j.error || "")}</div></div>` : ""}
          <div class="render-checklist">
            <div><span>${icon("film")}</span><div><small>วิดีโอ</small><b>${project.meta ? `${project.meta.width}×${project.meta.height} · ${fmtDuration(project.meta.durationMs)}` : "-"}</b></div></div>
            <div><span>${icon("edit")}</span><div><small>ซับ</small><b>${edit.chunks.length} ท่อน${project.refined ? " · AI ตรวจแล้ว" : ""}</b></div></div>
            <div><span>${icon("captions")}</span><div><small>สไตล์</small><b>${esc(style?.name || "-")}</b></div></div>
            <div><span>${icon(premium ? "gem" : "zap")}</span><div><small>วิธีเรนเดอร์</small><b>${premium ? "พรีเมียม · HyperFrames" : "เร็ว · FFmpeg"}</b></div></div>
            ${displayLabel ? `<div><span>${icon("languages")}</span><div><small>ภาษาบนวิดีโอ</small><b>${displayLabel}</b></div></div>` : ""}
            <div><span>${icon("clock")}</span><div><small>ใช้เวลาประมาณ</small><b>${premium ? `~${Math.max(1, Math.round(((project.meta?.durationMs || 30000) / 60000) * 2.5))} นาที` : "ไม่ถึงนาที"}</b></div></div>
          </div>
          ${premium && project.meta?.durationMs > 100000 ? `<div class="form-alert">${icon("clock")}<div>วิดีโอยาว ${fmtDuration(project.meta.durationMs)} กับสไตล์พรีเมียม ระบบจะเรนเดอร์ทีละ ~1 นาทีแล้วต่อกัน ใช้เวลาประมาณ ${Math.max(1, Math.round((project.meta.durationMs / 60000) * 2.5))} นาที</div></div>` : ""}
        </div>`;

      host.innerHTML = `<div class="wizard-workspace">
        <section class="wizard-card">
          <div class="step-panel">${left}</div>
          <div class="wizard-card-footer">
            <button class="button button-quiet" data-back>${icon("arrowLeft", "i-sm")}ปรับสไตล์</button>
            <span class="faint"></span>
            ${rendering ? "<span></span>" : `<button class="button ${r ? "button-ink" : "button-primary"}" data-render>${icon(r ? "refresh" : "film")}${r ? "เรนเดอร์ใหม่" : "เรนเดอร์วิดีโอ"}</button>`}
          </div>
        </section>
        <aside class="live-preview-panel">
          <div class="preview-panel-head"><div><b>${r && !rendering ? "ผลลัพธ์" : "ตัวอย่างก่อนเรนเดอร์"}</b><p>${r && !rendering ? "ไฟล์ที่เรนเดอร์แล้ว" : "หน้าตาใกล้เคียงของจริง"}</p></div>${rendering ? '<span class="live-pill"><i></i>กำลังเรนเดอร์</span>' : r ? '<span class="live-pill">พร้อมโหลด</span>' : ""}</div>
          ${r && !rendering
            ? `<div class="phone-stage"><div class="player ${project.meta && project.meta.height > project.meta.width ? "portrait" : ""}"><video controls playsinline preload="metadata" src="/api/projects/${id}/file/mp4?v=${r.at}"></video></div></div>`
            : `<div id="player"></div>`}
        </aside>
      </div>`;
      hydrateIcons(host);
      if (!(r && !rendering)) mountPlayer(host);
      if (r && !rendering && lastDrawn !== "done") {
        popIn($$(".final-download .quick-icon", host), { from: 0.3, duration: 0.6 });
        revealIn($$(".downloads .dl", host), { y: 10, stagger: 0.05, delay: 0.15 });
      }
      if (!r && !rendering) revealIn($$(".render-checklist > div", host), { y: 10, stagger: 0.05 });
      lastDrawn = rendering ? "rendering" : r ? "done" : "ready";
      bindCancel(host);
      $("[data-back]", host).addEventListener("click", () => go(3));
      $("[data-render]", host)?.addEventListener("click", async () => {
        try {
          await flushSave();
          ({ project } = await api(`/projects/${id}/render`, { method: "POST" }));
          draw();
        } catch (error) { toast(error.message); }
      });
    };
    draw();
    stepApi.onJob = () => {
      const j = project.job;
      const key = `${j?.state}|${j?.type}|${project.result?.at}`;
      // วาดใหม่เฉพาะตอนสถานะงานเปลี่ยน — วาดทุกรอบ poll วิดีโอผลลัพธ์จะโหลดใหม่ทุกวินาที
      if (key !== lastKey) return draw();
      if (JOB_ACTIVE(project) && j.type === "render") {
        tweenBar($("#r-bar", host), j.pct || 0);
        if ($("#r-msg", host)) $("#r-msg", host).textContent = j.message || "";
        if ($("#r-pct", host)) $("#r-pct", host).textContent = `${Math.round(j.pct || 0)}%`;
        const stage = j.stage === "overlay" ? 1 : j.stage === "burn" ? 2 : 0;
        $$(".render-stages li", host).forEach((li, i) => {
          li.className = i < stage ? "done" : i === stage ? "now" : "";
          li.querySelector("span").textContent = i < stage ? "✓" : String(i + 1);
        });
      }
    };
  }

  cleanup = () => {
    clearInterval(pollTimer);
    flushSave();
    stepCleanup();
    if (player) player.destroy();
  };
  await go(JOB_ACTIVE(project) && project.job.type === "transcribe" ? 1 : step);
}

/* ---------- คลังสไตล์ ---------- */
async function pageStyles() {
  setPage("styles", "คลังสไตล์ซับ");
  const [{ styles, colorSets }, { projects }] = await Promise.all([getCatalog(), api("/projects")]);
  const bg = projects.find((p) => p.meta);
  let filter = "all";
  const current = store.get("style", "karaoke-pop");
  view().innerHTML = `<div class="page page-stack">
    <div class="style-heading">
      <div><span class="eyebrow">คลังสไตล์ซับ</span><h1>เลือกหน้าตาซับของคุณ</h1>
        <p>ทุกสไตล์ไฮไลต์ทีละคำตามเสียงพูด ใช้ฟอนต์ Kanit และจับคู่กับชุดสีได้ 8 แบบ — สไตล์ที่เลือกที่นี่จะเป็นค่าเริ่มต้นของโปรเจกต์ใหม่</p></div>
      <span class="style-count">${icon("sparkles", "i-sm")}${styles.length} สไตล์พร้อมใช้</span>
    </div>
    <div class="filter-row" id="filters">${[["all", "ทั้งหมด", styles.length], ["hyperframes", "พรีเมียม · HyperFrames", styles.filter((x) => x.lane === "hyperframes").length], ["ass", "เรนเดอร์เร็ว", styles.filter((x) => x.lane === "ass").length]]
      .map(([v, l, n]) => `<button data-f="${v}" class="${v === filter ? "active" : ""}">${l}<em>${n}</em></button>`).join("")}
      <span class="faint" style="margin-left:6px">สไตล์พรีเมียมมีแอนิเมชันเต็มรูปแบบ แต่ใช้เวลาเรนเดอร์นานกว่า</span></div>
    <div class="style-gallery" id="gallery">${styles.map((st, i) => `
      <article class="style-card ${st.slug === current ? "selected" : ""}" data-lane="${st.lane}">
        <div class="style-frame" data-sample="${st.slug}">
          ${bg ? `<img src="/api/projects/${bg.id}/poster" alt="" loading="lazy" onerror="this.remove()" />` : ""}
          <div class="style-badges"><span class="style-badge">ไฮไลต์ทีละคำ</span>${st.lane === "hyperframes" ? '<span class="style-badge premium">พรีเมียม</span>' : ""}</div>
        </div>
        <div class="style-card-body">
          <span class="style-number">${String(i + 1).padStart(2, "0")}</span>
          <h3>${esc(st.name)}</h3>
          <p>${esc(st.description)}</p>
          <div class="style-meta"><span>${icon(st.lane === "hyperframes" ? "gem" : "zap")}${st.lane === "hyperframes" ? "ละเอียดกว่า" : "เร็วมาก"}</span><span>${icon("monitor")}ทุกขนาดจอ</span></div>
          <button class="button ${st.slug === current ? "button-ink" : "button-quiet"} style-select-button" data-use="${st.slug}">${st.slug === current ? `${icon("check")}ค่าเริ่มต้นตอนนี้` : "ใช้เป็นค่าเริ่มต้น"}</button>
        </div>
      </article>`).join("")}</div>
    <section class="panel" style="padding:21px">
      <div class="section-heading"><div><h2>ชุดสีไฮไลต์</h2><p>ใช้ได้กับทุกสไตล์ เลือกได้ในขั้น "สไตล์" ของแต่ละโปรเจกต์</p></div></div>
      <div class="swatches">${colorSets.map((c) => `<span class="swatch" style="cursor:default"><span class="chips"><span style="background:${c.primary}"></span><span style="background:${c.secondary}"></span></span>${esc(c.name)} <span class="faint">${esc(c.hint)}</span></span>`).join("")}</div>
    </section>
  </div>`;
  // ทุกการ์ดขยับจริงด้วยท่าเดียวกับตัวเรนเดอร์ (GSAP) — ความต่างของสไตล์อยู่ที่การเคลื่อนไหว ภาพนิ่งเทียบกันไม่ออก
  const mountAll = () => {
    stopLivePreviews();
    $$("[data-sample]").forEach((el) => {
      if (!el.closest(".style-card").hidden) mountLivePreview(el, styles.find((x) => x.slug === el.dataset.sample));
    });
  };
  requestAnimationFrame(mountAll);
  revealIn($$(".style-heading, #filters"), { y: 14 });
  popIn($$(".style-card"), { from: 0.92, stagger: 0.035, duration: 0.4, delay: 0.1 });
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    filter = b.dataset.f;
    $$("#filters button").forEach((x) => x.classList.toggle("active", x === b));
    $$(".style-card").forEach((x) => { x.hidden = filter !== "all" && x.dataset.lane !== filter; });
    mountAll();
    popIn($$(".style-card:not([hidden])"), { from: 0.94, stagger: 0.025, duration: 0.3 });
  });
  $("#gallery").addEventListener("click", (e) => {
    const b = e.target.closest("[data-use]");
    if (!b) return;
    store.set("style", b.dataset.use);
    toast("ตั้งเป็นสไตล์เริ่มต้นของโปรเจกต์ใหม่แล้ว");
    route();
  });
}

/* ---------- ตั้งค่าครั้งแรก (ถอดแบบหน้า /setup ของ Clip360) ---------- */
// หน้าเต็มจอสีเข้ม ไม่มีแถบข้าง: ตรวจเครื่อง → FFmpeg → ตัวถอดเสียง → Gemini (ไม่บังคับ) → พร้อมใช้
// ทุกการติดตั้งทำบนเซิร์ฟเวอร์เบื้องหลัง หน้านี้แค่สั่งเริ่มแล้วคอยดูความคืบหน้า
// ปิดแท็บแล้วเปิดใหม่ก็ยังเห็นงานที่ทำค้างอยู่

const SETUP_STEPS = [
  { id: 1, title: "ตรวจเครื่อง", desc: "Node.js · โฟลเดอร์ · ฟอนต์ไทย", icon: "monitor" },
  { id: 2, title: "FFmpeg", desc: "ใส่ซับลงวิดีโอ", icon: "film" },
  { id: 3, title: "ตัวถอดเสียง", desc: "whisper.cpp บนเครื่อง", icon: "mic" },
  { id: 4, title: "Gemini", desc: "AI แก้คำและแปล · ไม่บังคับ", icon: "key" },
  { id: 5, title: "พร้อมใช้งาน", desc: "เริ่มทำซับแรก", icon: "sparkles" },
];

const fmtGB = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

async function pageSetup() {
  document.title = "ตั้งค่าครั้งแรก · Sub360";
  let st = await api("/setup/status?refresh");
  let step = 0;
  let pollTimer = null;
  let whisperModel = "large";
  const skippedGemini = () => store.get("geminiSkipped") === "1";

  const systemReady = () => st.node.ready && st.storage.ready && st.fonts.ready;
  const done = (id) => ({
    1: systemReady(),
    2: st.ffmpeg.ready,
    3: st.whisper.ready,
    4: st.gemini.ready || skippedGemini(),
    5: st.ffmpeg.ready && st.whisper.ready,
  })[id];
  const locked = (id) => (id === 2 && !systemReady()) || (id === 5 && !(st.ffmpeg.ready && st.whisper.ready));
  const firstOpen = () => [1, 2, 3, 4].find((id) => !done(id)) || 5;
  const running = (name) => st.installs[name].state === "running";

  view().innerHTML = `<div class="setup-page">
    <header class="setup-top">
      <a class="brand" href="#/"><svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="#ffd23f"/><rect x="7" y="23" width="26" height="8" rx="4" fill="#0b0e10"/><rect x="11" y="12" width="18" height="5.5" rx="2.75" fill="#0b0e10" opacity=".55"/></svg><span class="brand-word">Sub<em>360</em></span><span class="local-badge">LOCAL</span></a>
      <span class="privacy-note">${icon("shield")}ทำงานบนเครื่องนี้ · วิดีโอไม่ถูกอัปโหลดออกไป</span>
    </header>
    <main class="setup-main">
      <section class="setup-intro">
        <span class="setup-eyebrow">ตั้งค่าครั้งแรก · ใช้เวลาประมาณ 5–15 นาที</span>
        <h1>เตรียม Sub360 ให้พร้อมใช้งาน</h1>
        <p>เราจะเช็กเครื่อง ติดตั้งเครื่องมือทำวิดีโอและตัวถอดเสียงภาษาไทยให้ทั้งหมด คุณแค่กดปุ่มทีละขั้น ไม่ต้องติดตั้งอะไรเอง</p>
      </section>
      <section class="setup-wizard">
        <aside class="setup-rail">
          <div class="rail-heading"><span>ความคืบหน้า</span><strong id="rail-count"></strong></div>
          <ol class="setup-steps" id="setup-steps"></ol>
          <div class="local-callout">${icon("folder")}<div><strong>ทุกอย่างอยู่บนเครื่องนี้</strong><span>เครื่องมือติดตั้งไว้ในโฟลเดอร์ของ Sub360 ไม่แก้ระบบของ Windows</span></div></div>
        </aside>
        <div class="setup-panel" id="setup-panel"></div>
      </section>
      <p class="setup-footer">Sub360 Local · เปิดหน้านี้อีกครั้งได้จากเมนู ตั้งค่า → ตัวช่วยตั้งค่า</p>
    </main>
  </div>`;

  const renderRail = () => {
    const allDone = done(5) && done(4);
    $("#rail-count").textContent = allDone ? "พร้อมแล้ว" : `${step} / ${SETUP_STEPS.length}`;
    $("#setup-steps").innerHTML = SETUP_STEPS.map((s) => `
      <li><button type="button" class="setup-step" data-id="${s.id}" data-active="${s.id === step}" data-complete="${Boolean(done(s.id)) && s.id !== 5}" ${locked(s.id) ? "disabled" : ""}>
        <span class="setup-num">${done(s.id) && s.id !== 5 ? icon("check") : s.id}</span>
        <span class="setup-copy"><strong>${s.title}</strong><small>${s.desc}</small></span>
        ${icon(s.icon, "setup-step-icon")}
      </button></li>`).join("");
  };

  const statusRow = (iconName, title, detail, ready, { optional = false } = {}) => `
    <div class="status-row">
      <span class="status-icon">${icon(iconName)}</span>
      <span class="status-copy"><strong>${title}</strong><small>${detail}</small></span>
      <span class="status-result" data-ready="${ready}" data-optional="${optional && !ready}">${ready ? `${icon("check")}พร้อมใช้` : optional ? "ไม่บังคับ" : "ยังไม่พร้อม"}</span>
    </div>`;
  const heading = (iconName, kicker, title, sub) => `
    <div class="setup-heading">
      <span class="section-icon">${icon(iconName)}</span>
      <div><span class="step-kicker-dark">${kicker}</span><h2>${title}</h2><p>${sub}</p></div>
    </div>`;
  const good = (title, text) => `<div class="good-message">${icon("check")}<span><strong>${title}</strong>${text}</span></div>`;
  const bad = (title, text) => `<div class="error-message">${icon("alert")}<span><strong>${title}</strong>${esc(text)}</span></div>`;
  const progressBlock = (name, label) => {
    const j = st.installs[name];
    return `<div class="progress-block" id="progress-${name}">
      <div class="progress-topline"><span id="${name}-msg">${esc(j.message || label)}</span><strong id="${name}-pct">${j.pct}%</strong></div>
      <div class="progress-track"><span id="${name}-bar" style="width:${j.pct}%"></span></div>
      <div class="progress-meta"><span>กำลังติดตั้งบน Sub360 Local</span><span>ปิดหน้านี้ได้ งานยังทำต่อบนเครื่อง</span></div>
    </div>`;
  };

  function renderPanel() {
    const panel = $("#setup-panel");
    let html = "";
    if (step === 1) {
      html = `${heading("monitor", "ขั้นที่ 1", "ตรวจความพร้อมของเครื่อง", "Sub360 กำลังเช็กของที่ต้องใช้บนเครื่องนี้")}
        <div class="status-list">
          ${statusRow("monitor", "Node.js", `เวอร์ชัน ${esc(st.node.version)}${st.node.ready ? "" : " — ต้องใช้ 22.13 ขึ้นไป"}`, st.node.ready)}
          ${statusRow("folder", "โฟลเดอร์จัดเก็บ", esc(st.storage.path), st.storage.ready)}
          ${statusRow("captions", "ฟอนต์ภาษาไทย Kanit", st.fonts.ready ? `${st.fonts.files.length} ไฟล์พร้อมใช้` : "ไม่พบไฟล์ฟอนต์ใน pipeline/fonts", st.fonts.ready)}
          ${statusRow("gem", "HyperFrames (ซับพรีเมียม)", st.hyperframes.ready ? "ติดตั้งแล้ว — ใช้สไตล์พรีเมียมได้ครบ 12 แบบ" : "ยังไม่ได้ติดตั้ง — ใช้ได้แค่สไตล์แบบเร็ว (ตัวเปิดโปรแกรมจะติดตั้งให้ครั้งถัดไป)", st.hyperframes.ready, { optional: true })}
          ${statusRow("zap", "การ์ดจอ", st.gpu ? `${esc(st.gpu)} — ถอดเสียงเร็วขึ้นหลายเท่า` : "ไม่พบการ์ดจอ NVIDIA — ถอดเสียงด้วย CPU (ช้ากว่าแต่ใช้ได้)", Boolean(st.gpu), { optional: true })}
        </div>
        ${systemReady() ? good("เครื่องนี้พร้อมสำหรับ Sub360", "ไปติดตั้งเครื่องมือทำวิดีโอกันต่อได้เลย") : bad("ยังไม่พร้อม", "แก้รายการที่ขึ้นสีแดงก่อน แล้วกดตรวจอีกครั้ง")}
        <div class="setup-actions">
          <button class="setup-secondary" data-act="recheck">${icon("refresh")}ตรวจอีกครั้ง</button>
          <button class="setup-primary" data-go="2" ${systemReady() ? "" : "disabled"}>ไปขั้นต่อไป ${icon("arrowRight")}</button>
        </div>`;
    } else if (step === 2) {
      const f = st.ffmpeg;
      const j = st.installs.ffmpeg;
      html = `${heading("download", "ขั้นที่ 2 · จำเป็น", "ติดตั้ง FFmpeg", "เครื่องมือเบื้องหลังที่ใช้วางซับลงบนวิดีโอ")}
        ${f.ready ? `${good("FFmpeg พร้อมใช้งานแล้ว", `เวอร์ชัน ${esc(f.version)} · รองรับซับภาษาไทย (libass) · จาก ${esc(f.source)}`)}` : running("ffmpeg") ? progressBlock("ffmpeg", "กำลังดาวน์โหลด FFmpeg") : `
          <div class="install-intro">
            <div class="tool-tile">${icon("film")}<span>FFMPEG</span></div>
            <div><h3>${esc(f.reason || "ยังไม่พบ FFmpeg บนเครื่องนี้")}</h3>
              <p>Sub360 จะดาวน์โหลดรุ่นที่รองรับซับภาษาไทยจาก gyan.dev แล้วเก็บไว้ในโฟลเดอร์โปรแกรม ไม่ต้องติดตั้งเอง</p>
              <ul><li>ดาวน์โหลดประมาณ 100 MB</li><li>เก็บไว้ใน data/bin ไม่แก้ระบบของเครื่อง</li><li>รองรับซับภาษาไทยและวิดีโอทุกขนาด</li></ul></div>
          </div>`}
        ${j.state === "failed" ? bad("ติดตั้งไม่สำเร็จ", j.error) : ""}
        <div class="setup-actions">
          <button class="setup-text" data-go="1">ย้อนกลับ</button>
          ${running("ffmpeg") ? `<button class="setup-secondary" data-act="cancel" data-name="ffmpeg">ยกเลิก</button>` : ""}
          ${f.ready ? `<button class="setup-primary" data-go="3">ไปติดตั้งตัวถอดเสียง ${icon("arrowRight")}</button>`
            : `<button class="setup-primary" data-act="install-ffmpeg" ${running("ffmpeg") ? "disabled" : ""}>${running("ffmpeg") ? '<span class="spinner"></span>กำลังติดตั้ง…' : `${icon("download")}${j.state === "failed" ? "ลองใหม่" : "ดาวน์โหลดและติดตั้ง"}`}</button>`}
        </div>`;
    } else if (step === 3) {
      const w = st.whisper;
      const j = st.installs.whisper;
      const binBytes = st.gpu ? 675e6 : 21e6;
      html = `${heading("mic", "ขั้นที่ 3 · จำเป็น", "ติดตั้งตัวถอดเสียงภาษาไทย", "whisper.cpp ฟังเสียงในวิดีโอแล้วแปลงเป็นข้อความพร้อมจังหวะรายคำ ทำงานบนเครื่องนี้ ฟรี ไม่ส่งเสียงออกไปไหน")}
        ${w.ready ? good("ตัวถอดเสียงพร้อมใช้งานแล้ว", `โมเดล ${esc(w.modelName)} · ${esc(w.source)}${st.gpu ? ` · ใช้การ์ดจอ ${esc(st.gpu)}` : ""}`)
          : running("whisper") ? progressBlock("whisper", "กำลังติดตั้ง whisper.cpp") : `
          <div class="model-choice" id="model-choice">
            ${Object.entries(st.models).map(([key, m]) => `
              <button type="button" class="model-card ${key === whisperModel ? "on" : ""}" data-model="${key}">
                <span class="model-radio"></span>
                <span><strong>${m.name}${key === "large" ? ' <em>แนะนำ</em>' : ""}</strong><small>${m.note}</small></span>
                <b>${fmtGB(m.bytes)}</b>
              </button>`).join("")}
          </div>
          <div class="install-intro compact">
            <div class="tool-tile">${icon("mic")}<span>WHISPER</span></div>
            <div><h3>ต้องดาวน์โหลดราว ${fmtGB(st.models[whisperModel].bytes + binBytes)}</h3>
              <p>${st.gpu ? `พบการ์ดจอ <b>${esc(st.gpu)}</b> — จะติดตั้งรุ่นที่ใช้การ์ดจอเร่งความเร็ว คลิป 1 นาทีถอดเสร็จในไม่กี่วินาที` : "ไม่พบการ์ดจอ NVIDIA — จะติดตั้งรุ่นที่ใช้ CPU ถอดเสียงได้แต่ช้ากว่า"}</p>
              <ul><li>ติดตั้งไว้ที่ ${esc(st.whisperHome)}</li><li>เน็ตหลุดกลางทาง กดใหม่แล้วโหลดต่อจากเดิม</li></ul></div>
          </div>`}
        ${!w.ready && w.cli && w.reason && !running("whisper") && j.state !== "failed" ? `<p class="field-help">${esc(w.reason)}</p>` : ""}
        ${j.state === "failed" ? bad("ติดตั้งไม่สำเร็จ", j.error) : ""}
        <div class="setup-actions">
          <button class="setup-text" data-go="2">ย้อนกลับ</button>
          ${running("whisper") ? `<button class="setup-secondary" data-act="cancel" data-name="whisper">หยุดไว้ก่อน</button>` : ""}
          ${w.ready ? `<button class="setup-primary" data-go="4">ต่อไป ${icon("arrowRight")}</button>`
            : `<button class="setup-primary" data-act="install-whisper" ${running("whisper") ? "disabled" : ""}>${running("whisper") ? '<span class="spinner"></span>กำลังติดตั้ง…' : `${icon("download")}${j.state === "failed" ? "ลองใหม่ (โหลดต่อจากเดิม)" : "ดาวน์โหลดและติดตั้ง"}`}</button>`}
        </div>`;
    } else if (step === 4) {
      const g = st.gemini;
      html = `${heading("key", "ขั้นที่ 4 · ไม่บังคับ", "เชื่อมต่อ Gemini", "เปิดใช้ปุ่ม “AI แก้คำ” (ฟังเสียงซ้ำแล้วแก้คำที่ถอดผิด) และ “แปลซับ” 9 ภาษา — ไม่ใส่ก็ทำซับได้ตามปกติ")}
        ${g.ready ? `${good("เชื่อมต่อ Gemini แล้ว", `รุ่น ${esc(g.model)} · ${g.keys.length} คีย์`)}
          <div class="saved-key">${icon("key")}<span>GEMINI_API_KEY</span><code>••••${esc(g.keys[0]?.last4 || "")}</code><span class="verified">${icon("check")}ตรวจแล้ว</span></div>` : `
          <div class="key-intro"><span class="google-mark">${icon("sparkles")}</span><div><strong>ขอคีย์ฟรีจาก Google AI Studio</strong><p>ล็อกอินด้วยบัญชี Google แล้วกด Create API key — ใช้เวลาไม่ถึงนาที</p></div>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">เปิด AI Studio ${icon("external")}</a></div>
          <div class="key-form">
            <label for="setup-key">Gemini API key</label>
            <div class="input-wrap">${icon("key")}<input id="setup-key" type="password" autocomplete="off" placeholder="AIza…" /><button type="button" data-act="toggle-key" aria-label="แสดงคีย์">${icon("eye")}</button></div>
            <p class="field-help" id="key-help">ระบบตรวจคีย์กับ Google ก่อนบันทึก และเก็บไว้ในไฟล์ .env บนเครื่องนี้เท่านั้น</p>
            <button class="setup-primary wide" data-act="save-key">${icon("check")}ตรวจและบันทึกคีย์</button>
          </div>
          <details class="help-details"><summary>ข้อมูลอะไรถูกส่งไปที่ Google บ้าง?</summary>
            <ol><li>“AI แก้คำ” ส่งเสียงของคลิปไปให้ Gemini ฟัง</li><li>“แปลซับ” ส่งเฉพาะข้อความซับ ไม่ส่งวิดีโอ</li><li>ถอดเสียงและเรนเดอร์ทำบนเครื่องนี้ทั้งหมด ไม่ส่งอะไรออกไป</li></ol></details>`}
        <div class="setup-actions">
          <button class="setup-text" data-go="3">ย้อนกลับ</button>
          ${g.ready ? `<button class="setup-primary" data-go="5">ไปขั้นสุดท้าย ${icon("arrowRight")}</button>`
            : `<button class="setup-secondary" data-act="skip-gemini">ข้ามไปก่อน</button>`}
        </div>`;
    } else {
      const ready = st.ffmpeg.ready && st.whisper.ready;
      html = `<div class="ready-state">
        <span class="ready-icon">${icon(ready ? "check" : "alert")}</span>
        <span class="setup-eyebrow">${ready ? "ตั้งค่าเสร็จแล้ว" : "ยังขาดบางอย่าง"}</span>
        <h3>${ready ? "พร้อมทำซับแรกแล้ว!" : "ยังตั้งค่าไม่ครบ"}</h3>
        <p>${ready ? "ลากวิดีโอที่มีเสียงพูดเข้ามา Sub360 จะถอดเสียง ให้คุณตรวจแก้ แล้วเรนเดอร์ซับสวย ๆ ให้" : "กลับไปติดตั้ง FFmpeg และตัวถอดเสียงให้ครบก่อน"}</p>
        <div class="ready-list">
          ${[["FFmpeg", st.ffmpeg.ready, st.ffmpeg.version], ["ตัวถอดเสียง", st.whisper.ready, st.whisper.modelName], ["ซับพรีเมียม", st.hyperframes.ready, "HyperFrames"], ["Gemini", st.gemini.ready, st.gemini.ready ? "AI แก้คำ · แปลซับ" : "ข้ามไว้ · เพิ่มทีหลังได้"]]
            .map(([n, ok, d]) => `<div data-ok="${Boolean(ok)}">${icon(ok ? "check" : "x")}<strong>${n}</strong><span>${esc(d || "")}</span></div>`).join("")}
        </div>
        ${ready ? `<button class="setup-ready-button" data-act="finish">${icon("upload")}เริ่มทำซับแรก</button>` : `<button class="setup-primary" data-go="${firstOpen()}">กลับไปตั้งค่าต่อ ${icon("arrowRight")}</button>`}
        <small>เปลี่ยนการตั้งค่าได้ทุกเมื่อที่หน้า ตั้งค่า</small>
      </div>`;
    }
    panel.innerHTML = `<div class="setup-panel-inner">${html}</div>`;
    hydrateIcons(panel);
  }

  const go = (id, animate = true) => {
    step = id;
    renderRail();
    renderPanel();
    if (animate) revealIn($$(".setup-panel-inner > *", view()), { y: 14, stagger: 0.05, duration: 0.4 });
    if (step === 5 && done(5)) {
      popIn([$(".ready-icon")], { from: 0.2, duration: 0.7 });
      revealIn($$(".ready-list > div"), { y: 10, stagger: 0.08, delay: 0.2 });
    }
    ensurePolling();
  };

  // poll เฉพาะตอนมีงานติดตั้งค้าง — แถบความคืบหน้าอัปเดตในที่ ไม่วาดทั้งแผงใหม่
  function ensurePolling() {
    if (pollTimer || !(running("ffmpeg") || running("whisper"))) return;
    pollTimer = setInterval(async () => {
      const before = { f: running("ffmpeg"), w: running("whisper") };
      try { st = await api("/setup/status"); } catch { return; }
      for (const name of ["ffmpeg", "whisper"]) {
        const j = st.installs[name];
        tweenBar($(`#${name}-bar`), j.pct);
        if ($(`#${name}-pct`)) $(`#${name}-pct`).textContent = `${j.pct}%`;
        if ($(`#${name}-msg`) && j.message) $(`#${name}-msg`).textContent = j.message;
      }
      const finished = (before.f && !running("ffmpeg")) || (before.w && !running("whisper"));
      if (finished) {
        st = await api("/setup/status?refresh");
        refreshStatus();
        const justDone = before.f && st.installs.ffmpeg.state === "done" ? 2 : before.w && st.installs.whisper.state === "done" ? 3 : null;
        if (justDone) toast(justDone === 2 ? "ติดตั้ง FFmpeg เรียบร้อย" : "ติดตั้งตัวถอดเสียงเรียบร้อย");
        // ติดตั้งเสร็จแล้วพาไปขั้นถัดไปเอง ผู้ใช้ไม่ต้องกดเพิ่ม
        go(justDone && step === justDone ? firstOpen() : step);
      }
      if (!running("ffmpeg") && !running("whisper")) { clearInterval(pollTimer); pollTimer = null; }
    }, 1000);
  }

  // ผูกกับกล่องของหน้านี้เอง — #view อยู่ตลอด ถ้าผูกที่นั่นตัวฟังจะซ้อนทุกครั้งที่กลับมาหน้านี้
  $(".setup-page").addEventListener("click", async (e) => {
    const stepBtn = e.target.closest(".setup-step");
    if (stepBtn && !stepBtn.disabled) return go(Number(stepBtn.dataset.id));
    const goBtn = e.target.closest("[data-go]");
    if (goBtn && !goBtn.disabled) return go(Number(goBtn.dataset.go));
    const model = e.target.closest("[data-model]");
    if (model) {
      whisperModel = model.dataset.model;
      return renderPanel();
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    try {
      if (act === "recheck") {
        st = await api("/setup/status?refresh");
        refreshStatus();
        go(step);
      } else if (act === "install-ffmpeg") {
        st.installs = (await api("/setup/ffmpeg", { method: "POST" })).installs;
        go(2, false);
      } else if (act === "install-whisper") {
        st.installs = (await api("/setup/whisper", { method: "POST", body: { model: whisperModel } })).installs;
        go(3, false);
      } else if (act === "cancel") {
        await api("/setup/cancel", { method: "POST", body: { name: e.target.closest("[data-act]").dataset.name } });
      } else if (act === "toggle-key") {
        const input = $("#setup-key");
        input.type = input.type === "password" ? "text" : "password";
      } else if (act === "save-key") {
        const key = $("#setup-key").value.trim();
        if (!key) { $("#key-help").textContent = "วางคีย์ก่อน"; $("#key-help").className = "field-error"; return; }
        const btn = e.target.closest("[data-act]");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>กำลังตรวจกับ Google…';
        try {
          st.gemini = await api("/settings/gemini", { method: "PUT", body: { key } });
          toast("เชื่อมต่อ Gemini แล้ว");
          go(5);
        } catch (error) {
          $("#key-help").textContent = error.message;
          $("#key-help").className = "field-error";
          btn.disabled = false;
          btn.innerHTML = `${icon("check")}ตรวจและบันทึกคีย์`;
        }
      } else if (act === "skip-gemini") {
        store.set("geminiSkipped", "1");
        go(5);
      } else if (act === "finish") {
        store.set("setupDone", "1");
        location.hash = "#/new";
      }
    } catch (error) {
      toast(error.message);
    }
  });

  go(firstOpen(), false);
  revealIn($$(".setup-top, .setup-intro, .setup-wizard", view()), { y: 20, stagger: 0.1 });
  cleanup = () => { clearInterval(pollTimer); };
}

/* ---------- ตั้งค่า ---------- */
async function pageSettings() {
  setPage("settings", "ตั้งค่า");
  const s = await refreshStatus();
  if (!s) {
    view().innerHTML = `<div class="page"><div class="form-alert error">${icon("alert")}<div>ติดต่อเซิร์ฟเวอร์ Sub360 ไม่ได้ — เปิดโปรแกรมด้วย เริ่มโปรแกรม.bat</div></div></div>`;
    return;
  }
  const check = (ok, title, detail) => `<div class="check-row"><span class="pill ${ok ? "green" : "red"}">${ok ? `${icon("check")}พร้อม` : "ยังไม่พร้อม"}</span><div><b>${title}</b><small>${detail}</small></div></div>`;
  const g = s.gemini;
  view().innerHTML = `<div class="page page-stack">
    <div class="dashboard-heading"><div><p class="eyebrow">ตั้งค่า</p><h1 style="font-size:clamp(24px,2.6vw,32px)">เครื่องมือและบริการ</h1>
      <p class="sub">Sub360 ทำงานบนเครื่องนี้ทั้งหมด — ตรวจว่าเครื่องมือครบ และใส่ Gemini API key ถ้าต้องการใช้ AI แก้คำหรือแปลซับ</p></div>
      <a class="button button-primary" href="#/setup">${icon("sparkles")}เปิดตัวช่วยตั้งค่า</a></div>
    <div class="settings-grid">
      <section class="panel" style="padding:21px">
        <div class="section-heading"><div><h2>สถานะเครื่อง</h2><p>ต้องมี FFmpeg และ whisper ถึงจะถอดเสียงและเรนเดอร์ได้</p></div>
          <button class="icon-button" id="recheck" title="ตรวจใหม่">${icon("refresh")}</button></div>
        ${check(s.ffmpeg, "FFmpeg", s.ffmpeg ? "ใช้ประกอบซับลงวิดีโอ" : `ยังไม่ได้ติดตั้ง — <a href="#/setup"><u>ติดตั้งอัตโนมัติด้วยตัวช่วยตั้งค่า</u></a>`)}
        ${check(s.whisper, "whisper.cpp — ตัวถอดเสียง", s.whisper ? `โมเดล ${esc(s.whisperModel)}` : `ยังไม่ได้ติดตั้ง — <a href="#/setup"><u>ติดตั้งอัตโนมัติด้วยตัวช่วยตั้งค่า</u></a>`)}
        ${check(s.hyperframes, "HyperFrames — ซับพรีเมียม", s.hyperframes ? "สไตล์พรีเมียมใช้งานได้" : "รัน <code>npm install</code> ในโฟลเดอร์ Sub360 — ถ้าไม่มี สไตล์พรีเมียมจะใช้แบบเร็วแทน")}
        ${check(g.ready, "Gemini — AI แก้คำและแปลซับ", g.ready ? `รุ่น ${esc(g.model)} · ${g.keys.length} คีย์` : "ไม่บังคับ — ใส่คีย์ในช่องด้านขวาเพื่อเปิดใช้")}
      </section>
      <section class="panel" style="padding:21px">
        <div class="section-heading"><div><h2>Gemini API key</h2><p>ใช้กับปุ่ม "AI แก้คำ" และ "แปลซับ" เท่านั้น</p></div><span class="quick-icon purple">${icon("key")}</span></div>
        <div class="step-body" style="gap:14px">
          ${g.keys.length ? `<div class="setting-block">${g.keys.map((k) => `<div class="key-row">${icon("key")}<code>${esc(k.slot)}</code><span class="faint">ลงท้ายด้วย ••••${esc(k.last4)}</span><span class="spacer"></span>${k.slot === "GEMINI_API_KEY" ? `<button class="button button-danger button-sm" id="key-remove">ลบ</button>` : ""}</div>`).join("")}</div>` : ""}
          <label class="field"><span>${g.ready ? "เปลี่ยนคีย์หลัก" : "วางคีย์ที่นี่"}</span>
            <div class="row" style="flex-wrap:nowrap"><input class="input" id="key" type="password" autocomplete="off" placeholder="AIza…" /><button class="button button-primary" id="key-save">บันทึก</button></div>
          </label>
          <div class="form-alert">${icon("external")}<div>ขอคีย์ฟรีได้ที่ <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener"><u>Google AI Studio</u></a> · คีย์ถูกเก็บในไฟล์ <code>.env</code> บนเครื่องนี้เท่านั้น และตรวจกับ Google ก่อนบันทึก</div></div>
          <div class="form-alert">${icon("shield")}<div><b>ข้อมูลที่ส่งออก:</b> "AI แก้คำ" ส่งเสียงของคลิป · "แปลซับ" ส่งเฉพาะข้อความซับ · การถอดเสียงและเรนเดอร์ไม่ส่งอะไรออกเลย</div></div>
          <p class="faint">มีหลายคีย์? ใส่ <code>GEMINI_API_KEY_2</code> … <code>_9</code> ในไฟล์ .env ระบบจะสลับให้เองเมื่อโควตาเต็ม · เปลี่ยนรุ่นด้วย <code>GEMINI_MODEL</code></p>
        </div>
      </section>
    </div>
    <section class="panel" style="padding:21px">
      <div class="section-heading"><div><h2>อัปเดตโปรแกรม</h2><p>ตรวจหาเวอร์ชันใหม่ให้เองทุกครั้งที่เปิด ดาวน์โหลดเบื้องหลัง แล้วบอกเมื่อพร้อมติดตั้ง</p></div><span class="quick-icon yellow">${icon("download")}</span></div>
      <div class="update-status" id="update-status"></div>
    </section>
    <section class="panel" style="padding:21px">
      <div class="section-heading"><div><h2>ไฟล์อยู่ที่ไหน</h2></div><span class="quick-icon green">${icon("folder")}</span></div>
      <p class="muted" style="font-size:13px;line-height:1.75">ทุกโปรเจกต์อยู่ในโฟลเดอร์ <code>data/projects/&lt;รหัส&gt;/</code> ของ Sub360 — วิดีโอต้นฉบับ, <code>project.json</code> (ซับที่แก้ คำแปล และการตั้งค่า) และโฟลเดอร์ <code>out/</code> (MP4, SRT, ASS, VTT, TXT) ลบโปรเจกต์จากในแอปจะลบโฟลเดอร์นั้นทั้งหมด</p>
    </section>
  </div>`;
  renderUpdatePanel();
  $("#recheck").addEventListener("click", () => { statusCache = null; route(); });
  $("#key-save").addEventListener("click", async () => {
    const key = $("#key").value.trim();
    if (!key) return toast("วางคีย์ก่อน");
    $("#key-save").disabled = true;
    $("#key-save").innerHTML = '<span class="spinner"></span>กำลังตรวจ';
    try {
      await api("/settings/gemini", { method: "PUT", body: { key } });
      toast("บันทึกคีย์แล้ว — ใช้ AI แก้คำและแปลซับได้เลย");
      statusCache = null;
      route();
    } catch (error) {
      toast(error.message);
      $("#key-save").disabled = false;
      $("#key-save").textContent = "บันทึก";
    }
  });
  $("#key-remove")?.addEventListener("click", async () => {
    if (!(await confirmBox("ลบคีย์หลัก?", "ปุ่ม AI แก้คำและแปลซับจะใช้ไม่ได้จนกว่าจะใส่คีย์ใหม่ (ซับที่ทำไว้แล้วไม่หาย)", "ลบคีย์", "button-danger"))) return;
    await api("/settings/gemini", { method: "DELETE" });
    statusCache = null;
    route();
  });
}

/* ---------- อัปเดตโปรแกรม ---------- */
// แอป Windows ตรวจและดาวน์โหลดเวอร์ชันใหม่เองอยู่เบื้องหลัง (electron/main.cjs) — ส่วนนี้ทำให้ผู้ใช้เห็นว่าถึงไหนแล้ว
// การ์ดมุมขวาล่าง: ดาวน์โหลดกี่ % · พร้อมติดตั้ง · กำลังติดตั้ง · อัปเดตเสร็จแล้ว ส่วนหน้าตั้งค่ามีสถานะเต็มพร้อมปุ่มตรวจเอง
// เปิดผ่านเบราว์เซอร์ (เริ่มโปรแกรม.bat) จะไม่มี window.sub360App — แบบนั้นอัปเดตด้วย git pull ตอนเปิดโปรแกรม
const desktop = window.sub360App || null;
let update = null;
let updateHidden = ""; // key ของการ์ดที่ผู้ใช้กดซ่อนไป — ขึ้นใหม่เมื่อสถานะเปลี่ยน
let updatedNoticeDone = false; // การ์ด "อัปเดตเสร็จแล้ว" ขึ้นครั้งเดียวพอ
let updatedTimer = 0;

function updateView(u) {
  const v = u.version ? `v${u.version}` : "เวอร์ชันใหม่";
  switch (u.state) {
    case "checking":
      return { key: "checking", pill: ["", "กำลังตรวจ…"], icon: "refresh", title: "กำลังตรวจหาเวอร์ชันใหม่…", text: "ใช้เวลาไม่กี่วินาที" };
    case "not-available":
      return {
        key: "latest", pill: ["green", "ล่าสุดแล้ว"], icon: "check", title: `v${u.current} เป็นเวอร์ชันล่าสุด`,
        text: `ตรวจล่าสุดเมื่อ ${new Date(u.checkedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`,
        action: { id: "check", label: "ตรวจอีกครั้ง" },
      };
    case "available":
      return { key: `dl:${u.version}`, card: true, pill: ["yellow", "กำลังดาวน์โหลด"], icon: "download", title: `พบ Sub360 ${v} · เริ่มดาวน์โหลด`, text: "ดาวน์โหลดอยู่เบื้องหลัง ใช้งานต่อได้ตามปกติ", progress: -1 };
    case "downloading": {
      const pct = clamp(Math.floor(u.percent || 0), 0, 100);
      const left = u.bytesPerSecond > 0 ? ((u.total - u.transferred) / u.bytesPerSecond) * 1000 : 0;
      return {
        key: `dl:${u.version}`, card: true, pill: ["yellow", "กำลังดาวน์โหลด"], icon: "download", title: `กำลังดาวน์โหลด ${v} · ${pct}%`,
        text: `${fmtBytes(u.transferred)} จาก ${fmtBytes(u.total)}${left >= 1000 ? ` · เหลืออีกราว ${fmtDuration(left)}` : ""}`,
        progress: pct,
      };
    }
    case "downloaded":
      return {
        key: `ready:${u.version}`, card: true, tone: "ok", pill: ["green", "พร้อมติดตั้ง"], icon: "check", title: `${v} พร้อมติดตั้งแล้ว`,
        text: "กด อัปเดตเลย แล้วรอราว 1 นาที Sub360 จะปิดแล้วเปิดใหม่เอง — ถ้ายังไม่สะดวก ระบบจะอัปเดตให้ตอนปิดโปรแกรม",
        action: { id: "install", label: "อัปเดตเลย", cls: "button-primary" }, later: true,
      };
    case "installing":
      return { key: "installing", card: true, closable: false, spinner: true, pill: ["yellow", "กำลังติดตั้ง"], title: "กำลังปิดเพื่อติดตั้งอัปเดต…", text: "ดูความคืบหน้าในหน้าต่าง กำลังอัปเดต แล้ว Sub360 จะเปิดขึ้นมาเองเมื่อเสร็จ" };
    case "error":
      // ไม่มี version = ตรวจเบื้องหลังแล้วเน็ตหลุด ไม่ต้องขึ้นการ์ดรบกวน (หน้าตั้งค่ายังบอกอยู่)
      return {
        key: `error:${u.version || ""}`, card: Boolean(u.version), tone: "error", pill: ["red", "ไม่สำเร็จ"], icon: "alert",
        title: u.version ? `ดาวน์โหลด ${v} ไม่สำเร็จ` : "ตรวจหาอัปเดตไม่สำเร็จ", text: "ตรวจการเชื่อมต่ออินเทอร์เน็ต แล้วกดลองใหม่", detail: u.message,
        action: { id: "check", label: "ลองใหม่", cls: "button-primary" },
      };
    default:
      return { key: "idle", pill: ["", "ยังไม่ได้ตรวจ"], icon: "refresh", title: `ใช้ Sub360 v${u.current}`, text: "โปรแกรมตรวจหาเวอร์ชันใหม่ให้เองทุกครั้งที่เปิด", action: { id: "check", label: "ตรวจหาอัปเดต" } };
  }
}

// การ์ดมุมขวาล่าง: สถานะที่ผู้ใช้ต้องรู้ หรือ "อัปเดตเสร็จแล้ว" ตอนเปิดครั้งแรกหลังอัปเดต
function updateCardView(u) {
  const view = updateView(u);
  if (view.card) {
    updatedNoticeDone = true;
    return view;
  }
  if (!u.justUpdated || updatedNoticeDone) return null;
  return {
    key: "updated", tone: "ok", icon: "check", title: `อัปเดตเป็น Sub360 v${u.current} เรียบร้อยแล้ว`,
    text: `${u.justUpdated.from ? `จาก v${u.justUpdated.from} · ` : ""}โปรเจกต์และการตั้งค่าเดิมอยู่ครบ`,
  };
}

const updateProgress = (w) => (w.progress === undefined ? "" : `<div class="progress update-progress${w.progress < 0 ? " indeterminate" : ""}"><span style="width:${Math.max(w.progress, 0)}%"></span></div>`);
const updateAction = (a) => (a ? `<button class="button button-sm ${a.cls || "button-quiet"}" data-update="${a.id}">${esc(a.label)}</button>` : "");

// วาดใหม่ทั้งก้อนเฉพาะตอนสถานะเปลี่ยน — ระหว่างดาวน์โหลดแก้แค่ตัวหนังสือกับความยาวแถบ แถบจะเลื่อนนุ่ม ๆ ไม่กระตุก
function paintUpdate(host, view, template) {
  if (host.dataset.key === view.key) {
    $(".update-title", host).textContent = view.title;
    $(".update-text", host).textContent = view.text;
    const bar = $(".update-progress", host);
    if (bar && view.progress !== undefined) {
      bar.classList.toggle("indeterminate", view.progress < 0);
      if (view.progress >= 0) bar.firstElementChild.style.width = `${view.progress}%`;
    }
    return false;
  }
  host.dataset.key = view.key;
  host.innerHTML = template(view);
  return true;
}

function renderUpdateCard() {
  const el = $("#update-card");
  const view = update && updateCardView(update);
  const show = Boolean(view) && updateHidden !== view.key;
  document.body.classList.toggle("update-open", show);
  if (!show) {
    el.hidden = true;
    el.dataset.key = "";
    return;
  }
  const appear = el.hidden;
  const fresh = paintUpdate(el, view, (w) => `
    <span class="update-icon">${w.spinner ? '<span class="spinner"></span>' : icon(w.icon)}</span>
    <div class="update-body">
      <b class="update-title">${esc(w.title)}</b>
      <small class="update-text">${esc(w.text)}</small>
      ${updateProgress(w)}
      ${w.action ? `<div class="update-actions">${updateAction(w.action)}${w.later ? updateAction({ id: "hide", label: "ไว้ทีหลัง", cls: "button-ghost-dark" }) : ""}</div>` : ""}
    </div>
    ${w.closable === false ? "" : `<button class="update-close" data-update="hide" aria-label="ซ่อน" title="ซ่อน">${icon("x")}</button>`}`);
  if (!fresh) return;
  el.className = `update-card ${view.tone || ""}`;
  el.hidden = false;
  document.body.style.setProperty("--update-card-h", `${el.offsetHeight}px`);
  if (MOTION && appear) G.fromTo(el, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.6)", clearProps: "transform,opacity" });
  clearTimeout(updatedTimer);
  if (view.key === "updated") updatedTimer = setTimeout(() => { updatedNoticeDone = true; renderUpdateCard(); }, 20000);
}

function renderUpdatePanel() {
  const host = $("#update-status");
  if (!host) return;
  let view;
  if (!desktop) {
    view = { key: "browser", pill: ["", "อัปเดตตอนเปิด"], title: `ใช้ Sub360 ${statusCache?.version?.label || ""}`, text: "เปิดด้วย เริ่มโปรแกรม.bat จะดึงเวอร์ชันล่าสุดให้ทุกครั้ง — ผลการอัปเดตแสดงในหน้าต่างสีดำตอนเปิดโปรแกรม" };
  } else if (!update) {
    return;
  } else if (!update.enabled) {
    view = { key: "disabled", pill: ["", "ปิดอยู่"], title: `ใช้ Sub360 v${update.current}`, text: "อัปเดตอัตโนมัติทำงานเฉพาะแอปที่ติดตั้งจาก Sub360-Setup.exe" };
  } else {
    view = updateView(update);
  }
  paintUpdate(host, view, (w) => `
    <div class="update-row">
      <span class="pill ${w.pill[0]}">${esc(w.pill[1])}</span>
      <div class="update-body">
        <b class="update-title">${esc(w.title)}</b>
        <small class="update-text">${esc(w.text)}</small>
        ${w.detail ? `<small class="update-detail">${esc(w.detail)}</small>` : ""}
      </div>
      ${updateAction(w.action)}
    </div>
    ${updateProgress(w)}
    ${update?.justUpdated ? `<p class="faint">เพิ่งอัปเดตเป็น v${esc(update.current)}${update.justUpdated.from ? ` จาก v${esc(update.justUpdated.from)}` : ""} ตอนเปิดโปรแกรมครั้งนี้</p>` : ""}`);
}

function onUpdateState(next) {
  const prev = update;
  update = next;
  // ผลของการกดตรวจเองที่ไม่มีการ์ดขึ้น — บอกด้วย toast ให้รู้ว่ากดแล้วได้ผล
  if (next.manual && prev?.state !== next.state) {
    if (next.state === "not-available") toast(`Sub360 v${next.current} เป็นเวอร์ชันล่าสุดแล้ว`);
    if (next.state === "error" && !next.version) toast("ตรวจหาอัปเดตไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่");
  }
  renderUpdateCard();
  renderUpdatePanel();
}

document.addEventListener("click", async (e) => {
  const button = e.target.closest("[data-update]");
  if (!button || !desktop) return;
  const action = button.dataset.update;
  if (action === "hide") {
    const key = $("#update-card").dataset.key;
    if (key === "updated") updatedNoticeDone = true;
    else updateHidden = key;
    renderUpdateCard();
  } else if (action === "check") {
    updateHidden = ""; // กดตรวจเอง = อยากเห็นผล การ์ดที่เคยซ่อนไว้ขึ้นได้อีก
    const state = await desktop.checkForUpdates();
    if (state) onUpdateState(state);
  } else if (action === "install") {
    button.disabled = true;
    // แอปถามยืนยันก่อนถ้ามีงานถอดเสียง/เรนเดอร์ค้างอยู่ — ยกเลิกแล้วให้กดใหม่ได้
    if (!(await desktop.installUpdate())) button.disabled = false;
  }
});

/* ---------- เริ่ม ---------- */
hydrateIcons();
window.addEventListener("hashchange", route);
refreshStatus();
setInterval(refreshSidebar, 5000);
if (desktop) {
  desktop.onUpdate(onUpdateState);
  desktop.updateState().then(onUpdateState).catch(() => {});
}
route();
