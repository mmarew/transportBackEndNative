/**
 * DevTools Controller
 * Dev-only endpoints for testing. Only active when NODE_ENV !== 'production'.
 */
const { pool } = require("../Middleware/Database.config");
const { createAttachedDocument } = require("../Services/AttachedDocuments");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");

/**
 * GET /api/admin/dev/getUserOtp?phoneNumber=xxx
 * Returns the latest OTP for a phone number (dev/test use only).
 */
const getUserOtp = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ message: "error", error: "Not available in production" });
    }

    const { phoneNumber } = req.query;
    if (!phoneNumber) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: "error", error: "phoneNumber query param is required" });
    }

    const [rows] = await pool.query(
      `SELECT u.userUniqueId, u.phoneNumber
       FROM usersCredential uc
       JOIN Users u ON u.userUniqueId = uc.userUniqueId
       WHERE u.phoneNumber = ?
       ORDER BY uc.usersCredentialCreatedAt DESC
       LIMIT 1`,
      [phoneNumber],
    );

    if (!rows || rows.length === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: "error", error: "No OTP found for this phone number" });
    }

    return res.status(HTTP_STATUS.OK).json({ message: "success", data: rows[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/dev/seedTestDocument
 * Inserts a document record directly into the DB (bypasses FTP) for testing.
 * Body: { userUniqueId, documentTypeId, roleId, documentExpirationDate? }
 */
const seedTestDocument = async (req, res, next) => {
  try {
    const { userUniqueId, documentTypeId, roleId, documentExpirationDate } = req.body;
    if (!userUniqueId || !documentTypeId || !roleId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: "error", error: "userUniqueId, documentTypeId and roleId are required" });
    }

    const result = await executeInTransaction(async () => {
      return await createAttachedDocument({
        userUniqueId,
        documentTypeId,
        roleId,
        attachedDocumentName     : "https://test.example.com/e2e-placeholder.png",
        attachedDocumentDescription: "E2E test document (bypassed FTP)",
        documentExpirationDate   : documentExpirationDate || null,
        attachedDocumentFileNumber: `E2E-${Date.now()}`,
      });
    });

    return res.status(HTTP_STATUS.OK).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { getUserOtp, seedTestDocument };
