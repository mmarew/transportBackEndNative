"use strict";

const {
  getData
} = require("../../CRUD/Read/ReadData");

const {
  pool
} = require("../../Middleware/Database.config");
const {
  v4: uuidv4
} = require("uuid");


const AppError = require("../../Utils/AppError");
const {
  currentDate
} = require("../../Utils/CurrentDate");

const {
  transactionStorage
} = require("../../Utils/TransactionContext");
// Create a new mapping

// Create a new mapping
const createMapping = async ({
  body
}) => {
  const {
    roleId,
    documentTypeId,
    documentTypeUniqueId,
    isDocumentMandatory = true,
    isFileNumberRequired = false,
    isExpirationDateRequired = false,
    isDescriptionRequired = false,
    userUniqueId
  } = body;
  let resolvedDocumentTypeId = documentTypeId;
  if (!resolvedDocumentTypeId && documentTypeUniqueId) {
    const dt = await getData({
      tableName: "DocumentTypes",
      conditions: {
        documentTypeUniqueId
      }
    });
    if (dt.length === 0) {
      throw new AppError("Document type not found by UUID", 404);
    }
    resolvedDocumentTypeId = dt[0].documentTypeId;
  }

  // Convert to integers to match database types
  const numericRoleId = parseInt(roleId, 10);
  let numericDocumentTypeId = parseInt(resolvedDocumentTypeId, 10);

  // verify existence of roleid
  const roleExists = await getData({
    tableName: "Roles",
    conditions: {
      roleId: numericRoleId
    }
  });
  if (roleExists.length === 0) {
    throw new AppError("Role not found", 404);
  }
  //  verify existence of documentTypeId
  let documentTypeExists = await getData({
    tableName: "DocumentTypes",
    conditions: {
      documentTypeId: numericDocumentTypeId
    }
  });

  // If not found by ID, try finding by name if documentTypeName is provided in the body
  if (documentTypeExists.length === 0 && body.documentTypeName) {
    const dtByName = await getData({
      tableName: "DocumentTypes",
      conditions: {
        documentTypeName: body.documentTypeName
      }
    });
    if (dtByName.length > 0) {
      documentTypeExists = dtByName;
      numericDocumentTypeId = dtByName[0].documentTypeId;
    }
  }
  if (documentTypeExists.length === 0) {
    throw new AppError(`Document type not found for ID: ${numericDocumentTypeId}${body.documentTypeName ? " or Name: " + body.documentTypeName : ""}. Please ensure DocumentTypes are seeded first.`, 404);
  }
  const executor = transactionStorage.getStore() || pool;
  // Check if the mapping already exists
  const existingMapping = await executor.query("SELECT * FROM RoleDocumentRequirements WHERE roleId = ? AND documentTypeId = ? AND roleDocumentRequirementDeletedAt IS NULL", [numericRoleId, numericDocumentTypeId]);
  if (existingMapping[0].length > 0) {
    throw new AppError("Mapping already exists", 400);
  }

  // Insert new mapping
  const roleDocumentRequirementUniqueId = uuidv4();
  const result = await executor.query("INSERT INTO RoleDocumentRequirements(roleDocumentRequirementUniqueId,roleDocumentRequirementCreatedBy, roleId, documentTypeId, isDocumentMandatory, isFileNumberRequired, isExpirationDateRequired, isDescriptionRequired, roleDocumentRequirementCreatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [roleDocumentRequirementUniqueId, userUniqueId, numericRoleId, numericDocumentTypeId, isDocumentMandatory, isFileNumberRequired, isExpirationDateRequired, isDescriptionRequired, currentDate()]);
  if (result[0].affectedRows > 0) {
    return {
      message: "success",
      data: {
        roleDocumentRequirementUniqueId,
        message: "Mapping created successfully"
      }
    };
  } else {
    throw new AppError("Failed to create mapping", 500);
  }
};
// Consolidated, secure, paginated GET with filters across columns

module.exports = {
  createMapping
};
