const { response } = require("express");
const {
  createVehicleOwnership,
  updateVehicleOwnership,
  deleteVehicleOwnership,
  getVehicleOwnershipsByFilter,
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

// removed: get by ownershipId; use filter endpoint instead

const updateVehicleOwnershipController = async (req, res) => {
  try {
    const response = await updateVehicleOwnership(req.query);
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

const listVehicleOwnershipsController = async (req, res) => {
  try {
    const { page, limit, includePagination } = req.query || {};
    // Extract filters by removing pagination params
    const {
      page: _p,
      limit: _l,
      includePagination: _ip,
      ...filters
    } = req.query || {};

    const hasFilters = Object.keys(filters).length > 0;
    console.log("@hasFilters", hasFilters, " @filters", filters);
    const response = await getVehicleOwnershipsByFilter({
      filters: hasFilters ? filters : {},
      page,
      limit,
      includePagination:
        includePagination === "true" || includePagination === true,
    });
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
  createVehicleOwnershipController,
  updateVehicleOwnershipController,
  deleteVehicleOwnershipController,
  listVehicleOwnershipsController,
};
