// mcp-access.json — everything about AI apps controlling Sub360, in one small file.
//
//   enabled        master switch (off by default): off = no AI app may do anything
//   writeEnabled   off = AI apps may only read ("ดูได้อย่างเดียว")
//   remote         how cloud AI apps reach this computer: off | quick (Cloudflare button) | custom (your URL)
//   clients/grants/tokens   OAuth records; codes and tokens are stored only as SHA-256 hashes, and each
//                  grant remembers the internet address (issuer) it was made through
//   videoLinks     watch links handed to AI apps (hash → project, expiry)
//   activity       the last 50 things AI apps changed, shown in Settings
//
// Ids come from the internet, so every lookup checks own properties only (no "__proto__" tricks).
// v0.5.x kept a subset of this in mcp-remote.json; it is read once and migrated.
import fs from "node:fs";
import path from "node:path";

const TOUCH_SAVE_MS = 60_000;
const UNUSED_CLIENT_MS = 3_600_000;
const ACTIVITY_MAX = 50;
const VIDEO_LINKS_MAX = 200;

const own = (obj, key) => (Object.hasOwn(obj, String(key)) ? obj[key] : null);
const bag = (from) => Object.assign(Object.create(null), from || {});

const fresh = () => ({
  version: 2,
  enabled: false,
  writeEnabled: true,
  remote: { mode: "off", customUrl: null, lastPublicOrigin: null, notice: null },
  clients: bag(),
  grants: bag(),
  tokens: bag(),
  videoLinks: bag(),
  activity: [],
});

/** v0.5.x mcp-remote.json → v2. Anyone who had it had used the AI page, so MCP stays on for them. */
function migrate(old) {
  const data = fresh();
  const s = old.settings || {};
  data.enabled = true;
  if (s.enabled && s.mode === "named" && s.hostname) {
    data.remote = { ...data.remote, mode: "custom", customUrl: `https://${s.hostname}` };
  }
  data.clients = bag(old.clients);
  data.grants = bag(old.grants);
  data.tokens = bag(old.tokens);
  return data;
}

export function createAccessStore(home) {
  const file = path.join(home, "mcp-access.json");
  const legacy = path.join(home, "mcp-remote.json");
  let data = fresh();
  try {
    const loaded = JSON.parse(fs.readFileSync(file, "utf8"));
    data = {
      ...fresh(),
      enabled: loaded.enabled === true,
      writeEnabled: loaded.writeEnabled !== false,
      remote: { ...fresh().remote, ...loaded.remote },
      clients: bag(loaded.clients),
      grants: bag(loaded.grants),
      tokens: bag(loaded.tokens),
      videoLinks: bag(loaded.videoLinks),
      activity: Array.isArray(loaded.activity) ? loaded.activity.slice(0, ACTIVITY_MAX) : [],
    };
  } catch {
    try {
      data = migrate(JSON.parse(fs.readFileSync(legacy, "utf8")));
      save();
      fs.rmSync(legacy, { force: true });
    } catch { /* first run */ }
  }
  let lastTouchSave = 0;

  // function (hoisted): the migration above already saves through prune() before this line runs
  function usedClients() {
    return new Set(Object.values(data.grants).map((g) => g.clientId));
  }

  function prune() {
    const now = Date.now();
    for (const [hash, t] of Object.entries(data.tokens)) {
      const grant = own(data.grants, t.grantId);
      if (t.expiresAt < now || !grant || grant.revokedAt) delete data.tokens[hash];
    }
    for (const [id, g] of Object.entries(data.grants)) {
      if (g.revokedAt && g.revokedAt < now - 7 * 86_400_000) delete data.grants[id];
    }
    const used = usedClients();
    for (const [id, c] of Object.entries(data.clients)) {
      if (!used.has(id) && c.createdAt < now - UNUSED_CLIENT_MS) delete data.clients[id];
    }
    for (const [hash, link] of Object.entries(data.videoLinks)) if (link.expiresAt < now) delete data.videoLinks[hash];
  }

  function save() {
    prune();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  return {
    file,
    save,

    /* ---------- switches ---------- */
    get enabled() { return data.enabled; },
    setEnabled(on) { data.enabled = Boolean(on); save(); },
    get writeEnabled() { return data.writeEnabled; },
    setWriteEnabled(on) { data.writeEnabled = Boolean(on); save(); },

    /* ---------- internet access ---------- */
    get remote() { return { ...data.remote }; },
    setRemote(patch) { data.remote = { ...data.remote, ...patch }; save(); },

    /* ---------- OAuth ---------- */
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
    /** Revokes every active grant `test(grant, client)` picks; returns the app names that lost access. */
    retireGrants(test) {
      const apps = [];
      for (const g of Object.values(data.grants)) {
        if (g.revokedAt || !test(g, own(data.clients, g.clientId))) continue;
        g.revokedAt = Date.now();
        if (!apps.includes(g.clientName)) apps.push(g.clientName);
      }
      if (apps.length) save();
      return apps;
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

    /* ---------- watch links ---------- */
    addVideoLink(hash, link) {
      const list = Object.entries(data.videoLinks).sort((a, b) => a[1].createdAt - b[1].createdAt);
      while (list.length >= VIDEO_LINKS_MAX) delete data.videoLinks[list.shift()[0]];
      data.videoLinks[hash] = { ...link, createdAt: Date.now() };
      save();
    },
    videoLink(hash) {
      const link = own(data.videoLinks, hash);
      return link && link.expiresAt > Date.now() ? link : null;
    },
    videoLinkCount: () => Object.values(data.videoLinks).filter((l) => l.expiresAt > Date.now()).length,
    clearVideoLinks() { data.videoLinks = bag(); save(); },

    /* ---------- activity ---------- */
    addActivity(item) {
      data.activity = [{ at: Date.now(), ...item }, ...data.activity].slice(0, ACTIVITY_MAX);
      save();
    },
    activity: () => data.activity.slice(),
  };
}
