// gemini — เรียก Gemini generateContent พร้อมสลับคีย์เมื่อโควตาเต็ม
//
// คีย์อ่านจาก .env: GEMINI_API_KEY แล้ว GEMINI_API_KEY_2 … _9 (ชื่อเดียวกับ Clip360)
// โควตา free tier นับต่อ "โปรเจกต์ Google" คีย์จากคนละโปรเจกต์จึงช่วยได้จริง
// คีย์ไม่เคยถูกเขียนลง log หรือส่งกลับไปหน้าเว็บ — หน้าเว็บเห็นแค่ 4 ตัวท้าย

const API = "https://generativelanguage.googleapis.com/v1beta/models";
// alias ที่ Google ชี้ไปรุ่น Flash เสถียรล่าสุดให้เอง — วัดเมื่อ ก.ย. 2026 ได้ gemini-3.8-flash
// (gemini-2.5-flash ที่ Clip360 ใช้ ตอนนี้ตอบ 404 กับผู้ใช้ใหม่แล้ว)
export const DEFAULT_MODEL = "gemini-flash-latest";
// รุ่นสำรองเมื่อรุ่นหลักล่ม (503) หรือโควตาหมด — ทดสอบกับเสียงไทยจริงแล้วแก้คำได้ดีพอกัน
// ไม่ใช้รุ่น lite: วัดแล้วมันคืนข้อความเดิมโดยไม่แก้อะไรเลย
export const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3-flash-preview"];

export function geminiKeys(environment = process.env) {
  const slots = ["GEMINI_API_KEY", ...Array.from({ length: 8 }, (_, i) => `GEMINI_API_KEY_${i + 2}`)];
  const seen = new Set();
  const keys = [];
  for (const slot of slots) {
    const raw = slot === "GEMINI_API_KEY" ? environment[slot] || environment.GOOGLE_API_KEY : environment[slot];
    const key = String(raw ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push({ slot, key, last4: key.slice(-4) });
  }
  return keys;
}

export const geminiReady = (environment = process.env) => geminiKeys(environment).length > 0;
export const geminiModel = (environment = process.env) => environment.GEMINI_MODEL || DEFAULT_MODEL;

export class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

/** ตัด JSON ออกจากคำตอบ — บางครั้งโมเดลห่อด้วย ```json แม้สั่ง responseMimeType แล้ว */
export function extractJson(text) {
  const raw = String(text ?? "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new GeminiError("Gemini ตอบกลับมาไม่ใช่ JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * @param {{parts: object[], system?: string, temperature?: number, signal?: AbortSignal, timeoutMs?: number, environment?: object}} req
 * @returns {Promise<object>} JSON ที่โมเดลตอบ
 */
export async function geminiJson({ parts, system, temperature = 0.2, signal, timeoutMs = 180_000, environment = process.env }) {
  const keys = geminiKeys(environment);
  if (!keys.length) throw new GeminiError("ยังไม่ได้ใส่ Gemini API key — ไปที่หน้าตั้งค่า", 401);
  // รุ่นหลักล่มชั่วคราว (503) บ่อยช่วงคนใช้เยอะ — ถอยไปรุ่นสำรองแทนการให้ผู้ใช้กดใหม่เอง
  const fallbacks = environment.GEMINI_FALLBACK_MODELS
    ? environment.GEMINI_FALLBACK_MODELS.split(",").map((m) => m.trim()).filter(Boolean)
    : FALLBACK_MODELS;
  const models = [...new Set([geminiModel(environment), ...fallbacks])];
  const bodyFor = (thinkingOff) => JSON.stringify({
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature,
      // งานนี้ไม่ต้องคิดนาน — ปิด thinking ให้เร็วและถูกลง
      // (บางรุ่นเช่น flash-lite ปฏิเสธค่านี้ด้วย 400 — ตอนนั้นส่งใหม่โดยไม่ใส่)
      ...(thinkingOff ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  });

  let lastError = null;
  for (const model of models) {
    let thinkingOff = true;
    for (const { key, last4 } of keys) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt && lastError?.status !== 400) await new Promise((r) => setTimeout(r, 3000));
        const body = bodyFor(thinkingOff);
        const signals = [signal, AbortSignal.timeout(timeoutMs)].filter(Boolean);
        let res;
        try {
          res = await fetch(`${API}/${model}:generateContent`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": key },
            body,
            signal: AbortSignal.any(signals),
          });
        } catch (error) {
          if (signal?.aborted) throw error;
          lastError = new GeminiError(`ติดต่อ Gemini ไม่ได้: ${error.message}`);
          continue;
        }
        if (res.ok) {
          const data = await res.json();
          const candidate = data?.candidates?.[0];
          const text = (candidate?.content?.parts || []).map((p) => p.text || "").join("");
          if (!text) {
            const reason = candidate?.finishReason || data?.promptFeedback?.blockReason || "ไม่มีข้อความ";
            throw new GeminiError(`Gemini ไม่ตอบ (${reason})`);
          }
          return { ...extractJson(text), _model: data.modelVersion || model };
        }
        const detail = (await res.text()).slice(0, 240);
        lastError = new GeminiError(`Gemini ${res.status} (${model}, คีย์ ...${last4}): ${detail}`, res.status);
        if (res.status === 400 && thinkingOff) {
          thinkingOff = false;
          continue;
        }
        if (res.status >= 500) continue;
        break; // 4xx: โควตาเต็ม / คีย์ผิด — ลองคีย์ถัดไป
      }
      // คำขอผิดรูป — คีย์อื่นก็ผิดเหมือนกัน · 404/503 — ข้ามไปรุ่นสำรองเลย
      if ([400, 404, 503].includes(lastError?.status)) break;
    }
    if (lastError?.status === 400) break;
  }
  throw lastError || new GeminiError("เรียก Gemini ไม่สำเร็จ");
}
