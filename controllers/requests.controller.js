const {
  createRequest,
  getRequestById,
  updateRequest,
  deleteRequest,
} = require("../services/requests.service");

const createRequestController = async (req, res) => {
  try {
    const result = await createRequest(req.body, req.user);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "error", data: error.message });
  }
};

const getRequestController = async (req, res) => {
  try {
    const result = await getRequestById(req.params.id);
    res.status(200).json({ message: "success", data: result });
  } catch (error) {
    res.status(500).json({ message: "error", data: error.message });
  }
};

const updateRequestController = async (req, res) => {
  try {
    const result = await updateRequest(req.params.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "error", data: error.message });
  }
};

const deleteRequestController = async (req, res) => {
  try {
    const result = await deleteRequest(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "error", data: error.message });
  }
};

module.exports = {
  createRequestController,
  getRequestController,
  updateRequestController,
  deleteRequestController,
};
