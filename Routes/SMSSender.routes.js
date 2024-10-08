const express = require("express");
const SMSSenderController = require("../controllers/WSSMSSender.controller");
const Router = express.Router();
Router.get("/getSMSSender", SMSSenderController.getSMSSender);
Router.post("/addSMSSender", SMSSenderController.addSMSSender);
module.exports = Router;
