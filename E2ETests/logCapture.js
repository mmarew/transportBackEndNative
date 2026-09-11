const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { runId } = require("./constants");
const { matchExpect } = require("./Expect");

const logsDir = path.join(__dirname, "logs");

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

let logPath = "";
const logFile = () => {
  if (!logPath) {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    logPath = path.join(logsDir, `e2e_run_${runId}.log`);
  }
  return logPath;
};

const writeFile = (chunk) => {
  try {
    fs.appendFileSync(logFile(), chunk);
  } catch {
    // Never let logging break the test run
  }
};

const tee = (stream) => {
  const orig = stream.write.bind(stream);
  stream.write = (chunk, encoding, callback) => {
    let s = chunk;
    if (typeof chunk !== "string") {
      s = chunk.toString(encoding);
    }
    if (typeof s === "string") {
      const stamped = s
        .split("\n")
        .map((line, i) => (i === 0 ? `[${stamp()}] ${line}` : line))
        .join("\n");
      writeFile(stamped);
    } else {
      writeFile(s);
    }
    return orig(chunk, encoding, callback);
  };
};

// Rejections that no test declared up-front. Tracked (not failed) so the
// summary can surface how much negative traffic is still unlabelled — that is
// the backlog of probes worth converting to expectGuardRejection().
const probeStats = { expected: 0, undeclared4xx: 0, server5xx: 0 };

const serverMessage = (data) => {
  if (!data || typeof data !== "object") return "";
  return (
    (typeof data.message === "string" && data.message) ||
    (typeof data.error === "string" && data.error) ||
    (data.error && typeof data.error === "object" && data.error.message) ||
    ""
  );
};

const initLogCapture = () => {
  tee(process.stdout);
  tee(process.stderr);

  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const res = error.response;
      if (res) {
        const reqId = res.headers?.["x-request-id"] || "";
        const method = error.config?.method?.toUpperCase() || "?";
        const url = error.config?.url || "";
        const msg = serverMessage(res.data);
        // Consume the innermost declaration matching this rejection (status +
        // optional URL fragment), so concurrent probes cannot steal each other's
        // expectation.
        const expectation = matchExpect(res.status, url);

        if (expectation) {
          // Deliberate probe: the test declared this rejection up-front, so it
          // is evidence the guard works — never render it as a failure.
          probeStats.expected++;
          const line = `  🛡 EXPECTED ${res.status} [reqid=${reqId}] ${method} ${url} — ${expectation.label}${msg ? ` ("${msg}")` : ""}`;
          writeFile(`[${stamp()}]${line}\n`);
          console.log(line);
        } else if (res.status >= 500) {
          // 5xx is always a real server fault, declared or not.
          probeStats.server5xx++;
          const line = `  🔴 BACKEND ERROR [reqid=${reqId}] ${method} ${url} -> ${res.status}${msg ? ` ("${msg}")` : ""}`;
          writeFile(`[${stamp()}]${line}\n`);
          console.log(line);
        } else {
          // Undeclared 4xx: either a probe that has not been converted to
          // expectGuardRejection yet, or a genuine unexpected rejection that
          // the calling test must decide about. Show the server's reason.
          probeStats.undeclared4xx++;
          const line = `  🟡 BACKEND ${res.status} [reqid=${reqId}] ${method} ${url}${msg ? ` ("${msg}")` : ""}`;
          writeFile(`[${stamp()}]${line}\n`);
          console.log(line);
        }
      }
      return Promise.reject(error);
    },
  );
};

module.exports = { initLogCapture, logFile, probeStats };
