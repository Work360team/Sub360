// Sub360 pipeline — API ระดับสูงที่ทั้ง CLI และ local server ใช้ร่วมกัน
//
//   transcribeVideo()  วิดีโอ → segments (ถอดเสียง)
//   refineSegments()   segments → segments ที่ AI แก้คำแล้ว (ต้องมี Gemini key)
//   timelineForVideo() segments → timeline (ตัดท่อนตามขนาดจอ)
//   translateChunks()  ท่อน → คำแปล
//   renderSubtitles()  timeline + สไตล์ → final.mp4 / .srt / .ass / .vtt / .txt
import fs from "node:fs";
import path from "node:path";
import { compileAss, compileSrt } from "./ass.mjs";
import { AlphaOverlayError, renderOverlay } from "./hyperframes.mjs";
import { ffmpeg } from "./lib.mjs";
import { burnOntoSource, hdrInfo, hdrTags, pickAudioStream, probe, subtitlesToHdr } from "./render.mjs";
import { FONTS_DIR, loadStyle, prepareStyle } from "./styles.mjs";
import { buildTimeline, compileText, compileVtt, finalizeTimeline, rewordChunk } from "./timeline.mjs";
import { extractAudio, transcribe } from "./transcribe.mjs";

export { hdrInfo, makeSdrPreview, probe, TO_SDR } from "./render.mjs";
export { listStyles, loadStyle, prepareStyle, CAPTION_COLOR_SETS } from "./styles.mjs";
export { buildTimeline, finalizeTimeline, rewordChunk, compileVtt, compileText } from "./timeline.mjs";
export { whisperReady, parseWhisperJson } from "./transcribe.mjs";
export { refineSegments } from "./refine.mjs";
export { translateChunks, TRANSLATE_LANGS } from "./translate.mjs";
export { parseSubtitles } from "./subfile.mjs";
export { geminiReady, geminiKeys, geminiModel } from "./gemini.mjs";

const noop = async () => {};

/** วิดีโอยาวกว่านี้ + สไตล์พรีเมียม → เรนเดอร์เป็นช่วง ๆ (ดูหมายเหตุที่ renderPremiumInPieces) */
export const PIECE_THRESHOLD_MS = 100_000;
const PIECE_MS = 60_000;

/** วิดีโอ → { meta, segments } */
export async function transcribeVideo({ input, workDir, language = "th", prompt = "", signal, onProgress = noop }) {
  fs.mkdirSync(workDir, { recursive: true });
  await onProgress("probe", 2, "อ่านสเปกวิดีโอ");
  const meta = await probe(input, { signal });
  if (!meta.hasAudio) throw new Error("วิดีโอนี้ไม่มีเสียง จึงถอดเป็นซับไม่ได้");

  await onProgress("audio", 8, "แยกเสียงออกจากวิดีโอ");
  const wav = path.join(workDir, "audio.wav");
  await extractAudio(input, wav, { signal, timeoutMs: 30 * 60_000 });

  await onProgress("transcribe", 15, "กำลังถอดเสียงด้วย whisper");
  const segments = await transcribe(wav, { language, prompt, signal });
  fs.rmSync(wav, { force: true });
  await onProgress("transcribe", 100, `ถอดเสียงได้ ${segments.length} ช่วง`);
  return { meta, segments };
}

/** segments → timeline ที่ตัดท่อนพอดีกับสไตล์และขนาดจอ */
export function timelineForVideo(segments, meta, { styleSlug, fontScale } = {}) {
  const { maxChars } = prepareStyle(loadStyle(styleSlug), { width: meta.width, height: meta.height, fontScale });
  return buildTimeline(segments, { durationMs: meta.durationMs, maxChars });
}

/**
 * ท่อนที่จะขึ้นจอจริงตามโหมดภาษา
 *   original    ต้นฉบับอย่างเดียว
 *   translation คำแปลแทนต้นฉบับ (คาราโอเกะไล่ตามคำแปล แบ่งเวลาตามสัดส่วน)
 *   both        ต้นฉบับ + คำแปลบรรทัดล่าง
 */
