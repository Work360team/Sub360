// Client for Sub360's own /api, used by the MCP tools.
//
// Tools go through the same HTTP routes the app window uses, so they share the job queue,
// the validation and the "busy" checks, and the window shows every change right away.
import fs from "node:fs";
import http from "node:http";
import { ToolError } from "./protocol.mjs";

/** getBase() → "http://127.0.0.1:<port>" of the running server */
export function createLocalApi(getBase) {
  function request(method, apiPath, { json, file, headers = {}, timeoutMs = 120_000 } = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(`/api${apiPath}`, getBase());
      const head = { "x-sub360": "1", ...headers };
      let body = null;
      if (json !== undefined) {
        body = Buffer.from(JSON.stringify(json), "utf8");
        head["content-type"] = "application/json";
        head["content-length"] = body.length;
      }
      if (file) head["content-length"] = file.size;
      const req = http.request(url, { method, headers: head, timeout: timeoutMs }, (res) => {
        const parts = [];
        res.on("data", (part) => parts.push(part));
        res.on("end", () => {
          let data = {};
          try { data = JSON.parse(Buffer.concat(parts).toString("utf8") || "{}"); } catch { /* not JSON */ }
          if (res.statusCode >= 400) {
            reject(new ToolError(data.error || `Sub360 ตอบ HTTP ${res.statusCode}`, { status: res.statusCode }));
          } else {
            resolve(data);
          }
        });
        res.on("error", reject);
      });
      req.on("timeout", () => req.destroy(new Error("Sub360 ไม่ตอบในเวลาที่กำหนด")));
      req.on("error", reject);
      if (file) {
        fs.createReadStream(file.path).on("error", (error) => req.destroy(error)).pipe(req);
      } else {
        req.end(body);
      }
    });
  }

  return {
    get: (apiPath) => request("GET", apiPath),
    post: (apiPath, json = {}) => request("POST", apiPath, { json }),
    put: (apiPath, json) => request("PUT", apiPath, { json }),
    patch: (apiPath, json) => request("PATCH", apiPath, { json }),
    /** Streams a video from disk into POST /api/projects (the same upload the window does). */
    upload: (file, headers) => request("POST", "/projects", { file, headers, timeoutMs: 30 * 60_000 }),
  };
}
