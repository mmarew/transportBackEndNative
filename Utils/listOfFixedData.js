const currentDate = require("../Utils/currentDate");
const { v4: uuidv4 } = require("uuid");
const roleList = [
  {
    roleUniqueId: uuidv4(),
    roleName: "Passenger",
    roleDescription: "a person who can make order to driver to load goods",
    roleCreatedAt: currentDate(),
  },
  {
    roleUniqueId: uuidv4(),
    roleName: "driver",
    roleDescription:
      "a person who can recive order from passenger to load goods",
    roleCreatedAt: currentDate(),
  },
  {
    roleUniqueId: uuidv4(),
    roleName: "Admin",
    roleDescription: "a person who can manage the system, driver and passenger",
    roleCreatedAt: currentDate(),
  },
  {
    roleUniqueId: uuidv4(),
    roleName: "vehicle owner",
    roleDescription: "a person who brought the car for delivery",
    roleCreatedAt: currentDate(),
  },
];
const statusList = [
  {
    statusUniqueId: uuidv4(),
    statusName: "active",
    statusDescription: "user can do there job based on the role",
  },
  {
    statusUniqueId: uuidv4(),
    statusName: "in active driver",
    statusDescription:
      "Drivers identity  has to be verified by admin. so driver has to bring document like driving licesns, librea, tin, and photo of driver. photho has  has to be taken  online.",
  },
  {
    statusUniqueId: uuidv4(),
    statusName: "in active passenger",
    statusDescription: "this happened when an admin suspends the user.",
  },
];
module.exports = {
  roleList,
  statusList,
};
