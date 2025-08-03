const currentDate = require("./CurrentDate");
const { v4: uuidv4 } = require("uuid");
const usersRoles = {
  passengerRoleId: 1,
  driverRoleId: 2,
  adminRoleId: 3,
  vehicleOwnerRoleId: 4,
  systemRoleId: 5,
  supperAdminRoleId: 6,
};
const roleList = [
  {
    roleId: 1,
    roleUniqueId: uuidv4(),
    roleName: "Passenger",
    roleDescription: "a person who can make order to driver to load goods",
    roleCreatedAt: currentDate(),
  },
  {
    roleId: 2,
    roleUniqueId: uuidv4(),
    roleName: "Driver",
    roleDescription:
      "a person who can recive order from passenger to load goods",
    roleCreatedAt: currentDate(),
  },
  {
    roleId: 3,
    roleUniqueId: uuidv4(),
    roleName: "Admin",
    roleDescription: "a person who can manage the system, driver and passenger",
    roleCreatedAt: currentDate(),
  },
  {
    roleId: 4,
    roleUniqueId: uuidv4(),
    roleName: "vehicle owner",
    roleDescription: "a person who brought the car for delivery",
    roleCreatedAt: currentDate(),
  },
  {
    roleId: 5,
    roleUniqueId: uuidv4(),
    roleName: "System",
    roleDescription: "some codes writen in app an do jobs by itself",
    roleCreatedAt: currentDate(),
  },
  {
    roleId: 6,
    roleUniqueId: uuidv4(),
    roleName: "Supper Admin",
    roleDescription:
      "a person who can manage drivers passengers and admins using api requests",
    roleCreatedAt: currentDate(),
  },
  {
    roleId: 7,
    roleUniqueId: uuidv4(),
    roleName: "unknown role id",
    roleDescription:
      "This role is used to register user as default role and can be updated by supper admin ",
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

const vehicleStatusTypes = [
  {
    VehicleStatusTypeName: "active",
    statusTypeDescription:
      "When vehicles are active and ready to be used by drivers.",
  },
  {
    VehicleStatusTypeName: "inactive",
    statusTypeDescription:
      "When vehicles are inactive and not ready to be used by drivers.",
  },
  {
    VehicleStatusTypeName: "deleted",
    statusTypeDescription: "When vehicles are deleted by the admin.",
  },
  {
    VehicleStatusTypeName: "suspended",
    statusTypeDescription: "When vehicles are suspended by the admin.",
  },
  {
    VehicleStatusTypeName: "rejected",
    statusTypeDescription: "When vehicles are rejected by the admin.",
  },
  {
    VehicleStatusTypeName: "reserved by other driver",
    statusTypeDescription: "when other driver has reserved the vehicle",
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
    documentTypeName: " Vehicle Registration (librea)",
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
    documentTypeName: "Profile Photo",
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
  {
    isExpirationDateRequired: true,
    documentTypeName: "National ID",
    documentTypeDescription:
      "A valid and unexpired national ID. The admin needs this to ensure the driver is legally permitted to operate a vehicle.",
  },
];

const listOfDocumentsTypeAndId = {
  driverLicense: 1,
  vehicleRegistrationlibrea: 2,
  insuranceDocument: 3,
  profilePhoto: 4,
  taxIdentificationNumber: 5,
  delegationOfVehicleUse: 6,
  nationalId: 7,
};

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
    isExpirationDateRequired: false,
  },
  // {
  //   roleId: "2",
  //   documentTypeId: "3",
  //   isDocumentMandatory: true,
  //   isExpirationDateRequired: true,
  // },
  {
    roleId: "2",
    documentTypeId: "4",
    isDocumentMandatory: true,
    isExpirationDateRequired: false,
  },
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
    journeyStatusName: "acceptedByPassenger",
    journeyStatusDescription:
      "First driver accepted passengers request with drivers price data, then passenger accept one drivers data among many driver acceptances ",
  },
  {
    journeyStatusId: 5,
    journeyStatusName: "journeyStarted",
    journeyStatusDescription: "Journey started by driver",
  },
  {
    journeyStatusId: 6,
    journeyStatusName: "journeyCompleted",
    journeyStatusDescription: "Journey completed by driver ",
  },
  {
    journeyStatusId: 7,
    journeyStatusName: "cancelledByPassenger",
    journeyStatusDescription:
      "Cancelled by passenger, all shipment is canceled by shipper",
  },
  {
    journeyStatusId: 8,
    journeyStatusName: "rejectedByPassenger",
    journeyStatusDescription:
      "Cancelled by passenger,passenger rejected some drivers request but accept atleast one ",
  },
  {
    journeyStatusId: 9,
    journeyStatusName: "cancelledByDriver",
    journeyStatusDescription: "Cancelled by driver",
  },
  {
    journeyStatusId: 10,
    journeyStatusName: "cancelledByAdmin",
    journeyStatusDescription: "Cancelled by admin",
  },
  {
    journeyStatusId: 11,
    journeyStatusName: "completedByAdmin",
    journeyStatusDescription: "Completed by admin",
  },
  {
    journeyStatusId: 12,
    journeyStatusName: "cancelledBySystem",
    journeyStatusDescription: "Cancelled by system",
  },
  {
    journeyStatusId: 13,
    journeyStatusName: "noAnswerFromDriver",
    journeyStatusDescription: "No Answer From Driver",
  },
];
const journeyStatusMap = {
  waiting: 1,
  requested: 2,
  acceptedByDriver: 3,
  acceptedByPassenger: 4,
  journeyStarted: 5,
  journeyCompleted: 6,
  // cancel all shipment
  cancelledByPassenger: 7,
  // accept oly one driver request but reject others from bid
  rejectedByPassenger: 8,
  cancelledByDriver: 9,
  cancelledByAdmin: 10,
  completedByAdmin: 11,
  cancelledBySystem: 12,
  noAnswerFromDriver: 13,
};
// these are active because they can be used to check if it is active or not
const activeStatuses = [
  journeyStatusMap.waiting,
  journeyStatusMap.requested,
  journeyStatusMap.acceptedByDriver,
  journeyStatusMap.acceptedByPassenger,
  journeyStatusMap.journeyStarted,
];

