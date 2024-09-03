const express = require("express");
const WSSMSSenderController = require("../controllers/WSSMSSender.controller");
const Router = express.Router();
Router.get("/getSMSSender", WSSMSSenderController.getSMSSender);
Router.post("/addSMSSender", WSSMSSenderController.addSMSSender);
module.exports = Router;