export function displayChunks(chunks, display = "original") {
  return chunks.map((c) => {
    const { sub, ...base } = c;
    const tr = String(c.translation || "").trim();
    if (display === "translation" && tr) return rewordChunk(base, tr);
    if (display === "both" && tr) return { ...base, sub: tr };
    return base;
  });
}

/**
 * เรนเดอร์ซับลงวิดีโอ
 * เลน hyperframes ล้มเมื่อไร (alpha เสีย, ไม่มี Chrome) ถอยมาเลน ass ทันที — ผู้ใช้ต้องได้ไฟล์เสมอ
 */
export async function renderSubtitles({
  input,
  workDir,
  timeline,
  meta,
  styleSlug = "karaoke-pop",
  colorSet = null,
  anchor = null,
  fontScale = 1,
  display = "original",
  translationLang = null,
  signal,
  onProgress = noop,
}) {
  // HyperFrames รันโดยตั้ง cwd เป็นโฟลเดอร์งาน — path สัมพัทธ์จะถูกต่อซ้อนกันจนหาไม่เจอ
  workDir = path.resolve(workDir);
  input = path.resolve(input);
  fs.mkdirSync(workDir, { recursive: true });
  meta = meta || await probe(input, { signal });
  const audioStream = await pickAudioStream(input, { signal });
  const hdr = await hdrInfo(input, { signal });
  const { width, height } = meta;
  const { style } = prepareStyle(loadStyle(styleSlug), { width, height, colorSet, anchor, fontScale });
  const tl = finalizeTimeline(displayChunks(timeline.chunks, display), { durationMs: meta.durationMs, holdMs: 0, minChunkMs: 200 });
  if (!tl.chunks.length) throw new Error("ไม่มีซับให้เรนเดอร์");

  await onProgress("caption", 3, "เขียนไฟล์ซับ");
  const files = {
    srt: path.join(workDir, "captions.srt"),
    ass: path.join(workDir, "captions.ass"),
    vtt: path.join(workDir, "captions.vtt"),
    txt: path.join(workDir, "transcript.txt"),
  };
  fs.writeFileSync(files.srt, compileSrt(tl), "utf8");
  fs.writeFileSync(files.ass, compileAss(tl, style, { width, height }), "utf8");
  fs.writeFileSync(files.vtt, compileVtt(tl), "utf8");
  fs.writeFileSync(files.txt, compileText(tl), "utf8");
  // คำแปลแยกไฟล์เสมอเมื่อมี — เอาไปใส่ YouTube เป็นซับอีกภาษาได้โดยไม่ต้องเรนเดอร์ใหม่
  const translated = timeline.chunks.filter((c) => String(c.translation || "").trim());
  if (translated.length) {
    files.srtTranslated = path.join(workDir, "captions.translated.srt");
    const trTl = finalizeTimeline(displayChunks(timeline.chunks, "translation"), { durationMs: meta.durationMs, holdMs: 0, minChunkMs: 200 });
    fs.writeFileSync(files.srtTranslated, compileSrt(trTl), "utf8");
  } else {
    fs.rmSync(path.join(workDir, "captions.translated.srt"), { force: true });
  }

  const warnings = [];
  let lane = "ass";
  const done = async () => {
    await onProgress("done", 100, "เสร็จแล้ว");
    return { lane, warnings, outputs: { mp4: path.join(workDir, "final.mp4"), ...files }, style: style.slug, translationLang };
  };

  if (style.lane === "hyperframes") {
    try {
      if (meta.durationMs > PIECE_THRESHOLD_MS) {
        await renderPremiumInPieces({ input, workDir, tl, style, meta, audioStream, hdr, signal, onProgress });
      } else {
        await onProgress("overlay", 8, "เรนเดอร์ซับพรีเมียม (HyperFrames)");
        const overlay = await renderOverlay(tl, style, workDir, {
          width, height, fps: Math.round(meta.fps) || 30, signal,
        }, (message) => onProgress("overlay", 45, message));
        await onProgress("burn", 50, "ประกอบซับลงวิดีโอ");
        await burnOntoSource(input, workDir, "final.mp4", {
          overlay, fontsDir: FONTS_DIR, signal, meta, audioStream, hdr,
          onProgress: (ratio) => { onProgress("burn", Math.round(50 + ratio * 48), "ประกอบซับลงวิดีโอ"); },
        });
        fs.rmSync(overlay, { force: true });
      }
      fs.rmSync(path.join(workDir, "hf"), { recursive: true, force: true });
      lane = "hyperframes";
      return done();
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      const why = error instanceof AlphaOverlayError ? error.message : String(error.message).slice(0, 300);
      warnings.push(`ซับพรีเมียมใช้ไม่ได้ จึงใช้ซับแบบเร็วแทน: ${why}`);
      await onProgress("overlay", 10, "ถอยไปใช้ซับแบบเร็ว");
    }
  }

  await onProgress("burn", 10, "ประกอบซับลงวิดีโอ");
  await burnOntoSource(input, workDir, "final.mp4", {
    fontsDir: FONTS_DIR,
    signal,
    meta,
    audioStream,
    hdr,
    onProgress: (ratio) => { onProgress("burn", Math.round(10 + ratio * 88), "ประกอบซับลงวิดีโอ"); },
  });
  return done();
}

