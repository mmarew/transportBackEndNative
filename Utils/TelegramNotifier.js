"use strict";

const fs = require("fs");
const path = require("path");

const logger = require("./logger");

const TELEGRAM_API = "https://api.telegram.org/bot";
const REQUEST_TIMEOUT_MS = 8000;
// eslint-disable-next-line no-magic-numbers -- 8MB cap for Telegram previews
const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

const ROLE_NAMES = {
  1: "Shipper",
  2: "Driver",
  3: "Admin",
  4: "Vehicle Owner",
  5: "System",
  6: "Super Admin",
  7: "Company Admin",
  8: "Company (Entity)",
  9: "Vehicle (Entity)",
  10: "Dispatcher",
  11: "Queue Org Admin",
};

const escapeMarkdownV2 = (value) => {
  const text = String(value ?? "");
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (char) => `\\${char}`);
};

const isConfigured = () => {
  const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const hasChatId = Boolean(process.env.TELEGRAM_CHAT_ID);
  const disabled = process.env.TELEGRAM_ALERTS_ENABLED === "false";
  return hasToken && hasChatId && !disabled;
};

const getApiBase = () => process.env.APP_API_URL || "{{url}}";

// Approval quick-guide tailored to the entity type so each alert only shows
// the relevant steps. Endpoints are wrapped in code spans so MarkdownV2 only
// needs backslash/backtick escaping inside them.
// kind: "user" (drivers/users) | "vehicle" | "company" | "queue" (queue org)
const buildApprovalBlock = ({ kind, ownerUniqueId } = {}) => {
  const base = getApiBase();
  const ownerId = ownerUniqueId || "{id}";

  if (kind === "queue") {
    return [
      "",
      "✅ *How to approve this queue organization:*",
      `• Register: \`POST ${base}/api/queueOrganization/\``,
      `• Approve: \`PATCH ${base}/api/queueOrganization/${ownerId}/approve\``,
      "  body: `{\"approvalStatus\":\"approved\"}`",
    ].join("\n");
  }

  if (kind === "company") {
    return [
      "",
      "✅ *How to approve this company:*",
      `• Docs: upload via \`POST ${base}/api/company/attachDocuments/${ownerId}\`, then \`PUT ${base}/api/admin/acceptRejectAttachedDocuments\``,
      "  body: `{\"attachedDocumentUniqueId\":\"...\",\"action\":\"ACCEPTED\"}`",
      `• Company: \`PATCH ${base}/api/company/companies/${ownerId}/approve\``,
      "  body: `{\"approvalStatus\":\"approved\"}`",
    ].join("\n");
  }

  const uploadPath =
    kind === "vehicle"
      ? `POST ${base}/api/vehicle/attachDocuments/${ownerId}`
      : `POST ${base}/api/user/attachDocuments/self`;

  return [
    "",
    "✅ *How to approve this document:*",
    `• Uploaded via: \`${uploadPath}\``,
    `• Approve: \`PUT ${base}/api/admin/acceptRejectAttachedDocuments\``,
    "  body: `{\"attachedDocumentUniqueId\":\"...\",\"action\":\"ACCEPTED\"}`",
  ].join("\n");
};

const sendTelegramMessage = async (text, { replyKeyboard } = {}) => {
  if (!isConfigured()) {
    logger.warn("Telegram notifier not configured — skipping message");
    return { ok: false, reason: "not-configured" };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const body = {
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    };
    if (replyKeyboard) {
      body.reply_markup = { inline_keyboard: replyKeyboard };
    }
    const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      logger.error("Telegram sendMessage failed", {
        httpStatus: response.status,
        telegramOk: payload?.ok,
        description: payload?.description,
      });
      return { ok: false, reason: "api-error" };
    }

    logger.info("Telegram message sent", { messageId: payload?.result?.message_id });
    return { ok: true };
  } catch (error) {
    logger.warn("Telegram sendMessage threw an error", {
      message: error?.message === "This operation was aborted" ? "request timed out" : error?.message,
    });
    return { ok: false, reason: "network-error" };
  } finally {
    clearTimeout(timeout);
  }
};

