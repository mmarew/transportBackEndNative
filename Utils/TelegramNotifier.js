"use strict";

const logger = require("./logger");

const TELEGRAM_API = "https://api.telegram.org/bot";
const REQUEST_TIMEOUT_MS = 8000;

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

// Approval quick-guide shared by every alert. Endpoints are wrapped in code
// spans so MarkdownV2 only needs backslash/backtick escaping inside them.
const buildApprovalBlock = ({ companyUniqueId, queueOrganizationUniqueId } = {}) => {
  const base = getApiBase();
  const companyId = companyUniqueId || "{companyUniqueId}";
  const queueOrgId = queueOrganizationUniqueId || "{queueOrganizationUniqueId}";
  return [
    "",
    "✅ *How to approve:*",
    `• Docs: upload via \`POST ${base}/api/user/attachDocuments/self\` \\(user/driver\\) or \`POST ${base}/api/company/attachDocuments/{companyUniqueId}\` \\(company\\)`,
    `• Then approve: \`PUT ${base}/api/admin/acceptRejectAttachedDocuments\``,
    "  body: `{\"attachedDocumentUniqueId\":\"...\",\"action\":\"ACCEPTED\"}`",
    `• Transport company: \`PATCH ${base}/api/company/companies/${companyId}/approve\``,
    "  body: `{\"approvalStatus\":\"approved\"}`",
    `• Queue org: register via \`POST ${base}/api/queueOrganization/\`, then approve \`PATCH ${base}/api/queueOrganization/${queueOrgId}/approve\``,
    "  body: `{\"approvalStatus\":\"approved\"}`",
  ].join("\n");
};

const sendTelegramMessage = async (text) => {
  if (!isConfigured()) {
    logger.warn("Telegram notifier not configured — skipping message");
    return { ok: false, reason: "not-configured" };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      }),
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

  return sendTelegramMessage(
    [...lines, buildApprovalBlock({ companyUniqueId })].join("\n"),
  );
};

const sendDocumentUploadAlert = async ({
  ownerType,
  ownerUniqueId,
  uploadedByName,
  uploadedByPhone,
  uploadedByRoleId,
  files,
}) => {
  const roleName = ROLE_NAMES[uploadedByRoleId] || `Role #${uploadedByRoleId}`;
  const fileList = Array.isArray(files) && files.length > 0
    ? files.map((f) => `• ${escapeMarkdownV2(f)}`).join("\n")
    : "• (unspecified)";

  const lines = [
    "📄 *Document\\(s\\) uploaded*",
    `👤 Uploaded by: ${escapeMarkdownV2(uploadedByName ?? "—")} \\(${escapeMarkdownV2(roleName)}, ${escapeMarkdownV2(uploadedByPhone ?? "—")}\\)`,
    `🏷️ Owner type: ${escapeMarkdownV2(ownerType ?? "—")}`,
    `🆔 Owner: \`${escapeMarkdownV2(ownerUniqueId ?? "—")}\``,
    "📎 Files:",
    fileList,
  ];

  return sendTelegramMessage(
    [...lines, buildApprovalBlock(ownerType === "company" ? { companyUniqueId: ownerUniqueId } : {})].join("\n"),
  );
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

  return sendTelegramMessage(
    [...lines, buildApprovalBlock({ queueOrganizationUniqueId })].join("\n"),
  );
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