/**
 * จุดแบ่งช่วง: ทุก ๆ ~1 นาที แต่เลื่อนไปอยู่ในช่องว่างระหว่างท่อน (ท่อนไม่โดนผ่าแล้วเล่นท่าเข้าซ้ำ)
 * และปัดให้ตรงเฟรม เพื่อให้จำนวนเฟรมรวมทุกช่วงเท่ากับวิดีโอเดิมพอดี
 */
export function planPieces(chunks, durationMs, fps, pieceMs = PIECE_MS) {
  const frame = (ms) => Math.round((ms * fps) / 1000);
  const cuts = [0];
  let target = pieceMs;
  while (target < durationMs - pieceMs * 0.35) {
    let at = target;
    for (const c of chunks) if (c.startMs < at && at < c.endMs) at = c.endMs;
    if (at >= durationMs - 1000) break;
    cuts.push(at);
    target = at + pieceMs;
  }
  cuts.push(durationMs);
  const pieces = [];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const f0 = frame(cuts[i]);
    const f1 = frame(cuts[i + 1]);
    if (f1 > f0) pieces.push({ startMs: (f0 * 1000) / fps, endMs: (f1 * 1000) / fps, frames: f1 - f0 });
  }
  return pieces;
}

/** ท่อนที่อยู่ในช่วง [a,b) เลื่อนเวลาให้เริ่มที่ 0 (ท่อนคร่อมขอบถูกตัดให้พอดีช่วง) */
export function sliceTimeline(chunks, a, b) {
  const clip = (ms) => Math.min(b, Math.max(a, ms)) - a;
  return chunks
    .filter((c) => c.endMs > a && c.startMs < b)
    .map((c) => ({
      ...c,
      startMs: clip(c.startMs),
      endMs: clip(c.endMs),
      words: c.words.map((w) => ({ ...w, startMs: clip(w.startMs), endMs: clip(w.endMs) })),
    }))
    .filter((c) => c.endMs > c.startMs);
}

/**
 * วิดีโอยาว + สไตล์พรีเมียม: เรนเดอร์ทีละ ~1 นาทีแล้วต่อกัน
 *
 * ทำไม: HyperFrames เรนเดอร์เลเยอร์ซับเป็น ProRes 4444 ทั้งคลิปก่อนจะวางทับได้ วิดีโอ 10 นาที
 * จะได้ไฟล์ชั่วคราวหลายสิบ GB และถ้าล้มกลางทางต้องเริ่มใหม่หมด ทำทีละช่วงแล้วลบทิ้งทันที
 * ใช้ดิสก์แค่ช่วงเดียว และช่วงที่ไม่มีคนพูดก็ข้ามการเรนเดอร์เลเยอร์ได้เลย
 *
 * ภาพทุกช่วงถูกบังคับเฟรมเรตคงที่และจำนวนเฟรมตายตัว ต่อกันแล้วยาวเท่าต้นฉบับเป๊ะ
 * เสียงไม่ถูกตัด — ดึงจากต้นฉบับทั้งเส้นตอนประกอบรอบสุดท้าย จึงไม่มีรอยสะดุดของเสียงที่รอยต่อ
 */
