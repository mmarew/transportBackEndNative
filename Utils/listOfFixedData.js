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
  // 1. Vehicle Registered, All Documents Accepted
  {
    statusId: 1,
    statusUniqueId: uuidv4(),
    statusName: "active",
    statusDescription:
      "Driver has registered a vehicle, and all required documents have been accepted. Driver is active.",
    statusCreatedAt: currentDate(),
  },
  // 2. Vehicle Not Registered, No Documents Attached
  {
    statusId: 2,
    statusUniqueId: uuidv4(),
    statusName: "inactive - no documents attached, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle and has not attached any required documents.",
    statusCreatedAt: currentDate(),
  },
  // 3. Vehicle Not Registered, Some Documents Attached (All Pending)
  {
    statusId: 3,
    statusUniqueId: uuidv4(),
    statusName: "inactive - documents pending, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle, and all attached documents are pending verification.",
    statusCreatedAt: currentDate(),
  },
  // 4. Vehicle Not Registered, Some Documents Attached (All Rejected)
  {
    statusId: 4,
    statusUniqueId: uuidv4(),
    statusName: "inactive - documents rejected, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle, and all attached documents have been rejected.",
    statusCreatedAt: currentDate(),
  },
  // 5. Vehicle Not Registered, Some Documents Attached (Some Accepted, Some Pending)
  {
    statusId: 5,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents accepted, some pending, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle. Some attached documents are accepted, others are pending.",
    statusCreatedAt: currentDate(),
  },
  // 6. Vehicle Not Registered, Some Documents Attached (Some Accepted, Some Rejected)
  {
    statusId: 6,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents accepted, some rejected, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle. Some attached documents are accepted, others have been rejected.",
    statusCreatedAt: currentDate(),
  },
  // 7. Vehicle Not Registered, All Documents Accepted
  {
    statusId: 7,
    statusUniqueId: uuidv4(),
    statusName: "inactive - all documents accepted, vehicle not registered",
    statusDescription:
      "All required documents have been accepted by the admin, but the driver has not registered a vehicle.",
    statusCreatedAt: currentDate(),
  },
  // 8. Vehicle Registered, No Documents Attached
  {
    statusId: 8,
    statusUniqueId: uuidv4(),
    statusName: "inactive - no documents attached, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle but has not attached any required documents.",
    statusCreatedAt: currentDate(),
  },
  // 9. Vehicle Registered, Some Documents Attached (All Pending)
  {
    statusId: 9,
    statusUniqueId: uuidv4(),
    statusName: "inactive - documents pending, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle, and all attached documents are pending verification.",
    statusCreatedAt: currentDate(),
  },
  // 10. Vehicle Registered, Some Documents Attached (All Rejected)
  {
    statusId: 10,
    statusUniqueId: uuidv4(),
    statusName: "inactive - documents rejected, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle, and all attached documents have been rejected.",
    statusCreatedAt: currentDate(),
  },
  // 11. Vehicle Registered, Some Documents Attached (Some Accepted, Some Pending)
  {
    statusId: 11,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents accepted, some pending, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle. Some attached documents are accepted, others are pending.",
    statusCreatedAt: currentDate(),
  },
  // 12. Vehicle Registered, Some Documents Attached (Some Accepted, Some Rejected)
  {
    statusId: 12,
    statusUniqueId: uuidv4(),
    statusName:
      "inactive - some documents accepted, some rejected, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle. Some attached documents are accepted, others have been rejected.",
    statusCreatedAt: currentDate(),
  },
  // 13. Vehicle Registered, All Documents Pending
  {
    statusId: 13,
    statusUniqueId: uuidv4(),
    statusName: "inactive - all documents pending, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle, and all attached documents are pending verification.",
    statusCreatedAt: currentDate(),
  },
  // 14. Vehicle Registered, All Documents Rejected
  {
    statusId: 14,
    statusUniqueId: uuidv4(),
    statusName: "inactive - all documents rejected, vehicle registered",
    statusDescription:
      "Driver has registered a vehicle, and all attached documents have been rejected.",
    statusCreatedAt: currentDate(),
  },
  // 15. Vehicle Not Registered, All Documents Pending
  {
    statusId: 15,
    statusUniqueId: uuidv4(),
    statusName: "inactive - all documents pending, vehicle not registered",
    statusDescription:
      "Driver has not registered a vehicle, and all attached documents are pending verification.",
    statusCreatedAt: currentDate(),
  },
  // 16. Vehicle Not Registered, All Documents Rejected
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
  // 18. Vehicle Not Registered, Some Documents Not Attached
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
];

