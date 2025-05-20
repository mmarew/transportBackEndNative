const service = require("../Services/FinancialInstitutionAccount.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.createFinancialInstitutionAccount = async (req, res) => {
  try {
    const data = req.body;
    const result = await service.createFinancialInstitutionAccount(data);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Create Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create account",
    });
  }
};

exports.getAllFinancialInstitutionAccounts = async (req, res) => {
  try {
    const result = await service.getAllFinancialInstitutionAccounts();
    ServerResponder(res, result);
  } catch (error) {
    console.error("Fetch Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch accounts",
    });
  }
};

exports.getFinancialInstitutionAccountByUniqueId = async (req, res) => {
  try {
    const { accountUniqueId } = req.params;
    const result = await service.getFinancialInstitutionAccountByUniqueId(
      accountUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Fetch By ID Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch account",
    });
  }
};

exports.updateFinancialInstitutionAccountByUniqueId = async (req, res) => {
  try {
    const { accountUniqueId } = req.params;
    const updates = req.body;
    const result = await service.updateFinancialInstitutionAccountByUniqueId(
      accountUniqueId,
      updates
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Update Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update account",
    });
  }
};

exports.deleteFinancialInstitutionAccountByUniqueId = async (req, res) => {
  try {
    const { accountUniqueId } = req.params;
    const result = await service.deleteFinancialInstitutionAccountByUniqueId(
      accountUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Delete Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete account",
    });
  }
};
