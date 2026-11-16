// mcp-remote.json — settings and OAuth records for AI apps that connect through the tunnel.
//
// Small and single-user, so one JSON file is enough. Codes and tokens are stored only as
// SHA-256 hashes; the Cloudflare tunnel token is a secret and lives in .env, not here.
// Ids come from the internet, so every lookup checks own properties only (no "__proto__" tricks).
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const EMPTY = () => ({ settings: { enabled: false, mode: "quick", hostname: "" }, clients: {}, grants: {}, tokens: {} });
const TOUCH_SAVE_MS = 60_000;
const UNUSED_CLIENT_MS = 3_600_000;

const own = (obj, key) => (Object.hasOwn(obj, String(key)) ? obj[key] : null);

export function createRemoteStore(file) {
  let data = EMPTY();
  try {
    const loaded = JSON.parse(fs.readFileSync(file, "utf8"));
    data = {
      linkKey: typeof loaded.linkKey === "string" ? loaded.linkKey : null,
      settings: { ...EMPTY().settings, ...loaded.settings },
      clients: Object.assign(Object.create(null), loaded.clients),
      grants: Object.assign(Object.create(null), loaded.grants),
      tokens: Object.assign(Object.create(null), loaded.tokens),
    };
  } catch {
    data.clients = Object.create(null);
    data.grants = Object.create(null);
    data.tokens = Object.create(null);
  }
  let lastTouchSave = 0;

  const usedClients = () => new Set(Object.values(data.grants).map((g) => g.clientId));

  function prune() {
    const now = Date.now();
    for (const [hash, t] of Object.entries(data.tokens)) {
      const grant = own(data.grants, t.grantId);
      if (t.expiresAt < now || !grant || grant.revokedAt) delete data.tokens[hash];
    }
    // Cancelled connections stay listed for a week, then go.
    for (const [id, g] of Object.entries(data.grants)) {
      if (g.revokedAt && g.revokedAt < now - 7 * 86_400_000) delete data.grants[id];
    }
    // Registered apps that never got a connection are dropped after an hour.
    const used = usedClients();
    for (const [id, c] of Object.entries(data.clients)) {
      if (!used.has(id) && c.createdAt < now - UNUSED_CLIENT_MS) delete data.clients[id];
    }
  }

  function save() {
    prune();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  return {
    /** Signing key for online file links; made once, replaced by resetLinkKey (every link stops working). */
    linkKey() {
      if (!data.linkKey) {
        data.linkKey = randomBytes(32).toString("base64url");
        save();
      }
      return data.linkKey;
    },
    resetLinkKey() {
      data.linkKey = randomBytes(32).toString("base64url");
      save();
    },
    settings: () => ({ ...data.settings }),
    setSettings(patch) {
      data.settings = { ...data.settings, ...patch };
      save();
      return { ...data.settings };
    },

    clientCount: () => Object.keys(data.clients).length,
    addClient(id, client) {
      data.clients[id] = { ...client, createdAt: Date.now() };
      save();
    },
    client: (id) => own(data.clients, id),
    /** Makes room for a new registration; false when every app has a connection. */
    dropOldestUnusedClient() {
      const used = usedClients();
      const oldest = Object.entries(data.clients).filter(([id]) => !used.has(id)).sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (!oldest) return false;
      delete data.clients[oldest[0]];
      return true;
    },

    addGrant(id, grant) {
      data.grants[id] = { ...grant, createdAt: Date.now(), lastUsedAt: null, revokedAt: null };
      save();
    },
    grant: (id) => own(data.grants, id),
    activeGrants: () => Object.entries(data.grants)
      .filter(([, g]) => !g.revokedAt)
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => b.createdAt - a.createdAt),
    revokeGrant(id) {
      const g = own(data.grants, id);
      if (!g || g.revokedAt) return false;
      g.revokedAt = Date.now();
      save();
      return true;
    },
    revokeAll() {
      for (const g of Object.values(data.grants)) if (!g.revokedAt) g.revokedAt = Date.now();
      save();
    },
    touchGrant(id) {
      const g = own(data.grants, id);
      if (!g) return;
      g.lastUsedAt = Date.now();
      if (Date.now() - lastTouchSave > TOUCH_SAVE_MS) {
        lastTouchSave = Date.now();
        save();
      }
    },

    addTokens(entries) {
      for (const [hash, rec] of entries) data.tokens[hash] = rec;
      save();
    },
    token: (hash) => own(data.tokens, hash),
    /**
     * Marks a refresh token as replaced. The grace period counts from the first rotation only, and the
     * old token is kept for watchMs so a later reuse is recognised (and cancels the connection).
     */
    rotate(hash, watchMs) {
      const t = own(data.tokens, hash);
      if (!t || t.rotatedAt) return;
      t.rotatedAt = Date.now();
      t.expiresAt = Math.min(t.expiresAt, Date.now() + watchMs);
      save();
    },
    dropToken(hash) {
      if (own(data.tokens, hash)) delete data.tokens[hash];
      save();
    },
  };
}
