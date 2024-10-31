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
    roleName: "Driver",
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
  // 1. All Documents Accepted, Vehicle Registered (Active)
  {
    statusId: 1,
    statusUniqueId: uuidv4(),
    statusName: "active",
    statusDescription:
      "Driver has registered a vehicle, and all required documents have been accepted. Driver is active.",
    statusCreatedAt: currentDate(),
  },
  // 2. No Document, No Vehicle Registered
  {
    statusId: 2,
    statusUniqueId: uuidv4(),
    statusName: "inactive - no documents attached, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle and has not attached any required documents.",
    statusCreatedAt: currentDate(),
  },

  // 3. Some Documents Attached (All Pending), No Vehicle Registered
  {
    statusId: 3,
    statusUniqueId: uuidv4(),
    statusName: "inactive - documents pending, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle, and all attached documents are pending verification.",
    statusCreatedAt: currentDate(),
  },

  // 4. Some Documents Attached (All Rejected), No Vehicle Registered
  {
    statusId: 4,
    statusUniqueId: uuidv4(),
    statusName: "inactive - documents rejected, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle, and all attached documents have been rejected.",
    statusCreatedAt: currentDate(),
  },

  // 5. Some Documents Attached (Some Accepted, Some Pending), No Vehicle Registered
  {
    statusId: 5,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents accepted, some pending, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle. Some attached documents are accepted, others are pending.",
    statusCreatedAt: currentDate(),
  },

  // 6. Some Documents Attached (Some Accepted, Some Rejected), No Vehicle Registered
  {
    statusId: 6,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents accepted, some rejected, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle. Some attached documents are accepted, others have been rejected.",
    statusCreatedAt: currentDate(),
  },

  // 7. All Documents Accepted, No Vehicle Registered
  {
    statusId: 7,
    statusUniqueId: uuidv4(),
    statusName: "inactive - all documents accepted, vehicle not registered",
    statusDescription:
      "All required documents have been accepted by the admin, but the driver has not registered a vehicle.",
    statusCreatedAt: currentDate(),
  },

  // 8. No Document Attached, Vehicle Registered
  {
    statusId: 8,
    statusUniqueId: uuidv4(),
    statusName: "inactive - no documents attached, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle but has not attached any required documents.",
    statusCreatedAt: currentDate(),
  },

  // 9. Some Documents Attached (All Pending), Vehicle Registered
  {
    statusId: 9,
    statusUniqueId: uuidv4(),
    statusName: "inactive - documents pending, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle, and all attached documents are pending verification.",
    statusCreatedAt: currentDate(),
  },

  // 10. Some Documents Attached (All Rejected), Vehicle Registered
  {
    statusId: 10,
    statusUniqueId: uuidv4(),
    statusName: "inactive - documents rejected, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle, and all attached documents have been rejected.",
    statusCreatedAt: currentDate(),
  },

  // 11. Some Documents Attached (Some Accepted, Some Pending), Vehicle Registered
  {
    statusId: 11,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents accepted, some pending, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle. Some attached documents are accepted, others are pending.",
    statusCreatedAt: currentDate(),
  },

  // 12. Some Documents Attached (Some Accepted, Some Rejected), Vehicle Registered
  {
    statusId: 12,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents accepted, some rejected, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle. Some attached documents are accepted, others have been rejected.",
    statusCreatedAt: currentDate(),
  },

  // 13. All Documents Pending, Vehicle Registered
  {
    statusId: 13,
    statusUniqueId: uuidv4(),
    statusName: "inactive - all documents pending, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle, and all attached documents are pending verification.",
    statusCreatedAt: currentDate(),
  },

  // 14. All Documents Rejected, Vehicle Registered
  {
    statusId: 14,
    statusUniqueId: uuidv4(),
    statusName: "inactive - all documents rejected, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle, and all attached documents have been rejected.",
    statusCreatedAt: currentDate(),
  },

  // 15. All Documents Pending, No Vehicle Registered
  {
    statusId: 15,
    statusUniqueId: uuidv4(),
    statusName: "inactive - all documents pending, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle, and all attached documents are pending verification.",
    statusCreatedAt: currentDate(),
  },

  // 16. All Documents Rejected, No Vehicle Registered
  {
    statusId: 16,
    statusUniqueId: uuidv4(),
    statusName: "inactive - all documents rejected, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle, and all attached documents have been rejected.",
    statusCreatedAt: currentDate(),
  },

  // 17. Vehicle Registered, Some Documents Not Attached
  {
    statusId: 17,
    statusUniqueId: uuidv4(),
    statusName: "inactive - some documents not attached, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle but has not attached all required documents.",
    statusCreatedAt: currentDate(),
  },

  // 18. No Vehicle Registered, Some Documents Not Attached
  {
    statusId: 18,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents not attached, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle and has not attached all required documents.",
    statusCreatedAt: currentDate(),
  },

  // 19. Vehicle Registered, All Documents Attached, Mixed Statuses
  {
    statusId: 19,
    statusUniqueId: uuidv4(),
    statusName: "inactive - documents have mixed statuses, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle. All required documents are attached but have mixed statuses (accepted, pending, rejected).",
    statusCreatedAt: currentDate(),
  },

  // 20. Vehicle Not Registered, All Documents Attached, Mixed Statuses
  {
    statusId: 20,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - documents have mixed statuses, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle. All required documents are attached but have mixed statuses (accepted, pending, rejected).",
    statusCreatedAt: currentDate(),
  },

  // 21. Some Documents Accepted, Some Pending, No Vehicle Registered
  {
    statusId: 21,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents accepted, some pending, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle, some attached documents are accepted, others are pending.",
    statusCreatedAt: currentDate(),
  },

  // 22. Some Documents Accepted, Some Rejected, No Vehicle Registered
  {
    statusId: 22,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents accepted, some rejected, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle, some attached documents are accepted, others are rejected.",
    statusCreatedAt: currentDate(),
  },

  // 23. Some Documents Accepted, Some Pending, Vehicle Registered
  {
    statusId: 23,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents accepted, some pending, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle, some attached documents are accepted, others are pending.",
    statusCreatedAt: currentDate(),
  },

  // 24. Some Documents Accepted, Some Rejected, Vehicle Registered
  {
    statusId: 24,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents accepted, some rejected, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle, some attached documents are accepted, others are rejected.",
    statusCreatedAt: currentDate(),
  },

  // 25. All Documents Pending, No Vehicle Registered
  {
    statusId: 25,
    statusUniqueId: uuidv4(),
    statusName: "inactive - all documents pending, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle, and all attached documents are pending verification.",
    statusCreatedAt: currentDate(),
  },

  // 26. All Documents Rejected, No Vehicle Registered
  {
    statusId: 26,
    statusUniqueId: uuidv4(),
    statusName: "inactive - all documents rejected, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle, and all attached documents have been rejected.",
    statusCreatedAt: currentDate(),
  },

  // 27. No Document Attached, Vehicle Registered
  {
    statusId: 27,
    statusUniqueId: uuidv4(),
    statusName: "inactive - no documents attached, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle but has not attached any required documents.",
    statusCreatedAt: currentDate(),
  },

  // 28. Vehicle Registered, All Documents Attached, Mixed Statuses
  {
    statusId: 28,
    statusUniqueId: uuidv4(),
    statusName: "inactive - documents have mixed statuses, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle, and all required documents are attached but with mixed statuses (accepted, pending, rejected).",
    statusCreatedAt: currentDate(),
  },
];

