const VechleTypeService = require("../Service/VechleType.service");
const ServerResponder = require("../Utils/ServerResponder");
const deleteVechleType = async (req, res) => {
    const responce = await VechleTypeService.deleteVechleType(req);
    ServerResponder(res, responce);
  },
  updateVechleVechleType = async (req, res) => {
    const responce = await VechleTypeService.updateVechleVechleType(req);
    ServerResponder(res, responce);
  },
  registerVechleVechleType = async (req, res) => {
    const responce = await VechleTypeService.registerVechleVechleType(req);
    ServerResponder(res, responce);
  },
  getVechleVechleType = async (req, res) => {
    const responce = await VechleTypeService.getVechleVechleType(req);
    ServerResponder(res, responce);
  };
module.exports = {
  deleteVechleType,
  updateVechleVechleType,
  registerVechleVechleType,
  getVechleVechleType,
};
