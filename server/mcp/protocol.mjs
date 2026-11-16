// MCP (Model Context Protocol) for Sub360 — JSON-RPC 2.0, stateless, answered with plain JSON.
//
// Same transport rules as the webapp-mcp-connector kit that is proven with Claude, ChatGPT and
// Gemini: one JSON-RPC message (or batch) per POST, no SSE and no Mcp-Session-Id. The stdio
// bridge (server/mcp-stdio.mjs) forwards each line to the same handler, so both paths behave alike.
import { createHash, randomBytes } from "node:crypto";

// Revisions proven by the kit with real apps (Nov 2026). A newer client falls back to one of these.
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const CONFIRM_TTL_MS = 10 * 60_000;
const CONFIRM_PER_CLIENT = 50; // one connection cannot push out another's pending confirmations
const MAX_BATCH = 20;

/** An error the model should see and can act on (wrong argument, busy project, needs a step first). */
export class ToolError extends Error {
  constructor(message, { fields = null, status = 400 } = {}) {
    super(message);
    this.fields = fields;
    this.status = status;
  }
}

/* ---------- argument validation (the JSON-schema subset our tools use) ---------- */

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

/** Returns { field: problem } for every problem found, empty when the value fits. */
export function validate(schema, value, at = "", problems = {}) {
  const field = at || "(arguments)";
  const actual = typeOf(value);
  const wanted = schema.type;
  if (wanted) {
    const ok = wanted === actual || (wanted === "number" && actual === "integer");
    if (!ok) {
      problems[field] = `ต้องเป็น ${wanted}`;
      return problems;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    problems[field] = `ต้องเป็นค่าใดค่าหนึ่งใน ${schema.enum.join(", ")}`;
    return problems;
  }
  if (actual === "string") {
    if (schema.minLength != null && value.length < schema.minLength) problems[field] = `สั้นเกิน (อย่างน้อย ${schema.minLength} ตัวอักษร)`;
    if (schema.maxLength != null && value.length > schema.maxLength) problems[field] = `ยาวเกิน ${schema.maxLength} ตัวอักษร`;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) problems[field] = "รูปแบบไม่ถูกต้อง";
  }
  if (actual === "integer" || actual === "number") {
    if (schema.minimum != null && value < schema.minimum) problems[field] = `ต้องไม่น้อยกว่า ${schema.minimum}`;
    if (schema.maximum != null && value > schema.maximum) problems[field] = `ต้องไม่เกิน ${schema.maximum}`;
  }
  if (actual === "array") {
    if (schema.minItems != null && value.length < schema.minItems) problems[field] = `ต้องมีอย่างน้อย ${schema.minItems} รายการ`;
    if (schema.maxItems != null && value.length > schema.maxItems) problems[field] = `ใส่ได้ไม่เกิน ${schema.maxItems} รายการ`;
    if (schema.items) value.forEach((item, i) => validate(schema.items, item, `${at}[${i}]`, problems));
  }
  if (actual === "object") {
    const props = schema.properties || {};
    for (const key of schema.required || []) {
      if (value[key] === undefined) problems[at ? `${at}.${key}` : key] = "ต้องระบุ";
    }
    for (const [key, item] of Object.entries(value)) {
      const name = at ? `${at}.${key}` : key;
      if (props[key]) validate(props[key], item, name, problems);
      else if (schema.additionalProperties === false) problems[name] = "ไม่รู้จักช่องนี้";
    }
  }
  return problems;
}

/* ---------- confirmation tokens ---------- */

const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

function createConfirmations() {
  const pending = new Map(); // token → { key, client, expires }
  const keyFor = (client, tool, args) => {
    const { confirm_token: _, ...rest } = args || {};
    return createHash("sha256").update(stable([client, tool, rest])).digest("hex");
  };
  const sweep = (client) => {
    const now = Date.now();
    for (const [token, item] of pending) if (item.expires < now) pending.delete(token);
    const mine = [...pending].filter(([, item]) => item.client === client);
    for (const [token] of mine.slice(0, Math.max(0, mine.length - CONFIRM_PER_CLIENT + 1))) pending.delete(token);
  };
  return {
    /** null = confirmed (go ahead); otherwise the needs_confirmation answer to return as-is. */
    check(client, tool, args, impact) {
      sweep(client);
      const key = keyFor(client, tool, args);
      if (args?.confirm_token) {
        const item = pending.get(args.confirm_token);
        if (!item || item.key !== key) {
          throw new ToolError("confirm_token นี้ใช้ไม่ได้ (หมดอายุ ใช้ไปแล้ว หรือ argument ไม่ตรงกับตอนขอยืนยัน) — เรียกใหม่โดยไม่ใส่ confirm_token เพื่อขอยืนยันอีกครั้ง", { status: 409 });
        }
        pending.delete(args.confirm_token);
        return null;
      }
      const token = randomBytes(18).toString("base64url");
      pending.set(token, { key, client, expires: Date.now() + CONFIRM_TTL_MS });
      return {
        status: "needs_confirmation",
        changed: false,
        impact,
        confirm_token: token,
        expires_in_seconds: CONFIRM_TTL_MS / 1000,
        next: `Nothing has changed yet. Show this impact to the user and ask. Only after they agree, call ${tool} again with exactly the same arguments plus confirm_token.`,
      };
    },
  };
}

