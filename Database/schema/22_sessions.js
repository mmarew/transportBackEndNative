"use strict";

// server-side sessions
// Tables: UserSessions
//
// One row per successful login. The JWT carries `sid = sessionUniqueId`;
// VerifyToken refuses a token whose row is missing, revoked or expired. This is
// what makes logout (and "log out all devices") actually revoke access.
//
// Depends on Users(userUniqueId) and Roles(roleId), so this slice MUST stay
// after 01_core_identity in ./index.js.
module.exports = `

-- Create the UserSessions table (revocable server-side sessions)

CREATE TABLE IF NOT EXISTS UserSessions (
    sessionId INT AUTO_INCREMENT PRIMARY KEY,
    sessionUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID carried in the JWT as "sid"
    userUniqueId VARCHAR(36) NOT NULL,            -- FK -> Users
    roleId INT NOT NULL,                          -- FK -> Roles
    platform ENUM('ios','android','web','unknown') NOT NULL DEFAULT 'unknown',
    deviceName VARCHAR(128) NULL,                 -- e.g. "Pixel 9 Pro"
    deviceModel VARCHAR(128) NULL,
    appVersion VARCHAR(32) NULL,
    locale VARCHAR(16) NULL,
    ipAddress VARCHAR(45) NULL,                   -- IPv4 or IPv6
    userAgent VARCHAR(512) NULL,
    lastSeenAt DATETIME NULL,
    expiresAt DATETIME NOT NULL,                  -- mirrors the JWT "exp"
    revokedAt DATETIME NULL,                      -- NULL = still valid
    revokedReason VARCHAR(64) NULL,               -- logout | logout_all | admin_revoke | phone_change | expired
    sessionCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sessionUpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sessions_user (userUniqueId, revokedAt),
    INDEX idx_sessions_expires (expiresAt),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (roleId) REFERENCES Roles(roleId)
);`;
