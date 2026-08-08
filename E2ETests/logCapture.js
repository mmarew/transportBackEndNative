const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { runId } = require("./constants");

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
        const data = res.data;
        let msg = "";
        if (data && typeof data === "object") {
          msg =
            data.message ||
            (typeof data.error === "string" ? data.error : "") ||
            "";
        }
        writeFile(
          `[${stamp()}] [reqid=${reqId}] ${method} ${url} -> ${res.status}${msg ? ` (${msg})` : ""}\n`,
        );
        console.log(
          `  🔴 BACKEND ERROR [reqid=${reqId}] ${method} ${url} -> ${res.status}${msg ? ` (${msg})` : ""}`,
        );
      }
      return Promise.reject(error);
    },
  );
};

module.exports = { initLogCapture, logFile };