/* ---------- tool registry + JSON-RPC handler ---------- */

const ANNOTATIONS = {
  read: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  write: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  destructive: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
};

/** Builds the MCP tool list entry; tools that may ask for confirmation accept confirm_token. */
function describe(tool) {
  const properties = { ...(tool.input || {}) };
  if (tool.confirm) {
    properties.confirm_token = {
      type: "string",
      maxLength: 100,
      description: "Only on the second call, after the user agreed to the impact shown by needs_confirmation.",
    };
  }
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: { type: "object", properties, required: tool.required || [], additionalProperties: false },
    annotations: { title: tool.title, ...ANNOTATIONS[tool.kind || "read"], ...(tool.openWorld ? { openWorldHint: true } : {}) },
  };
}

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });

function answer(result) {
  const structured = result && typeof result === "object" && !Array.isArray(result) ? result : { result };
  return {
    content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
    isError: false,
  };
}

function failure(error) {
  const fields = Object.entries(error.fields || {}).map(([field, why]) => `${field}: ${why}`);
  const text = fields.length ? `${error.message}\n${fields.join("\n")}` : error.message;
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * createMcp({ tools, instructions, version, mapError })
 *   handle(message, { remote, client }) → JSON-RPC response, array, or null for notifications
 */
export function createMcp({ tools, instructions, version, mapError = () => null, log = console.error }) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  if (byName.size !== tools.length) throw new Error("createMcp: duplicate tool name");
  const listed = tools.map(describe);
  const confirmations = createConfirmations();

  async function callTool(params, session) {
    const tool = byName.get(params?.name);
    if (!tool) return { error: [-32602, `Unknown tool: ${String(params?.name).slice(0, 80)}`] };
    const args = params.arguments ?? {};
    const schema = describe(tool).inputSchema;
    const problems = validate(schema, args);
    if (Object.keys(problems).length) return { result: failure(new ToolError("argument ไม่ถูกต้อง", { fields: problems })) };
    const ctx = {
      remote: Boolean(session.remote),
      client: session.client || "local",
      confirm: (impact) => confirmations.check(session.client || "local", tool.name, args, impact),
    };
    try {
      return { result: answer(await tool.run(args, ctx)) };
    } catch (error) {
      if (error instanceof ToolError) return { result: failure(error) };
      const mapped = mapError(error);
      if (mapped) return { result: failure(mapped) };
      // Unknown failure: log without the arguments (they may hold file paths or subtitle text).
      log(JSON.stringify({ mcpTool: tool.name, error: String(error?.message || error).slice(0, 200) }));
      return { result: failure(new ToolError("Sub360 ทำงานนี้ไม่สำเร็จ ลองอีกครั้ง หรือเปิดหน้าต่าง Sub360 ดูรายละเอียด")) };
    }
  }

  async function handleOne(msg, session) {
    if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      // Responses from the client (we never send requests) and junk are ignored or rejected.
      if (msg && (msg.result !== undefined || msg.error !== undefined)) return null;
      return rpcError(msg?.id, -32600, "Invalid Request");
    }
    const isNotification = msg.id === undefined || msg.id === null;
    if (isNotification) return null;
    const { id, method, params } = msg;
    switch (method) {
      case "initialize": {
        const asked = params?.protocolVersion;
        return rpcResult(id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "sub360", title: "Sub360", version },
          instructions,
        });
      }
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: listed });
      case "tools/call": {
        const out = await callTool(params, session);
        return out.error ? rpcError(id, out.error[0], out.error[1]) : rpcResult(id, out.result);
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method.slice(0, 80)}`);
    }
  }

  async function handle(message, session = {}) {
    if (Array.isArray(message)) {
      if (!message.length || message.length > MAX_BATCH) return rpcError(null, -32600, "Invalid Request: batch must hold 1–20 messages");
      const out = (await Promise.all(message.map((m) => handleOne(m, session)))).filter(Boolean);
      return out.length ? out : null;
    }
    return handleOne(message, session);
  }

  return { handle, tools: listed };
}
