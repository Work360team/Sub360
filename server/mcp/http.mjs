// HTTP glue shared by the local /mcp endpoint (main server) and the remote gateway.
// Streamable HTTP without sessions: POST one JSON-RPC message or batch, get plain JSON back.

const MAX_BODY = 3 * 1024 * 1024; // import_subtitles carries a whole SRT

export function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(data);
}

export async function readBody(req, limit = MAX_BODY) {
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > limit) {
      const error = new Error("ข้อมูลใหญ่เกินไป");
      error.status = 413;
      throw error;
    }
    parts.push(part);
  }
  return Buffer.concat(parts).toString("utf8");
}

/** Handles POST /mcp after the caller has checked who is calling. */
export async function serveMcp(req, res, mcp, session) {
  if (req.method !== "POST") {
    // No server-to-client stream: this server only answers requests.
    res.writeHead(405, { allow: "POST", "cache-control": "no-store" });
    return res.end();
  }
  if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
    return sendJson(res, 415, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Content-Type must be application/json" } });
  }
  let message;
  try {
    message = JSON.parse(await readBody(req));
  } catch (error) {
    if (error.status === 413) return sendJson(res, 413, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } });
    return sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  const out = await mcp.handle(message, session);
  if (out === null) {
    res.writeHead(202, { "cache-control": "no-store" });
    return res.end();
  }
  return sendJson(res, 200, out);
}
