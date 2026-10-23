"use strict";

/**
 * Session cleanup service.
 *
 * Expired and revoked `UserSessions` rows are kept for a retention window so
 * support can answer "which device was signed out and when", and are then
 * deleted. Run once shortly after boot and daily afterwards.
 */

const logger = require("../../Utils/logger");
const { currentDate } = require("../../Utils/CurrentDate");
const {
  cleanupSessions,
  DEFAULT_RETENTION_DAYS,
} = require("../../Utils/SessionRegistry");

const DEFAULT_INTERVAL_SECONDS = 24 * 60 * 60; // one day
const BOOT_DELAY_SECONDS = 30;

/**
 * Starts the periodic cleanup.
 *
 * @param {object} [options]
 * @param {number} [options.intervalSeconds] - delay between runs
 * @param {number} [options.retentionDays] - how long to keep dead rows
 * @param {boolean} [options.runImmediately] - run once after a short boot delay
 * @returns {{stop: Function, intervalId: NodeJS.Timeout, cleanupNow: Function}}
 */
const startSessionCleanupService = (options = {}) => {
  const {
    intervalSeconds = DEFAULT_INTERVAL_SECONDS,
    retentionDays = DEFAULT_RETENTION_DAYS,
    runImmediately = true,
  } = options;

  logger.info("Starting Session Cleanup Service", {
    intervalSeconds,
    retentionDays,
    runImmediately,
    timestamp: currentDate(),
  });

  const runCleanup = async (trigger) => {
    try {
      const deleted = await cleanupSessions({ retentionDays });
      logger.info("Session cleanup completed", {
        trigger,
        deleted,
        retentionDays,
        timestamp: currentDate(),
      });
      return deleted;
    } catch (error) {
      logger.error("Session cleanup failed", {
        trigger,
        error: error.message,
      });
      return 0;
    }
  };

  let bootTimer;
  if (runImmediately) {
    // Small delay so the schema/table creation and pool warm-up finish first.
    bootTimer = setTimeout(() => {
      runCleanup("startup");
    }, BOOT_DELAY_SECONDS * 1000);
    if (typeof bootTimer.unref === "function") bootTimer.unref();
  }

  const intervalId = setInterval(() => {
    runCleanup("scheduled");
  }, intervalSeconds * 1000);
  // Never keep the process alive just for cleanup.
  if (typeof intervalId.unref === "function") intervalId.unref();

  return {
    stop: () => {
      if (bootTimer) clearTimeout(bootTimer);
      clearInterval(intervalId);
      logger.info("Session Cleanup Service stopped", {
        timestamp: currentDate(),
      });
    },
    intervalId,
    cleanupNow: () => runCleanup("manual"),
  };
};

module.exports = {
  startSessionCleanupService,
  DEFAULT_INTERVAL_SECONDS,
  BOOT_DELAY_SECONDS,
};