async function renderPremiumInPieces({ input, workDir, tl, style, meta, audioStream, hdr, signal, onProgress }) {
  const fps = Math.round(meta.fps) || 30;
  const pieces = planPieces(tl.chunks, meta.durationMs, fps);
  const dir = path.join(workDir, "pieces");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  try {
    for (const [i, piece] of pieces.entries()) {
      const base = 5 + (i / pieces.length) * 88;
      const span = 88 / pieces.length;
      const label = `ช่วงที่ ${i + 1}/${pieces.length}`;
      const chunks = sliceTimeline(tl.chunks, piece.startMs, piece.endMs);
      let overlay = null;
      if (chunks.length) {
        await onProgress("overlay", Math.round(base), `เรนเดอร์ซับพรีเมียม ${label}`);
        const pieceDir = path.join(dir, `p${i}`);
        fs.mkdirSync(pieceDir, { recursive: true });
        overlay = await renderOverlay(
          { durationMs: Math.round(piece.endMs - piece.startMs), chunks },
          style, pieceDir, { width: meta.width, height: meta.height, fps, signal },
        );
      }
      await onProgress("burn", Math.round(base + span * 0.8), `ประกอบภาพ ${label}`);
      const out = path.join(dir, `piece_${String(i).padStart(4, "0")}.mp4`);
      const args = ["-ss", (piece.startMs / 1000).toFixed(4), "-i", path.resolve(input)];
      if (overlay) args.push("-i", overlay);
      // คลิป HDR: ภาพเดิมไม่ถูกแตะ แปลงเฉพาะชั้นซับเข้าระบบสี HDR (ดู subtitlesToHdr ใน render.mjs)
      const sub = hdr ? `[1:v]${subtitlesToHdr(hdr, "hyperframes")}[ov];[b][ov]` : "[b][1:v]";
      args.push(
        "-filter_complex", overlay
          ? `[0:v]fps=${fps},setpts=PTS-STARTPTS[b];${sub}overlay=0:0:eof_action=pass:format=${hdr ? "yuv420p10" : "auto"}[v]`
          : `[0:v]fps=${fps},setpts=PTS-STARTPTS[v]`,
        "-map", "[v]", "-an",
        "-frames:v", String(piece.frames),
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", ...(hdr ? hdrTags(hdr) : []), "-r", String(fps),
        "-y", out,
      );
      await ffmpeg(args, { signal, timeoutMs: 60 * 60_000 });
      files.push(out);
      // ลบเลเยอร์ของช่วงนี้ทันที — นี่คือเหตุผลที่แบ่งช่วงตั้งแต่แรก
      if (overlay) fs.rmSync(path.dirname(overlay), { recursive: true, force: true });
    }

    await onProgress("burn", 94, "ต่อทุกช่วงและใส่เสียงเดิม");
    const list = path.join(dir, "list.txt");
    fs.writeFileSync(list, files.map((f) => `file '${path.basename(f)}'`).join("\n"), "utf8");
    await ffmpeg([
      "-f", "concat", "-safe", "0", "-i", "list.txt",
      "-i", path.resolve(input),
      "-map", "0:v", ...(audioStream == null ? [] : ["-map", `1:${audioStream}`]),
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      "-t", (meta.durationMs / 1000).toFixed(3),
      "-movflags", "+faststart",
      "-y", path.join(workDir, "final.mp4"),
    ], { cwd: dir, signal, timeoutMs: 60 * 60_000 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
