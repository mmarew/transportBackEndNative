/*
 * compare-logs.js
 *
 * Correlates an E2E run log with the backend error log to produce a "cause map":
 * for every backend error it finds the E2E request that triggered it, and vice
 * versa. Join key is X-Request-Id (echoed by the backend as the X-Request-Id
 * response header), with a timestamp+URL fallback for lines missing it.
 *
 * Usage:
 *   node scripts/compare-logs.js [e2eLog] [backendErrorLog]
 *
 * Defaults:
 *   e2eLog         -> latest E2ETests/logs/e2e_run_*.log
 *   backendErrorLog-> logs/error.log
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");

const pickLatest = (dir, prefix) => {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".log"))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? path.join(dir, files[0].name) : null;
};

const e2eLogPath =
  process.argv[2] || pickLatest(path.join(ROOT, "E2ETests", "logs"), "e2e_run_");
const backendLogPath =
  process.argv[3] || path.join(ROOT, "logs", "error.log");

if (!e2eLogPath || !fs.existsSync(e2eLogPath)) {
  console.error("E2E log not found. Run the suite first or pass a path.");
  process.exit(1);
}
if (!fs.existsSync(backendLogPath)) {
  console.error(`Backend error log not found: ${backendLogPath}`);
  process.exit(1);
}

const hmsToSec = (h, m, s) => h * 3600 + m * 60 + s;

const parseBackendLog = () => {
  const entries = [];
  for (const line of fs.readFileSync(backendLogPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.level !== "error") continue;
    const t = obj.timestamp || "";
    const m = t.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    let sec = null;
    if (m) {
      const [date, h, mi, s] = [m[1], Number(m[2]), Number(m[3]), Number(m[4])];
      sec = hmsToSec(h, mi, s);
      obj.date = date;
    }
    obj.sec = sec;
    const stack = obj.stack || "";
    const tail = stack
      .split("\n")
      .filter((l) => l.includes("(") && l.includes(".js"))
      .slice(0, 3)
      .join(" | ");
    obj.stackTail = tail;
    entries.push(obj);
  }
  return entries;
};

const parseE2ELog = () => {
  const lines = [];
  for (const raw of fs.readFileSync(e2eLogPath, "utf8").split("\n")) {
    const m = raw.match(/^\[(\d{2}):(\d{2}):(\d{2})\]/);
    let sec = null;
    let text = raw;
    if (m) {
      sec = hmsToSec(Number(m[1]), Number(m[2]), Number(m[3]));
      text = raw.slice(m[0].length).trim();
    }
    lines.push({ sec, text });
  }
  return lines;
};

const main = async () => {
  const be = parseBackendLog();
  const e2e = parseE2ELog();

  // --- E2E request lines that recorded a backend error (have reqid) ---
  const e2eReqErrors = [];
  for (const l of e2e) {
    const m = l.text.match(/\[reqid=([^\]]+)\] (\S+) (\S+) -> (\d{3})(?: \((.*)\))?\s*$/);
    if (m) {
      e2eReqErrors.push({
        sec: l.sec,
        reqid: m[1],
        method: m[2],
        url: m[3],
        status: Number(m[4]),
        msg: m[5] || "",
      });
    }
  }

  // --- E2E fail/skip/error lines ---
  const e2eNotable = e2e.filter(
    (l) => l.text.includes("❌") || l.text.includes("⚠️") || l.text.includes("⏩"),
  );

  // --- Join backend errors to E2E requests by requestId ---
  const beByReqid = new Map();
  for (const b of be) {
    if (b.requestId) beByReqid.set(b.requestId, b);
  }

  const matched = [];
  const unmatchedBE = new Set(be.map((_, i) => i));
  for (const r of e2eReqErrors) {
    const b = r.reqid ? beByReqid.get(r.reqid) : null;
    if (b) {
      matched.push({ ...r, backend: b, beIndex: be.indexOf(b) });
      unmatchedBE.delete(be.indexOf(b));
    } else {
      matched.push({ ...r, backend: null });
    }
  }

  const urlPath = (u) => {
    try {
      return new URL(u).pathname;
    } catch {
      return u.split("?")[0];
    }
  };

  const findBackendByWindow = (sec, text) => {
    const pathMatch = text.match(/\/api\/[^\s:,]+/);
    const candidates = be.filter(
      (b) =>
        b.sec !== null &&
        sec !== null &&
        Math.abs(b.sec - sec) <= 5,
    );
    if (pathMatch) {
      const p = pathMatch[0].split("?")[0];
      const exact = candidates.find(
        (b) => b.path && b.path.startsWith(p),
      );
      if (exact) return exact;
      // Last resort: match by path anywhere, even if timestamps drifted
      return be.find((b) => b.path && b.path.startsWith(p)) || null;
    }
    return candidates[candidates.length - 1] || null;
  };

  console.log("=".repeat(78));
  console.log("E2E  ->  BACKEND  CAUSE MAP");
  console.log("e2e log :", e2eLogPath);
  console.log("be   log:", backendLogPath);
  console.log("backend errors parsed:", be.length);
  console.log("e2e backend-error lines:", e2eReqErrors.length);
  console.log("matched by requestId:", matched.filter((m) => m.backend).length);
  console.log("=".repeat(78));

  if (matched.length) {
    console.log("\n### 1. BACKEND ERRORS TRIGGERED BY E2E CALLS\n");
    for (const m of matched) {
      const tag = m.backend ? "MATCHED" : "NO BACKEND MATCH";
      console.log(`  ${m.method} ${urlPath(m.url)} -> ${m.status}  [${tag}]`);
      if (m.backend) {
        const b = m.backend;
        console.log(`      backend: ${b.message || ""} (${b.type || "error"})`);
        if (b.statusCode) console.log(`      statusCode: ${b.statusCode}`);
        if (b.code) console.log(`      code: ${b.code}`);
        if (b.sqlState) console.log(`      sqlState: ${b.sqlState}`);
        if (b.stackTail) console.log(`      stack: ${b.stackTail}`);
      } else {
        console.log(`      e2e msg: ${m.msg || "(none)"}`);
      }
    }
  } else {
    console.log("\n### 1. No backend-error lines found in the E2E log.\n");
  }

  const notableWithCause = e2eNotable.map((l) => {
    const b = findBackendByWindow(l.sec, l.text);
    return { ...l, backend: b };
  });
  const notableCount = notableWithCause.length;

  if (notableCount) {
    console.log("\n### 2. E2E ❌ / ⚠️ / ⏩ LINES\n");
    for (const l of notableWithCause) {
      console.log(
        `  [${l.text.slice(0, 130)}]${l.backend ? `  -> backend: ${l.backend.message || "HTTP " + l.backend.statusCode}` : ""}`,
      );
    }
  }

  const unmatchedList = [...unmatchedBE].map((i) => be[i]).filter((b) => b !== undefined);
  if (unmatchedList.length) {
    console.log("\n### 3. BACKEND ERRORS WITH NO E2E MATCH (silent backend issues)\n");
    for (const b of unmatchedList) {
      console.log(
        `  ${b.method || "?"} ${b.path || "?"} (${b.statusCode || "?"}) ${b.message || ""}`,
      );
      if (b.code) console.log(`      code: ${b.code}`);
      if (b.stackTail) console.log(`      stack: ${b.stackTail}`);
    }
  } else {
    console.log("\n### 3. Every backend error has a matching E2E request.\n");
  }

  const noBackend = matched.filter((m) => !m.backend);
  if (noBackend.length) {
    console.log("\n### 4. E2E ERRORS WITH NO BACKEND MATCH (test-side / wrong URL)\n");
    for (const m of noBackend) {
      console.log(`  ${m.method} ${urlPath(m.url)} -> ${m.status}  (${m.msg || ""})`);
    }
  }

  console.log("\n" + "=".repeat(78));
  console.log(`Done. Backend=${be.length}  E2EbackendLines=${e2eReqErrors.length}  E2Enotable=${notableCount}`);
  console.log("=".repeat(78));
};

main().catch((e) => {
  console.error("compare-logs failed:", e.message);
  process.exit(1);
});
