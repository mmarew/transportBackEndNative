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

const listOfDocuments = [
  {
    documentTypeName: "Driver’s License",
    documentTypeDescription:
      " A valid and unexpired driver’s license. The admin needs this to ensure the driver is legally permitted to operate a vehicle.",
  },
  {
    documentTypeName: " Vehicle Registration(librea)",
    documentTypeDescription:
      " Proof of ownership or right to use the vehicle for rideshare services. It confirms the vehicle is legally registered.",
  },
  {
    documentTypeName: "Insurance Document",
    documentTypeDescription:
      "Proof of insurance coverage, ensuring that the driver and passengers are protected in the event of an accident.",
  },
  {
    documentTypeName: " Profile Photo",
    documentTypeDescription: "Profile Photo",
  },
  {
    documentTypeName: "Tax Identification Number",
    documentTypeDescription:
      "document that certifies the driver is registered with tax authorities, especially if they are working as an independent contractor.",
  },
  {
    documentTypeName: "Delegation of Vehicle Use",
    documentTypeDescription:
      "A formal document that provides proof that the owner of the vehicle has granted the driver permission to use the vehicle for commercial purposes (ride-sharing).",
  },
];

module.exports = {
  listOfDocuments,
  roleList,
  statusList,
};
