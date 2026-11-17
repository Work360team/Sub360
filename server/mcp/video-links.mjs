// ลิงก์ดูคลิปที่แอป AI ส่งให้ผู้ใช้ (หลักเดียวกับ Clip360)
//
//   /v/<token>                หน้าดู: เล่นวิดีโอ + ปุ่มดาวน์โหลด (ไม่มีสคริปต์)
//   /v/<token>/video.mp4      ไฟล์ รองรับ Range (เลื่อนได้) และ ?download=1
//
// token สุ่ม 24 ไบต์ เก็บแค่แฮช อายุ 7 วัน สูงสุด 200 ลิงก์ ยกเลิกทั้งหมดได้จากหน้าตั้งค่า
// ไฟล์ส่งจากเครื่องผู้ใช้โดยตรง ไม่อัปโหลดไปที่ไหน — ใครได้ลิงก์ไปก็ดูคลิปนั้นได้จนหมดอายุ
import fs from "node:fs";
import { createHash } from "node:crypto";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function notFound(res, text) {
  res.writeHead(404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" });
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sub360</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:#f5f4ef;color:#1c201d;font:16px/1.6 'Leelawadee UI',Tahoma,sans-serif"><p style="max-width:420px;text-align:center">${esc(text)}</p></body>`);
}

function watchPage(token, link, file) {
  const until = new Date(link.expiresAt).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const src = `/v/${encodeURIComponent(token)}/video.mp4`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(file.name)} · Sub360</title><style>
:root{--bg:#f5f4ef;--card:#fff;--ink:#1c201d;--muted:#5d6259;--line:#e2e3dc;--accent:#ffd23f}
@media (prefers-color-scheme:dark){:root{--bg:#111412;--card:#1c201d;--ink:#f5f4ef;--muted:#b7bab2;--line:#2c312c}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.6 "Leelawadee UI","Noto Sans Thai",Tahoma,sans-serif}
main{width:100%;max-width:560px;display:grid;gap:12px}
video{width:100%;max-height:78vh;border-radius:16px;background:#000}
h1{margin:0;font-size:17px;word-break:break-word}p{margin:0;color:var(--muted);font-size:13px}
a.dl{display:inline-flex;justify-content:center;align-items:center;min-height:46px;border-radius:12px;background:var(--accent);color:#1c201d;font-weight:700;text-decoration:none}
a.dl:focus-visible{outline:3px solid #8a6c00;outline-offset:2px}
</style></head><body><main>
<video controls playsinline preload="metadata" src="${src}"></video>
<h1>${esc(file.name)}</h1>
<a class="dl" href="${src}?download=1">ดาวน์โหลด MP4</a>
<p>ลิงก์นี้ใช้ได้ถึง ${esc(until)} น. และเปิดได้เฉพาะตอนที่คอมพิวเตอร์ของเจ้าของเปิด Sub360 อยู่ · ส่งจาก Sub360</p>
</main></body></html>`;
}

/** createVideoLinks({ access, files }) — files.resolve(projectId, "mp4") → { path, name } */
export function createVideoLinks({ access, files }) {
  function lookup(token) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
    return access.videoLink(createHash("sha256").update(token).digest("hex"));
  }

  /** ตอบ /v/<token>[/video.mp4] · คืน false ถ้าไม่ใช่ path ของลิงก์ดูคลิป */
  function serve(req, res, url) {
    const m = /^\/v\/([^/]+)(\/video\.mp4)?\/?$/.exec(url.pathname);
    if (!m || !["GET", "HEAD"].includes(req.method)) return false;
    const token = decodeURIComponent(m[1]);
    const link = lookup(token);
    if (!link) return notFound(res, "ลิงก์นี้หมดอายุหรือถูกยกเลิกแล้ว — ขอลิงก์ใหม่จากแอป AI ได้"), true;
    const file = files?.resolve(link.projectId, "mp4");
    let stat = null;
    try { stat = file && fs.statSync(file.path); } catch { /* ไม่มีแล้ว */ }
    if (!stat?.isFile()) return notFound(res, "ไม่พบวิดีโอนี้แล้ว — อาจถูกลบหรือกำลังเรนเดอร์ใหม่"), true;

    if (!m[2]) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-frame-options": "DENY",
        "content-security-policy": "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      });
      res.end(req.method === "HEAD" ? undefined : watchPage(token, link, file));
      return true;
    }

    const download = url.searchParams.has("download");
    const headers = {
      "content-type": "video/mp4",
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start >= stat.size || start > end) {
        res.writeHead(416, { "content-range": `bytes */${stat.size}` });
        res.end();
        return true;
      }
      res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${stat.size}`, "content-length": end - start + 1 });
      if (req.method === "HEAD") res.end();
      else fs.createReadStream(file.path, { start, end }).pipe(res);
      return true;
    }
    res.writeHead(200, { ...headers, "content-length": stat.size });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file.path).pipe(res);
    return true;
  }

  return { serve };
}
