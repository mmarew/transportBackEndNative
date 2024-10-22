const { response } = require("express");
const {
  createVehicleOwnership,
  getVehicleOwnership,
  updateVehicleOwnership,
  deleteVehicleOwnership,
  getAllVehicleOwnerships,
  getVehicleOwnershipByUserUniqueId,
} = require("../services/vehicleOwnership.service");
const ServerResponder = require("../utils/ServerResponder");

const createVehicleOwnershipController = async (req, res) => {
  try {
    const response = await createVehicleOwnership(req.body);
    if (response.message === "success") {
      return res.status(201).json(response);
    }
    res.status(400).json(response);
  } catch (error) {
    console.error("Error creating vehicle ownership:", error);
    res.status(500).json({ message: "Vehicle ownership creation failed" });
  }
};

const getVehicleOwnershipController = async (req, res) => {
  try {
    const response = await getVehicleOwnership(req.params.ownershipId);
    if (response) {
      return res.status(200).json(response);
    }
    res.status(404).json({ message: "Vehicle ownership not found" });
  } catch (error) {
    console.error("Error fetching vehicle ownership:", error);
    res.status(500).json({ message: "Error fetching vehicle ownership" });
  }
};

const updateVehicleOwnershipController = async (req, res) => {
  try {
    const response = await updateVehicleOwnership(
      req.params.ownershipId,
      req.body
    );
    if (response.message === "success") {
      return res.status(200).json(response);
    }
    res.status(400).json(response);
  } catch (error) {
    console.error("Error updating vehicle ownership:", error);
    res.status(500).json({ message: "Vehicle ownership update failed" });
  }
};

const deleteVehicleOwnershipController = async (req, res) => {
  try {
    const response = await deleteVehicleOwnership(req.params.ownershipId);
    if (response.message === "success") {
      return res.status(200).json(response);
    }
    res.status(404).json({ message: "Vehicle ownership not found" });
  } catch (error) {
    console.error("Error deleting vehicle ownership:", error);
    res.status(500).json({ message: "Vehicle ownership deletion failed" });
  }
};

const getAllVehicleOwnershipsController = async (req, res) => {
  try {
    const response = await getAllVehicleOwnerships();
    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching vehicle ownerships:", error);
    res.status(500).json({ message: "Error fetching vehicle ownerships" });
  }
};
const getVehicleOwnershipByUserUniqueIdController = async (req, res) => {
  try {
    const userUniqueId = req.params.userUniqueId;
    const response = await getVehicleOwnershipByUserUniqueId(userUniqueId);
    ServerResponder(res, response);
  } catch (error) {
    console.error("Error fetching vehicle ownerships:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error fetching vehicle ownerships",
    });
  }
};

module.exports = {
  getVehicleOwnershipByUserUniqueIdController,
  createVehicleOwnershipController,
  getVehicleOwnershipController,
  updateVehicleOwnershipController,
  deleteVehicleOwnershipController,
  getAllVehicleOwnershipsController,
};
