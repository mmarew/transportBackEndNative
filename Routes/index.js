const Routes = require("express").Router();
const WSSMSSenderRouter = require("./WSSMSSender.routes");
const VechleRouter = require("./VechleType.routes");
const CancilationRouter = require("./Cancilation.routes");
const AdminRouter = require("./Admin.routes");
const usersRoleStatuseRouter = require("./usersRoleStatuse.routes");
const userRoutes = require("./User.routes");
const roles = require("./Role.routes");
const Status = require("./Status.routes");
const Vehicles = require("./vehicle.routes");
const vehicleOwnership = require("./vehicleOwnership.routes");
const Passenger = require("./Passenger.routes");
const Driver = require("./Driver.routes");

Routes.use(Driver);
Routes.use(Passenger);

Routes.use(vehicleOwnership);

Routes.use(Vehicles);
Routes.use(Status);
Routes.use(roles);
Routes.use(userRoutes);
Routes.use(usersRoleStatuseRouter);
Routes.use(AdminRouter);
Routes.use(CancilationRouter);
Routes.use(VechleRouter);
Routes.use(WSSMSSenderRouter);
module.exports = Routes;
