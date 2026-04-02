const adminServices = require("../Services/Admin.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const fs = require("fs");
const path = require("path");
const Config = require("../Utils/Config");

const AdminController = {
  // Fetch online drivers

  getOfflineDrivers: async (req, res, next) => {
    try {
      const result = await adminServices.getOfflineDrivers(req);
      ServerResponder(res, result);
    } catch (error) {
      next(error);
    }
  },

  getOnlineDrivers: async (req, res, next) => {
    try {
      const result = await adminServices.getOnlineDrivers(req);
      ServerResponder(res, result);
    } catch (error) {
      next(error);
    }
  },

  getAllActiveDrivers: async (req, res, next) => {
    try {
      const result = await adminServices.getAllActiveDrivers(req);
      ServerResponder(res, result);
    } catch (error) {
      next(error);
    }
  },

  getUnAuthorizedDriver: async (req, res, next) => {
    try {
      ServerResponder(
        res,
        await adminServices.getUnauthorizedDriver(req?.query),
      );
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/system/logs?secret=YOUR_SECRET_KEY&type=error|combined
   * Returns the last 500 lines of the system logs as HTML.
   */
  getSystemLogs: async (req, res, next) => {
    try {
      const { secret, type = "error" } = req.query;

      // 1. Security Check
      if (secret !== Config.SECRET_KEY) {
        return res.status(401).send(`
          <html>
            <body style="font-family: sans-serif; background: #f8d7da; padding: 20px; color: #721c24;">
              <h1>Unauthorized</h1>
              <p>Invalid or missing secret key. Access denied.</p>
            </body>
          </html>
        `);
      }

      // 2. Resolve Log Path
      const filename = type === "error" ? "error.log" : "combined.log";
      const logFilePath = path.join(__dirname, "../logs", filename);

      if (!fs.existsSync(logFilePath)) {
        return res.status(404).send(`
          <html>
            <body style="font-family: sans-serif; background: #e2e3e5; padding: 20px; color: #383d41;">
              <h1>Not Found</h1>
              <p>The log file <code>${filename}</code> does not exist or has no entries yet.</p>
            </body>
          </html>
        `);
      }

      // 3. Read Last 500 Lines
      const data = fs.readFileSync(logFilePath, "utf8");
      const lines = data.split("\n").filter((l) => l.trim().length > 0);
      const lastLines = lines.slice(-500).reverse();

      // 4. Return as HTML
      return res.status(200).send(`
        <html>
          <head>
            <title>System Logs: ${filename}</title>
            <style>
              body { font-family: 'Courier New', Courier, monospace; background: #1e1e1e; color: #d4d4d4; padding: 20px; line-height: 1.5; }
              .header { background: #333; padding: 15px; margin-bottom: 20px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center; }
              .log-entry { white-space: pre-wrap; word-break: break-all; border-bottom: 1px solid #333; padding: 5px 0; font-size: 13px; }
              .log-entry:hover { background: #252525; }
              a { color: #569cd6; text-decoration: none; font-weight: bold; margin-left: 15px; }
              .error { color: #f44747; }
              .warn { color: #cca700; }
              .info { color: #4fc1ff; }
            </style>
          </head>
          <body>
            <div class="header">
              <span style="font-size: 18px;">📜 System Logs: <strong>${filename}</strong></span>
              <span>
                <a href="?secret=${secret}&type=error">Errors</a>
                <a href="?secret=${secret}&type=combined">Combined</a>
                <a href="/api/admin/system/uploads?secret=${secret}">📁 View Uploads</a>
              </span>
            </div>
            ${lastLines
    .map((line) => {
      let colorClass = "";
      if (line.includes('"level":"error"')) {colorClass = "error";}
      if (line.includes('"level":"warn"')) {colorClass = "warn";}
      if (line.includes('"level":"info"')) {colorClass = "info";}
      return `<div class="log-entry ${colorClass}">${line
        .replace(/>/g, "&gt;")
        .replace(/</g, "&lt;")}</div>`;
    })
    .join("")}
          </body>
        </html>
      `);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/system/uploads?secret=YOUR_SECRET_KEY
   * Returns a list of uploaded files with links to view them.
   */
  getUploadedFiles: async (req, res, next) => {
    try {
      const { secret } = req.query;

      // 1. Security Check
      if (secret !== Config.SECRET_KEY) {
        return res.status(401).send("<h1>Unauthorized</h1>");
      }

      // 2. Resolve Uploads Path
      const uploadsDir = path.join(__dirname, "../uploads");

      if (!fs.existsSync(uploadsDir)) {
        return res.status(404).send("<h1>Uploads directory not found</h1>");
      }

      // 3. Read Files
      const files = fs.readdirSync(uploadsDir);
      const fileInfos = files
        .filter((f) => f !== ".gitkeep") // Exclude gitkeep
        .map((file) => {
          const stats = fs.statSync(path.join(uploadsDir, file));
          return {
            name: file,
            size: (stats.size / 1024).toFixed(2) + " KB",
            mtime: stats.mtime,
            url: `${Config.APP_API_URL}/uploads/${file}`,
          };
        })
        .sort((a, b) => b.mtime - a.mtime); // Newest first

      // 4. Return as HTML
      return res.status(200).send(`
        <html>
          <head>
            <title>User Uploads</title>
            <style>
              body { font-family: -apple-system, system-ui, sans-serif; background: #f4f7f6; color: #333; padding: 40px; }
              .card { max-width: 900px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
              .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 15px; margin-bottom: 20px; }
              .file-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
              .file-row:last-child { border-bottom: none; }
              .file-name { font-weight: bold; color: #2c3e50; text-decoration: none; }
              .file-meta { font-size: 12px; color: #95a5a6; margin-top: 4px; }
              .btn { padding: 5px 12px; background: #3498db; color: #fff; border-radius: 4px; text-decoration: none; font-size: 13px; }
              .link { font-size: 14px; color: #7f8c8d; text-decoration: none; margin-left: 15px; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <h2 style="margin:0;">📁 User Uploads</h2>
                <div>
                  <a href="/api/admin/system/logs?secret=${secret}" class="link">📜 Logs</a>
                </div>
              </div>
              ${fileInfos
    .map(
      (f) => `
                <div class="file-row">
                  <div>
                    <a href="${f.url}" target="_blank" class="file-name">${
  f.name
}</a>
                    <div class="file-meta">Size: ${
  f.size
} | Uploaded: ${f.mtime.toLocaleString()}</div>
                  </div>
                  <a href="${f.url}" target="_blank" class="btn">View</a>
                </div>
              `,
    )
    .join("")}
              ${
  fileInfos.length === 0
    ? '<p style="text-align:center; color:#95a5a6;">No files uploaded yet.</p>'
    : ""
}
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      next(error);
    }
  },
};

module.exports = AdminController;
