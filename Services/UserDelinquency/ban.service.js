"use strict";

const {
  pool
} = require("../../Middleware/Database.config");
const {
  v4: uuidv4
} = require("uuid");

const {
  currentDate
} = require("../../Utils/CurrentDate");

const {
  transactionStorage
} = require("../../Utils/TransactionContext");

const checkAndApplyAutomaticBan = async (userUniqueId, roleId) => {
  // Calculate total points for this user with specific role (last 30 days)
  const pointsQuery = `
    SELECT SUM(delinquencyPoints) as totalPoints 
    FROM UserDelinquency 
    WHERE userUniqueId = ? 
    AND roleId = ?
    AND delinquencyCreatedAt >= DATE_SUB(?, INTERVAL 30 DAY)
    AND delinquencyDeletedAt IS NULL
  `;
  const [pointsResult] = await (transactionStorage.getStore() || pool).query(pointsQuery, [userUniqueId, roleId, currentDate()]);
  const totalPoints = pointsResult[0].totalPoints || 0;

  // Get user info
  const userQuery = `
    SELECT u.*, r.roleName 
    FROM Users u
    INNER JOIN Roles r ON r.roleId = ?
    WHERE u.userUniqueId = ?
  `;
  const [userInfo] = await (transactionStorage.getStore() || pool).query(userQuery, [roleId, userUniqueId]);
  if (userInfo.length === 0) {
    return {
      action: "none",
      reason: "User not found"
    };
  }

  // Define ban rules based on points (you can make this configurable)
  const banRules = [{
    threshold: 50,
    duration: 30,
    severity: "CRITICAL"
  }, {
    threshold: 35,
    duration: 7,
    severity: "HIGH"
  }, {
    threshold: 20,
    duration: 3,
    severity: "MEDIUM"
  }, {
    threshold: 10,
    duration: 1,
    severity: "LOW"
  }];
  const applicableRule = banRules.find(rule => totalPoints >= rule.threshold);
  if (!applicableRule) {
    return {
      action: "none",
      reason: "No ban threshold met",
      totalPoints
    };
  }

  // Check if already banned for this user-role combination
  const activeBanQuery = `
    SELECT b.banUniqueId FROM BannedUsers b
    WHERE b.userUniqueId = ?
    AND b.roleId = ?
    AND b.isActive = TRUE
    LIMIT 1
  `;
  const [activeBans] = await (transactionStorage.getStore() || pool).query(activeBanQuery, [userUniqueId, roleId]);
  if (activeBans.length > 0) {
    return {
      action: "none",
      reason: "User already banned for this role",
      totalPoints
    };
  }

  // Apply automatic ban
  const banUniqueId = uuidv4();
  const banAt = new Date();
  const banExpiresAt = new Date(banAt.getTime() + applicableRule.duration * 24 * 60 * 60 * 1000);
  const banSql = `
    INSERT INTO BannedUsers (
      banUniqueId, userUniqueId, roleId,
      bannedBy, banReason, banDurationDays, banAt, banExpiresAt, isActive
    ) VALUES (?, ?, ?, 'system', ?, ?, ?, ?, TRUE)
  `;
  const banValues = [banUniqueId, userUniqueId, roleId, `Automatic ban: ${totalPoints} points reached ${applicableRule.severity} threshold`, applicableRule.duration, banAt, banExpiresAt];
  await (transactionStorage.getStore() || pool).query(banSql, banValues);
  return {
    action: "banned",
    banDuration: applicableRule.duration,
    totalPoints,
    severityLevel: applicableRule.severity,
    banExpiresAt,
    banUniqueId
  };
};

const checkAutomaticBan = async (userUniqueId, roleId) => {
  const sql = `
    SELECT * FROM UserDelinquency 
    WHERE userUniqueId = ? 
    AND roleId = ?
    AND delinquencyCreatedAt >= DATE_SUB(?, INTERVAL 30 DAY)
  `;
  const [results] = await (transactionStorage.getStore() || pool).query(sql, [userUniqueId, roleId, currentDate()]);
  if (results.length === 0) {
    return {
      message: "success",
      data: "No delinquencies found for this user-role combination in the last 30 days"
    };
  }
  const totalPoints = results.reduce((acc, delinquency) => acc + delinquency.delinquencyPoints, 0);
  return {
    message: "success",
    data: {
      totalPoints,
      delinquencies: results
    }
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Get pending user delinquencies (no admin decision yet)
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  checkAndApplyAutomaticBan,
  checkAutomaticBan
};