// Sends a local file as a Telegram document with a caption + inline buttons.
const sendTelegramDocument = async ({ relativePath, caption, replyKeyboard }) => {
  if (!isConfigured()) {
    logger.warn("Telegram notifier not configured — skipping document");
    return { ok: false, reason: "not-configured" };
  }

  const absPath = path.join(__dirname, "..", relativePath);
  let buffer;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is our own uploads dir
    buffer = await fs.promises.readFile(absPath);
  } catch (error) {
    logger.warn("Telegram preview file not readable", { relativePath, message: error?.message });
    return { ok: false, reason: "file-missing" };
  }
  if (buffer.length === 0 || buffer.length > MAX_PREVIEW_BYTES) {
    logger.warn("Telegram preview file skipped (size)", { relativePath, bytes: buffer.length });
    return { ok: false, reason: "file-too-large" };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const controller = new AbortController();
  // eslint-disable-next-line no-magic-numbers -- extra 4s for large file uploads
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS + 4000);

  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append("parse_mode", "MarkdownV2");
    if (replyKeyboard) {
      form.append("reply_markup", JSON.stringify({ inline_keyboard: replyKeyboard }));
    }
    form.append("document", new Blob([buffer]), path.basename(relativePath));

    const response = await fetch(`${TELEGRAM_API}${token}/sendDocument`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      logger.error("Telegram sendDocument failed", {
        httpStatus: response.status,
        telegramOk: payload?.ok,
        description: payload?.description,
      });
      return { ok: false, reason: "api-error" };
    }

    logger.info("Telegram document sent", { messageId: payload?.result?.message_id });
    return { ok: true };
  } catch (error) {
    logger.warn("Telegram sendDocument threw an error", {
      message: error?.message === "This operation was aborted" ? "request timed out" : error?.message,
    });
    return { ok: false, reason: "network-error" };
  } finally {
    clearTimeout(timeout);
  }
};

const approveKeyboard = (kind, id) => [
  [
    { text: "✅ Approve", callback_data: `approve:${kind}:${id}:approved` },
    { text: "❌ Reject", callback_data: `approve:${kind}:${id}:rejected` },
  ],
];

const docButtons = (docId) => [
  [
    { text: "✅ Approve", callback_data: `approve:doc:${docId}:ACCEPTED` },
    { text: "❌ Reject", callback_data: `approve:doc:${docId}:REJECTED` },
  ],
];

const sendCompanyCreatedAlert = async ({
  companyName,
  companyRegistrationNumber,
  companyPhone,
  companyEmail,
  companyAddress,
  companyUniqueId,
  creatorName,
  creatorPhone,
  creatorRoleId,
}) => {
  const roleName = ROLE_NAMES[creatorRoleId] || `Role #${creatorRoleId}`;
  const lines = [
    "🏢 *New company registered*",
    `🏷️ Name: ${escapeMarkdownV2(companyName ?? "—")}`,
    `📇 Registration \\#: ${escapeMarkdownV2(companyRegistrationNumber ?? "—")}`,
    `📞 Phone: ${escapeMarkdownV2(companyPhone ?? "—")}`,
    `📧 Email: ${escapeMarkdownV2(companyEmail ?? "—")}`,
    `📍 Address: ${escapeMarkdownV2(companyAddress ?? "—")}`,
    `🚦 Status: \`pending\` \\(needs approval\\)`,
    `🆔 companyUniqueId: \`${escapeMarkdownV2(companyUniqueId ?? "—")}\``,
    `👤 Created by: ${escapeMarkdownV2(creatorName ?? "—")} \\(${escapeMarkdownV2(roleName)}, ${escapeMarkdownV2(creatorPhone ?? "—")}\\)`,
  ];

  const text = [...lines, buildApprovalBlock({ kind: "company", ownerUniqueId: companyUniqueId })].join("\n");
  return sendTelegramMessage(text, { replyKeyboard: approveKeyboard("company", companyUniqueId) });
};

