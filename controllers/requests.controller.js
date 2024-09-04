const {
  createRequest,
  getRequestById,
  updateRequest,
  deleteRequest,
} = require("../services/requests.service");
const service = require("../services/requests.service");
const ServerResponder = require("../Utils/ServerResponder");
const verifyStatusOfUser = async (req, res) => {
  try {
    const result = await service.verifyStatusOfUser(req);
    ServerResponder(res, result);
  } catch (error) {}
};
const createRequestController = async (req, res) => {
  try {
    const result = await createRequest(req.body, req.user);
    ServerResponder(res, result);
  } catch (error) {
    res.status(500).json({ message: "error", data: error.message });
  }
};

const getRequestController = async (req, res) => {
  try {
    const result = await getRequestById(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    res.status(500).json({ message: "error", data: error.message });
  }
};

const updateRequestController = async (req, res) => {
  try {
    const result = await updateRequest(req.params.id, req.body);
    ServerResponder(res, result);
  } catch (error) {
    res.status(500).json({ message: "error", data: error.message });
  }
};

const deleteRequestController = async (req, res) => {
  try {
    const result = await deleteRequest(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    res.status(500).json({ message: "error", data: error.message });
  }
};

module.exports = {
  verifyStatusOfUser,
  createRequestController,
  getRequestController,
  updateRequestController,
  deleteRequestController,
};
