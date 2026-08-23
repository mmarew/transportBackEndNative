"use strict";

/**
 * Middleware to block common vulnerability scanner and bot paths.
 *
 * These paths are routinely probed by automated scanners looking for
 * WordPress, .env files, PHPMyAdmin, etc. They have no business hitting
 * a Node.js API. Blocking them early reduces log noise and attack surface.
 */

const BLOCKED_PATHS = [
  // WordPress
  /^\/wp-admin/i,
  /^\/wp-login/i,
  /^\/wp-content/i,
  /^\/wp-includes/i,
  /^\/xmlrpc\.php$/i,

  // PHP / Laravel / general
  /^\/\.env$/i,
  /^\/\.env\.backup$/i,
  /^\/\.env\.local$/i,
  /^\/\.env\.production$/i,
  /^\/vendor\/phpunit/i,
  /^\/phpinfo\.php$/i,

  // PHPMyAdmin
  /^\/phpmyadmin/i,
  /^\/pma/i,
  /^\/myadmin/i,

  // Git / config leaks
  /^\/\.git/i,
  /^\/\.svn/i,
  /^\/\.htaccess$/i,
  /^\/\.htpasswd$/i,

  // Server-status probes
  /^\/server-status/i,
  /^\/server-info/i,
  /^\/.well-known\/security/i,

  // Common exploit paths
  /^\/cgi-bin/i,
  /^\/admin\.php$/i,
  /^\/login\.php$/i,
  /^\/config\.php$/i,
  /^\/setup\.php$/i,
  /^\/install\.php$/i,
];

const logger = require("../Utils/logger");

const scannerBlock = (req, res, next) => {
  const path = req.originalUrl || req.url;

  // Strip query string for path matching
  const basePath = path.split("?")[0];

  for (const pattern of BLOCKED_PATHS) {
    if (pattern.test(basePath)) {
      logger.warn("Blocked scanner probe", {
        path: basePath,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      const NOT_FOUND = 404;
      return res.status(NOT_FOUND).json({ message: "Not found" });
    }
  }

  next();
};

module.exports = scannerBlock;
