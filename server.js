/**
 * Taelor — Garment Management Backend
 * Serves the website and persists business data to data.json
 */
const express = require("express");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data.json");

const defaultState = () => ({
  users: [],
  goods: [],
  revenue: [],
  loans: [],
  workers: [],
  payroll: [],
  targets: [],
  attendance: [],
  workerProfiles: {},
});

function readState() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = defaultState();
      writeState(initial);
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw.trim()) return defaultState();
    const parsed = JSON.parse(raw);
    // Merge defaults; drop legacy shared "session" field
    const { session: _ignored, ...rest } = parsed;
    return { ...defaultState(), ...rest };
  } catch (err) {
    console.error("Failed to read data.json:", err.message);
    return defaultState();
  }
}

function writeState(state) {
  const payload = {
    ...defaultState(),
    ...state,
  };
  // Never persist a shared login session in the file
  delete payload.session;

  const json = JSON.stringify(payload, null, 2);
  try {
    // Direct write is more reliable on OneDrive than renameSync
    fs.writeFileSync(DATA_FILE, json, "utf8");
  } catch (err) {
    console.error("Failed to write data.json:", err.message);
    throw err;
  }
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const app = express();
app.use(express.json({ limit: "2mb" }));

// Avoid caching API responses while developing
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

/* ——— API ——— */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "Taelor", time: new Date().toISOString() });
});

app.get("/api/state", (_req, res) => {
  try {
    const state = readState();
    // Do not send passwords to the browser
    res.json({
      ...state,
      users: (state.users || []).map(publicUser),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/state", (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid state payload" });
    }

    const current = readState();
    const incoming = req.body;

    // Keep real users/passwords on the server; accept other collections from client
    const next = {
      ...defaultState(),
      users: current.users,
      goods: Array.isArray(incoming.goods) ? incoming.goods : current.goods,
      revenue: Array.isArray(incoming.revenue) ? incoming.revenue : current.revenue,
      loans: Array.isArray(incoming.loans) ? incoming.loans : current.loans,
      workers: Array.isArray(incoming.workers) ? incoming.workers : current.workers,
      payroll: Array.isArray(incoming.payroll) ? incoming.payroll : current.payroll,
      targets: Array.isArray(incoming.targets) ? incoming.targets : current.targets,
      attendance: Array.isArray(incoming.attendance) ? incoming.attendance : current.attendance,
      workerProfiles:
        incoming.workerProfiles && typeof incoming.workerProfiles === "object"
          ? incoming.workerProfiles
          : current.workerProfiles,
    };

    writeState(next);
    res.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/state failed:", err.message);
    res.status(500).json({ error: "Could not save data: " + err.message });
  }
});

app.post("/api/auth/signup", (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters." });
    }

    const state = readState();
    const normalized = String(email).trim().toLowerCase();
    if (state.users.some((u) => u.email === normalized)) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const user = {
      id: uid(),
      name: String(name).trim(),
      email: normalized,
      password: String(password),
      role: role === "worker" ? "worker" : "management",
    };
    state.users.push(user);
    writeState(state);

    res.status(201).json({
      ok: true,
      user: publicUser(user),
      session: { email: user.email, name: user.name, preferredRole: user.role },
    });
  } catch (err) {
    console.error("Signup failed:", err.message);
    res.status(500).json({ error: "Signup failed: " + err.message });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body || {};
    const state = readState();
    const normalized = String(email || "").trim().toLowerCase();
    const user = state.users.find(
      (u) => u.email === normalized && u.password === String(password || "")
    );
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    res.json({
      ok: true,
      user: publicUser(user),
      session: { email: user.email, name: user.name, preferredRole: user.role },
    });
  } catch (err) {
    console.error("Login failed:", err.message);
    res.status(500).json({ error: "Login failed: " + err.message });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  // Session lives in the browser only — nothing to clear server-side
  res.json({ ok: true });
});

/* ——— Static site (do not expose data.json / server files) ——— */
app.use(
  express.static(ROOT, {
    index: "index.html",
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html") || filePath.endsWith(".js") || filePath.endsWith(".css")) {
        res.set("Cache-Control", "no-cache");
      }
    },
  })
);

// Block direct access to sensitive files
app.get(["/data.json", "/data.json.tmp", "/server.js", "/package.json", "/package-lock.json"], (_req, res) => {
  res.status(404).end();
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(ROOT, "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Server error" });
});

app.listen(PORT, () => {
  console.log("");
  console.log("  Taelor garment management");
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  Data file: ${DATA_FILE}`);
  console.log("  Open that URL in your browser (do not open index.html as a file).");
  console.log("");
});
