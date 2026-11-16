// mcp-runtime.json — how the stdio bridge finds the running Sub360 server.
//
// The server writes its port and a fresh random key when it starts listening; the bridge (started
// by an AI app with the same SUB360_HOME) reads it. The key keeps other users of the computer and
// web pages from calling /mcp; the file lives in the user's own app-data folder.
import fs from "node:fs";
import path from "node:path";

export const runtimeFile = (home) => path.join(home, "mcp-runtime.json");

export function writeRuntime(home, info) {
  const target = runtimeFile(home);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...info, writtenAt: new Date().toISOString() }, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, target);
}

export function readRuntime(home) {
  try {
    const info = JSON.parse(fs.readFileSync(runtimeFile(home), "utf8"));
    return info && info.url && info.key ? info : null;
  } catch {
    return null;
  }
}

/** Removes the file only when it still belongs to this process (another Sub360 may have replaced it). */
export function clearRuntime(home, pid = process.pid) {
  const info = readRuntime(home);
  if (info?.pid === pid) fs.rmSync(runtimeFile(home), { force: true });
}