const listOfDocuments = [
  {
    uploadedDocumentTypeId: "drivingLicenseTypeId",
    uploadedDocumentDescription: "drivingLicenseDescription",
    uploadedDocumentExpirationDate: "drivingLicenseExpirationDate",
    uploadedDocumentName: "drivingLicense",
    documentTypeName: "Driver’s License",
    documentTypeDescription:
      " A valid and unexpired driver’s license. The admin needs this to ensure the driver is legally permitted to operate a vehicle.",
  },
  {
    uploadedDocumentTypeId: "vehicleRegistrationTypeId",
    uploadedDocumentDescription: "vehicleRegistrationDescription",
    uploadedDocumentExpirationDate: "vehicleRegistrationExpirationDate",
    uploadedDocumentName: "vehicleRegistration",
    documentTypeName: " Vehicle Registration(librea)",
    documentTypeDescription:
      "Proof of ownership or right to use the vehicle for ride share services. It confirms the vehicle is legally registered.",
  },
  {
    uploadedDocumentTypeId: "insuranceTypeId",
    uploadedDocumentDescription: "insuranceDescription",
    uploadedDocumentExpirationDate: "insuranceExpirationDate",
    uploadedDocumentName: "insurance",
    documentTypeName: "Insurance Document",
    documentTypeDescription:
      "Proof of insurance coverage, ensuring that the driver and passengers are protected in the event of an accident.",
  },
  {
    uploadedDocumentTypeId: "profilePhotoTypeId",
    uploadedDocumentDescription: "profilePhotoDescription",
    uploadedDocumentExpirationDate: "profilePhotoExpirationDate",
    uploadedDocumentName: "profilePhoto",
    documentTypeName: " Profile Photo",
    documentTypeDescription: "Profile Photo",
  },
  {
    uploadedDocumentTypeId: "tinTypeId",
    uploadedDocumentDescription: "tinDescription",
    uploadedDocumentExpirationDate: "tinExpirationDate",
    uploadedDocumentName: "tin",
    documentTypeName: "Tax Identification Number",
    documentTypeDescription:
      "document that certifies the driver is registered with tax authorities, especially if they are working as an independent contractor.",
  },
  {
    uploadedDocumentTypeId: "delegationTypeId",
    uploadedDocumentDescription: "delegationDescription",
    uploadedDocumentExpirationDate: "delegationExpirationDate",
    uploadedDocumentName: "delegation",
    documentTypeName: "Delegation of Vehicle Use",
    documentTypeDescription:
      "A formal document that provides proof that the owner of the vehicle has granted the driver permission to use the vehicle for commercial purposes (ride-sharing).",
  },
];
const driversDocumentRequirement = [
  { roleId: "2", documentTypeId: "1", isDocumentMandatory: true },
  { roleId: "2", documentTypeId: "2", isDocumentMandatory: true },
  { roleId: "2", documentTypeId: "3", isDocumentMandatory: true },
  { roleId: "2", documentTypeId: "4", isDocumentMandatory: true },
  { roleId: "2", documentTypeId: "5", isDocumentMandatory: true },
  { roleId: "2", documentTypeId: "6", isDocumentMandatory: true },
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
module.exports = {
  vehicleTypes,
  driversDocumentRequirement,
  listOfDocuments,
  roleList,
  statusList,
};
