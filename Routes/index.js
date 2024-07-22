const Routes = require("express").Router();
const WSSMSSenderRouter = require("./WSSMSSender.routes");
const driversRouter = require("./Drivers.routes");
const PassangerRouter = require("./Passanger.routes");
Routes.use(PassangerRouter);
Routes.use(driversRouter);
Routes.use(WSSMSSenderRouter);
module.exports = Routes;
