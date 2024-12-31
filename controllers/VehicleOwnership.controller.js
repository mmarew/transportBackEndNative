const { response } = require("express");
const {
  createVehicleOwnership,
  getVehicleOwnership,
  updateVehicleOwnership,
  deleteVehicleOwnership,
  getAllVehicleOwnerships,
  getVehicleOwnershipByUserUniqueId,
} = require("../Services/VehicleOwnership.service");
const ServerResponder = require("../Utils/ServerResponder");

const createVehicleOwnershipController = async (req, res) => {
  try {
    const response = await createVehicleOwnership(req.body);

    ServerResponder(res, response);
  } catch (error) {
    console.log("Error creating vehicle ownership:", error);
    ServerResponder(res, response);
  }
};

const getVehicleOwnershipController = async (req, res) => {
  try {
    const response = await getVehicleOwnership(req.params.ownershipId);

    ServerResponder(res, response);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Vehicle ownership not found",
    });
  }
};

const updateVehicleOwnershipController = async (req, res) => {
  try {
    const response = await updateVehicleOwnership(
      req.params.ownershipId,
      req.body
    );
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error updating vehicle ownership:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create vehicle ownership",
    });
  }
};

const deleteVehicleOwnershipController = async (req, res) => {
  try {
    const response = await deleteVehicleOwnership(req.params.ownershipId);
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error deleting vehicle ownership:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create vehicle ownership",
    });
  }
};

const getAllVehicleOwnershipsController = async (req, res) => {
  try {
    const response = await getAllVehicleOwnerships();
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error fetching vehicle ownerships:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error fetching vehicle ownerships",
    });
  }
};
const getVehicleOwnershipByUserUniqueIdController = async (req, res) => {
  try {
    const userUniqueId = req.params.userUniqueId;
    const response = await getVehicleOwnershipByUserUniqueId(userUniqueId);
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error fetching vehicle ownerships:", error);
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