const listOfDocuments = [
  {
    isExpirationDateRequired: true,
    documentTypeName: "Driver’s License",
    documentTypeDescription:
      " A valid and unexpired driver’s license. The admin needs this to ensure the driver is legally permitted to operate a vehicle.",
  },
  {
    isExpirationDateRequired: true,
    documentTypeName: " Vehicle Registration(librea)",
    documentTypeDescription:
      "Proof of ownership or right to use the vehicle for ride share services. It confirms the vehicle is legally registered.",
  },
  {
    isExpirationDateRequired: true,
    documentTypeName: "Insurance Document",
    documentTypeDescription:
      "Proof of insurance coverage, ensuring that the driver and passengers are protected in the event of an accident.",
  },
  {
    isExpirationDateRequired: true,
    documentTypeName: " Profile Photo",
    documentTypeDescription: "Profile Photo",
  },
  {
    isExpirationDateRequired: true,
    documentTypeName: "Tax Identification Number",
    documentTypeDescription:
      "document that certifies the driver is registered with tax authorities, especially if they are working as an independent contractor.",
  },
  {
    isExpirationDateRequired: false,
    documentTypeName: "Delegation of Vehicle Use",
    documentTypeDescription:
      "A formal document that provides proof that the owner of the vehicle has granted the driver permission to use the vehicle for commercial purposes (ride-sharing).",
  },
];
const driversDocumentRequirement = [
  {
    roleId: "2",
    documentTypeId: "1",
    isDocumentMandatory: true,
    isExpirationDateRequired: true,
  },
  {
    roleId: "2",
    documentTypeId: "2",
    isDocumentMandatory: true,
    isExpirationDateRequired: true,
  },
  // {
  //   roleId: "2",
  //   documentTypeId: "3",
  //   isDocumentMandatory: true,
  //   isExpirationDateRequired: true,
  // },
  // {
  //   roleId: "2",
  //   documentTypeId: "4",
  //   isDocumentMandatory: true,
  //   isExpirationDateRequired: true,
  // },
  // {
  //   roleId: "2",
  //   documentTypeId: "5",
  //   isDocumentMandatory: true,
  //   isExpirationDateRequired: true,
  // },
  // {
  //   roleId: "2",
  //   documentTypeId: "6",
  //   isDocumentMandatory: true,
  //   isExpirationDateRequired: true,
  // },
];
const vehicleTypes = [
  {
    vehicleTypeName: "Isuzu FSR",
    carryingCapacity: "10 ton (100 kuintal)",
    createdAt: null,
    updatedAt: null,
  },
  {
    vehicleTypeName: "Isuzu NPR",
    carryingCapacity: "5 ton (50 kuintal)",
    createdAt: null,
    updatedAt: null,
  },
  {
    vehicleTypeName: "Euro tracker",
    carryingCapacity: "40 ton (400 kuintal)",
    createdAt: null,
    updatedAt: null,
  },
  {
    vehicleTypeName: "Sino truck",
    carryingCapacity: "10 ton (100 kuintal)",
    createdAt: null,
    updatedAt: null,
  },
];
const journeyStatus = [
  {
    journeyStatusId: 1,
    journeyStatusName: "waiting",
    journeyStatusDescription:
      "Waiting for driver to accept or passenger request",
  },
  {
    journeyStatusId: 2,
    journeyStatusName: "requested",
    journeyStatusDescription:
      "Passenger requested by driver or driver requested by passenger",
  },
  {
    journeyStatusId: 3,
    journeyStatusName: "acceptedByDriver",
    journeyStatusDescription:
      "Passenger accepted by driver or driver accepted by passenger",
  },
  {
    journeyStatusId: 4,
    journeyStatusName: "journeyStarted",
    journeyStatusDescription: "Journey started by driver",
  },
  {
    journeyStatusId: 5,
    journeyStatusName: "journeyCompleted",
    journeyStatusDescription: "Journey completed by driver ",
  },
  {
    journeyStatusId: 6,
    journeyStatusName: "cancelledByPassenger",
    journeyStatusDescription: "Cancelled by passenger",
  },
  {
    journeyStatusId: 7,
    journeyStatusName: "cancelledByDriver",
    journeyStatusDescription: "Cancelled by driver",
  },
  {
    journeyStatusId: 8,
    journeyStatusName: "cancelledByAdmin",
    journeyStatusDescription: "Cancelled by admin",
  },
  {
    journeyStatusId: 9,
    journeyStatusName: "completedByAdmin",
    journeyStatusDescription: "Completed by admin",
  },
  {
    journeyStatusId: 10,
    journeyStatusName: "cancelledBySystem",
    journeyStatusDescription: "Cancelled by system",
  },
];
const cancellationReasons = [
  { reason: "Driver too late", cancellationByRoleId: 1 },
  { reason: "Change of plans", cancellationByRoleId: 1 },
  { reason: "Driver took too long", cancellationByRoleId: 1 },
  { reason: "Found another ride", cancellationByRoleId: 1 },
  {
    reason: "Driver did not meet my location",
    cancellationByRoleId: 1,
  },
  { reason: "Incorrect route", cancellationByRoleId: 1 },
  {
    reason: "Driver's vehicle didn't match description",
    cancellationByRoleId: 1,
  },
  {
    reason: "Driver was rude or unprofessional",
    cancellationByRoleId: 1,
  },

  { reason: "Passenger didn’t show up", cancellationByRoleId: 2 },
  { reason: "Passenger was unresponsive", cancellationByRoleId: 2 },
  { reason: "Safety concerns", cancellationByRoleId: 2 },
  { reason: "Incorrect pickup location", cancellationByRoleId: 2 },
  { reason: "Passenger had too many people", cancellationByRoleId: 2 },
  { reason: "Passenger was disrespectful", cancellationByRoleId: 2 },
  {
    reason: "Passenger requested an illegal or unsafe route",
    cancellationByRoleId: 2,
  },
  { reason: "Vehicle issue", cancellationByRoleId: 2 },

  { reason: "App-related technical issue", cancellationByRoleId: 3 },
  { reason: "Route unavailable", cancellationByRoleId: 3 },
  { reason: "Driver no longer available", cancellationByRoleId: 3 },
];
const paymentStatus = [
  {
    paymentStatusId: 1,
    paymentStatus: "pending",
    paymentStatusDescription: "Payment is pending",
  },
  {
    paymentStatusId: 2,
    paymentStatus: "completed",
    paymentStatusDescription: "Payment is completed",
  },
  {
    paymentStatusId: 3,
    paymentStatus: "failed",
    paymentStatusDescription: "Payment failed",
  },
];

module.exports = {
  paymentStatus,
  cancellationReasons,
  journeyStatus,
  vehicleTypes,
  driversDocumentRequirement,
  listOfDocuments,
  roleList,
  statusList,
};
