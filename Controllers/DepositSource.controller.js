const service = require("../Services/DepositSource.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.createDepositSource = async (req, res) => {
  try {
    const { sourceKey, sourceLabel } = req.body;
    const result = await service.createDepositSource(sourceKey, sourceLabel);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Create Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create deposit source",
    });
  }
};

exports.getAllDepositSources = async (req, res) => {
  try {
    const result = await service.getAllDepositSources();
    ServerResponder(res, result);
  } catch (error) {
    console.error("Get All Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch sources",
    });
  }
};

exports.getDepositSourceByUniqueId = async (req, res) => {
  try {
    const { depositSourceUniqueId } = req.params;
    const result = await service.getDepositSourceByUniqueId(
      depositSourceUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Get By UUID Error:", error);
    ServerResponder(res, { message: "error", error: "Failed to fetch source" });
  }
};

exports.updateDepositSourceByUniqueId = async (req, res) => {
  try {
    const { depositSourceUniqueId } = req.params;
    const { sourceKey, sourceLabel } = req.body;
    const result = await service.updateDepositSourceByUniqueId(
      depositSourceUniqueId,
      sourceKey,
      sourceLabel
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Update Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update source",
    });
  }
};

exports.deleteDepositSourceByUniqueId = async (req, res) => {
  try {
    const { depositSourceUniqueId } = req.params;
    const result = await service.deleteDepositSourceByUniqueId(
      depositSourceUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Delete Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete source",
    });
  }
};