const sendDocumentUploadAlert = async ({
  ownerType,
  ownerUniqueId,
  uploadedByName,
  uploadedByPhone,
  uploadedByRoleId,
  files,
  docs,
}) => {
  const roleName = ROLE_NAMES[uploadedByRoleId] || `Role #${uploadedByRoleId}`;
  const approvalKind =
    ownerType === "company" ? "company" : ownerType === "vehicle" ? "vehicle" : "user";

  const header = [
    "📄 *Document\\(s\\) uploaded*",
    `👤 Uploaded by: ${escapeMarkdownV2(uploadedByName ?? "—")} \\(${escapeMarkdownV2(roleName)}, ${escapeMarkdownV2(uploadedByPhone ?? "—")}\\)`,
    `🏷️ Owner type: ${escapeMarkdownV2(ownerType ?? "—")}`,
    `🆔 Owner: \`${escapeMarkdownV2(ownerUniqueId ?? "—")}\``,
  ].join("\n");

  const docLines =
    (docs && docs.length > 0 ? docs : files || []).map((d) =>
      `• ${escapeMarkdownV2(d.fieldname || d)}${
        d.fieldname ? " — " + escapeMarkdownV2(d.originalFileName || "") : ""
      }`,
    );

  const text = [
    header,
    "📎 Files:",
    (docLines.length > 0 ? docLines : ["• (unspecified)"]).join("\n"),
    buildApprovalBlock({ kind: approvalKind, ownerUniqueId }),
  ].join("\n");

  const items = docs && docs.length > 0 ? docs : [{ previewPath: null }];

  for (const doc of items) {
    const buttons = doc.docId ? docButtons(doc.docId) : null;
    if (doc.previewPath) {
      await sendTelegramDocument({ relativePath: doc.previewPath, caption: text, replyKeyboard: buttons });
    } else {
      await sendTelegramMessage(text, { replyKeyboard: buttons });
    }
  }

  return { ok: true };
};

const sendQueueOrganizationCreatedAlert = async ({
  queueOrganizationName,
  queueOrganizationType,
  queueOrganizationPhone,
  queueOrganizationAddress,
  queueOrganizationUniqueId,
  creatorName,
  creatorPhone,
  creatorRoleId,
}) => {
  const roleName = ROLE_NAMES[creatorRoleId] || `Role #${creatorRoleId}`;
  const lines = [
    "🚦 *New queue organization registered*",
    `🏷️ Name: ${escapeMarkdownV2(queueOrganizationName ?? "—")}`,
    `🔤 Type: ${escapeMarkdownV2(queueOrganizationType ?? "—")}`,
    `📞 Phone: ${escapeMarkdownV2(queueOrganizationPhone ?? "—")}`,
    `📍 Address: ${escapeMarkdownV2(queueOrganizationAddress ?? "—")}`,
    `🚦 Status: \`pending\` \\(needs approval\\)`,
    `🆔 queueOrganizationUniqueId: \`${escapeMarkdownV2(queueOrganizationUniqueId ?? "—")}\``,
    `👤 Created by: ${escapeMarkdownV2(creatorName ?? "—")} \\(${escapeMarkdownV2(roleName)}, ${escapeMarkdownV2(creatorPhone ?? "—")}\\)`,
  ];

  const text = [
    ...lines,
    buildApprovalBlock({ kind: "queue", ownerUniqueId: queueOrganizationUniqueId }),
  ].join("\n");

  return sendTelegramMessage(text, { replyKeyboard: approveKeyboard("queue", queueOrganizationUniqueId) });
};

const sendRegistrationAlert = async ({
  fullName,
  phoneNumber,
  email,
  roleId,
  userCreatedAt,
  userUniqueId,
}) => {
  const roleName = ROLE_NAMES[roleId] || `Role #${roleId}`;
  const lines = [
    "🚚 *New user registered*",
    `👤 Name: ${escapeMarkdownV2(fullName || "—")}`,
    `📱 Phone: ${escapeMarkdownV2(phoneNumber || "—")}`,
    `🎭 Role: ${escapeMarkdownV2(roleName)}`,
    `🆔 userUniqueId: \`${escapeMarkdownV2(userUniqueId || "—")}\``,
  ];
  if (email) {
    lines.push(`📧 Email: ${escapeMarkdownV2(email)}`);
  }
  if (userCreatedAt) {
    lines.push(`📅 Time: ${escapeMarkdownV2(new Date(userCreatedAt).toLocaleString())}`);
  }

  return sendTelegramMessage(lines.join("\n"));
};

module.exports = {
  sendTelegramMessage,
  sendRegistrationAlert,
  sendCompanyCreatedAlert,
  sendDocumentUploadAlert,
  sendQueueOrganizationCreatedAlert,
};