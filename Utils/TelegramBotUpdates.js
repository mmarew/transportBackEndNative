"use strict";

/**
 * Telegram bot long-polling loop.
 *
 * Picks up inline-keyboard callback_query updates (Approved / Rejected taps on
 * the alert messages) and performs the matching approval against the same
 * services used by the REST API, then removes the buttons and answers the tap.
 *
 * Only runs when Telegram is configured and TELEGRAM_POLLING isn't "false".
 * NOTE: run on a SINGLE process — running two pollers on the same bot token
 * makes getUpdates throw 409 (conflict), so do not enable under pm2 --cluster.
 */

const logger = require("./logger");
const { pool } = require("../Middleware/Database.config");
const { executeInTransaction } = require("./DatabaseTransaction");

const POLL_TIMEOUT_SECONDS = 25;
const API_TIMEOUT_MS = 30000;
const FALLBACK_SLEEP_MS = 1000;

const getToken = () => process.env.TELEGRAM_BOT_TOKEN;
const getChatId = () => process.env.TELEGRAM_CHAT_ID;

const isConfigured = () => Boolean(getToken()) && Boolean(getChatId());

let cachedSystemUserId = null;
const getSystemUserId = async () => {
  if (cachedSystemUserId) return cachedSystemUserId;
  const { SUPER_ADMIN } = require("./Config");
  const systemEmail = SUPER_ADMIN.SYSTEM_EMAIL || "system@system.com";
  try {
    const [rows] = await pool.query(
      "SELECT userUniqueId FROM Users WHERE email = ? LIMIT 1",
      [systemEmail],
    );
    cachedSystemUserId = rows[0]?.userUniqueId || "system";
  } catch (error) {
    logger.warn("Could not resolve system user for Telegram approvals", {
      message: error.message,
    });
    cachedSystemUserId = "system";
  }
  return cachedSystemUserId;
};

const fetchBot = async (method, payload, { raw = false } = {}) => {
  const response = await fetch(
    `https://api.telegram.org/bot${getToken()}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    },
  );
  if (raw) return response;
  return response.json();
};

const answer = async (callbackQueryId, text, showAlert = false) => {
  try {
    await fetchBot("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  } catch (error) {
    logger.warn("answerCallbackQuery failed", { message: error.message });
  }
};

const clearButtons = async (chatId, messageId) => {
  try {
    await fetchBot("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
  } catch (error) {
    logger.warn("clearButtons failed", { message: error.message });
  }
};

const handleCallbackQuery = async (callbackQuery) => {
  const chatId = callbackQuery?.message?.chat?.id;
  const messageId = callbackQuery?.message?.message_id;
  if (String(chatId) !== String(getChatId())) {
    await answer(callbackQuery.id, "Unauthorized chat", true);
    return;
  }

  const data = String(callbackQuery.data || "");
  const match = data.match(/^approve:(doc|company|queue):([a-f0-9-]{36}):([A-Za-z]+)$/);
  if (!match) {
    await answer(callbackQuery.id, "Unrecognized action", true);
    return;
  }

  const [, kind, id, action] = match;
  let resultText = "Done";

  try {
    if (kind === "doc") {
      const docsService = require("../Services/AttachedDocuments");
      const systemUserId = await getSystemUserId();
      await executeInTransaction(() =>
        docsService.acceptRejectAttachedDocuments({
          user: { userUniqueId: systemUserId },
          attachedDocumentUniqueId: id,
          action,
          reason:
            action === "ACCEPTED"
              ? "Approved via Telegram bot"
              : "Rejected via Telegram bot",
        }),
      );
      resultText = action === "ACCEPTED" ? "✅ Document approved" : "❌ Document rejected";
    } else if (kind === "company") {
      const companyService = require("../Services/TransportCompany.service");
      const userUniqueId = await getSystemUserId();
      await executeInTransaction(() =>
        companyService.approveCompany(
          id,
          action,
          "Decision via Telegram bot",
          userUniqueId,
        ),
      );
      resultText = action === "approved" ? "✅ Company approved" : "❌ Company rejected";
    } else {
      const queueService = require("../Services/QueueOrganization.service");
      const userUniqueId = await getSystemUserId();
      await executeInTransaction(() =>
        queueService.approveQueueOrganization(
          id,
          action,
          "Decision via Telegram bot",
          userUniqueId,
        ),
      );
      resultText =
        action === "approved" ? "✅ Queue organization approved" : "❌ Queue organization rejected";
    }

    await clearButtons(chatId, messageId);
  } catch (error) {
    resultText = `⚠️ ${error.message || "Approval failed"}`;
  }

  await answer(callbackQuery.id, resultText);
  logger.info("Telegram callback processed", { kind, action, resultText });
};

const pollOnce = async (offset) => {
  const response = await fetch(
    `https://api.telegram.org/bot${getToken()}/getUpdates` +
      `?offset=${offset}&timeout=${POLL_TIMEOUT_SECONDS}` +
      `&allowed_updates=${encodeURIComponent('["callback_query"]')}`,
    { signal: AbortSignal.timeout(API_TIMEOUT_MS) },
  );
  return response.json();
};

/**
 * Starts the long-polling loop. Returns a control object with .stop().
 */
const startTelegramBotPolling = () => {
  if (!isConfigured()) {
    logger.warn("Telegram bot polling skipped — token/chat not configured");
    return null;
  }
  if (process.env.TELEGRAM_POLLING === "false") {
    logger.info("Telegram bot polling disabled via TELEGRAM_POLLING=false");
    return null;
  }
  if (process.env.NODE_ENV === "test") {
    logger.info("Telegram bot polling skipped in test environment");
    return null;
  }

  let stopped = false;
  let offset = 0;

  const loop = async () => {
    while (!stopped) {
      try {
        const payload = await pollOnce(offset);
        for (const update of payload?.result || []) {
          offset = Math.max(offset, update.update_id + 1);
          if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
          }
        }
      } catch (error) {
        logger.warn("Telegram polling error", { message: error.message });
      }
      if (!stopped) {
        await new Promise((resolve) => setTimeout(resolve, FALLBACK_SLEEP_MS));
      }
    }
  };

  loop();
  logger.info("Telegram bot polling started (callback-query approvals)");
  return {
    stop: () => {
      stopped = true;
      logger.info("Telegram bot polling stopped");
    },
  };
};

module.exports = { startTelegramBotPolling, handleCallbackQuery };