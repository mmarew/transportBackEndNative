const service = require("../services/SMSSender.service");
const ServerResponder = require("../Utils/ServerResponder");

const addSMSSender = async (req, res) => {
  const results = await service.addSMSSender(req);
  ServerResponder(res, results);
};
const getSMSSender = async (req, res) => {
  const results = await service.getSMSSender(req);
  ServerResponder(res, results);
};
module.exports = { addSMSSender, getSMSSender };
