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
      const result = await executeInTransaction(async () => {
        return await adminServices.getOfflineDrivers(req);
      });
      ServerResponder(res, result);
    } catch (error) {
      next(error);
    }
  },

  getOnlineDrivers: async (req, res, next) => {
    try {
      const result = await executeInTransaction(async () => {
        return await adminServices.getOnlineDrivers(req);
      });
      ServerResponder(res, result);
    } catch (error) {
      next(error);
    }
  },

  getAllActiveDrivers: async (req, res, next) => {
    try {
      const result = await executeInTransaction(async () => {
        return await adminServices.getAllActiveDrivers(req);
      });
      ServerResponder(res, result);
    } catch (error) {
      next(error);
    }
  },

  getUnAuthorizedDriver: async (req, res, next) => {
    try {
      ServerResponder(
        res,
        await executeInTransaction(async () => {
          return await adminServices.getUnauthorizedDriver(req?.query);
        }),
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

      // 3. Read Last 500 Lines (Efficiently for large files)
      const data = fs.readFileSync(logFilePath, "utf8");
      const lines = data.split("\n");
      const lastLines = lines.slice(-500).reverse().join("\n");

      // 4. Return as HTML
      return res.status(200).send(`
        <html>
          <head>
            <title>System Logs: ${filename}</title>
            <style>
              body { font-family: 'Courier New', Courier, monospace; background: #1e1e1e; color: #d4d4d4; padding: 20px; line-height: 1.5; }
              .header { background: #333; padding: 10px; margin-bottom: 20px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center; }
              .log-entry { white-space: pre-wrap; word-break: break-all; border-bottom: 1px solid #333; padding: 5px 0; }
              a { color: #569cd6; text-decoration: none; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <span>Showing last 500 lines of <strong>${filename}</strong></span>
              <span>
                <a href="?secret=${secret}&type=error">Error Logs</a> | 
                <a href="?secret=${secret}&type=combined">Combined Logs</a>
              </span>
            </div>
            <div class="log-entry">${lastLines.replace(/>/g, "&gt;").replace(/</g, "&lt;")}</div>
          </body>
        </html>
      `);
    } catch (error) {
      next(error);
    }
  },
};

module.exports = AdminController;
