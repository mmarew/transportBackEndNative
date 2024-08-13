// passengers.controller.js

const {
  getManyPassengers,
  getOnePassenger,
  registerPassenger,
  deletePassenger,
  updateOnePassenger,
  verifyPassangersOTP,
} = require("../Service/Passanger.service");
const ServerResponder = require("../Utils/ServerResponder");
const services = require("../Service/Passanger.service");
// Controller to get many passengers
const getManyPassengersController = async (req, res) => {
  try {
    const passengers = await getManyPassengers();
    res.status(200).json(passengers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Controller to get one passenger by ID
const getOnePassengerController = async (req, res) => {
  try {
    const { id } = req.params;
    const passenger = await getOnePassenger(id);
    if (!passenger) {
      return res.status(404).json({ error: "Passenger not found" });
    }
    res.status(200).json(passenger);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
const verifyPassangersOTPController = async (req, res) => {
  try {
    const Responces = await verifyPassangersOTP(req.body);
    ServerResponder(res, Responces);
  } catch (error) {
    console.log("error", error);
    ServerResponder(res, {
      message: "error",
      data: "Passenger registration failed",
    });
    // res.status(500).json({ error: error.message });
  }
};
// Controller to register a new passenger
const registerPassengerController = async (req, res) => {
  try {
    console.log("req.body", req.body);
    const Responces = await registerPassenger(req.body);
    ServerResponder(res, Responces);
  } catch (error) {
    console.log("error", error);
    ServerResponder(res, {
      message: "error",
      data: "Passenger registration failed",
    });
    // res.status(500).json({ error: error.message });
  }
};

// Controller to delete a passenger by ID
const deletePassengerController = async (req, res) => {
  try {
    const { id } = req.params;
    await deletePassenger(id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Controller to update a passenger by ID
const updateOnePassengerController = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedPassenger = await updateOnePassenger(id, req.body);
    res.status(200).json(updatedPassenger);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
const registerPassangerRequestToGetCars = async (req, res) => {
  try {
    const Responces = await services.registerPassangerRequestToGetCars(
      req.body,
      req.user
    );
    console.log("Responces=====>", Responces);
    // return;
    ServerResponder(res, Responces);
  } catch (error) {
    console.log("error", error);
    ServerResponder(res, {
      message: "error",
      data: "Passenger registration failed",
    });
  }
};
const verifyStatusOfPassenger = async (req, res) => {
  try {
    const Responces = await services.verifyStatusOfPassenger(req);
    ServerResponder(res, Responces);
  } catch (error) {
    console.log("error", error);
    ServerResponder(res, {
      message: "error",
      data: "Passenger registration failed",
    });
    // res.status(500).json({ error: error.message });
  }
};
const cancelRequest = async (req, res) => {
  try {
    const Responces = await services.cancelRequest(req);
    ServerResponder(res, Responces);
  } catch (error) {
    console.log("error", error);
    ServerResponder(res, {
      message: "error",
      data: "Passenger registration failed",
    });
    // res.status(500).json({ error: error.message });
  }
};
module.exports = {
  cancelRequest,
  verifyStatusOfPassenger,
  registerPassangerRequestToGetCars,
  verifyPassangersOTPController,
  getManyPassengersController,
  getOnePassengerController,
  registerPassengerController,
  deletePassengerController,
  updateOnePassengerController,
};
