"use strict";

const { clearCache } = require("../Services/FixedData.service");
const { HTTP_STATUS } = require("../Utils/Constants");

const clearFixedDataCache = async (req, res) => {
  clearCache();
  res.status(HTTP_STATUS.OK).json({ message: "success", data: "FixedData cache cleared" });
};

module.exports = {
  clearFixedDataCache,
};