const cancellationReasons = [
  { cancellationReason: "Driver too late", roleId: 1 },
  { cancellationReason: "Change of plans", roleId: 1 },
  { cancellationReason: "Driver took too long", roleId: 1 },
  { cancellationReason: "Found another ride", roleId: 1 },
  { cancellationReason: "Wrong vehicle description", roleId: 1 },
  {
    cancellationReason: "Driver did not meet my location",
    roleId: 1,
  },
  { cancellationReason: "Incorrect route", roleId: 1 },
  {
    cancellationReason: "Driver's vehicle didn't match description",
    roleId: 1,
  },
  {
    cancellationReason: "Driver was rude or unprofessional",
    roleId: 1,
  },

  { cancellationReason: "Passenger didn’t show up", roleId: 2 },
  { cancellationReason: "Passenger was unresponsive", roleId: 2 },
  { cancellationReason: "Safety concerns", roleId: 2 },
  { cancellationReason: "Incorrect pickup location", roleId: 2 },
  {
    cancellationReason: "Passenger had too many people",
    roleId: 2,
  },
  {
    cancellationReason: "Passenger was disrespectful",
    roleId: 2,
  },
  {
    cancellationReason: "Passenger requested an illegal or unsafe route",
    roleId: 2,
  },
  { cancellationReason: "Vehicle issue", roleId: 2 },

  {
    cancellationReason: "App-related technical issue",
    roleId: 3,
  },
  { cancellationReason: "Route unavailable", roleId: 3 },
  { cancellationReason: "Driver no longer available", roleId: 3 },
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
const paymentMethod = [
  {
    paymentMethodId: 1,
    paymentMethod: "cash",
    paymentMethodDescription: "Payment by cash",
  },
  {
    paymentMethodId: 2,
    paymentMethod: "bank",
    paymentMethodDescription: "Payment by bank",
  },
  {
    paymentMethodId: 3,
    paymentMethod: "telebirr",
    paymentMethodDescription: "Payment by telebirr",
  },
];
const TarrifRateList = [
  {
    tarrifRateId: 1,
    standingTarrifRate: 100,
    journeyTarrifRate: 25,
    timingTarrifRate: 10,
    tarifRateDescription: "some descriptions ",
  },

  {
    tarrifRateId: 2,
    standingTarrifRate: 150,
    journeyTarrifRate: 45,
    timingTarrifRate: 30,
    tarifRateDescription: "some descriptions ",
  },
];

const CommissionRates = [
  {
    commissionRateUniqueId: uuidv4(),
    commissionRateId: 1,
    commissionRate: 0.1,
    commissionRateEffectiveDate: "2029-01-01",
  },
];
const financialInstitutionAccount = [
  {
    institutionName: "Commercial Bank of Ethiopia",
    accountHolderName: "Marew Masresha Abate",
    accountNumber: "1000142114999",
    accountType: "bank",
    isActive: true,
    addedBy: "",
  },
  {
    institutionName: "Tele birr",
    accountHolderName: "Marew Masresha Abate",
    accountNumber: "0922112480",
    accountType: "mobile_money",
    isActive: true,
    addedBy: "",
  },
];
const subscriptionPlanLists = [
  {
    planName: "One month Free",
    isFree: true,
    description: "This plan is free for one month",
  },
  {
    planName: "One month",
    isFree: false,
  },
  {
    planName: "Three Months",
    isFree: false,
  },

  {
    planName: "One Year",
    isFree: false,
  },
];
module.exports = {
  subscriptionPlanLists,
  financialInstitutionAccount,
  listOfDocumentsTypeAndId,
  activeStatuses,
  journeyStatusMap,
  vehicleStatusTypes,
  CommissionRates,
  TarrifRateList,
  paymentMethod,
  paymentStatus,
  cancellationReasons,
  journeyStatus,
  vehicleTypes,
  driversDocumentRequirement,
  listOfDocuments,
  roleList,
  statusList,
  usersRoles,
};
