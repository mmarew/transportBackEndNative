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
    statusDescription:
      "User can perform tasks according to their assigned role.",
    statusCreatedAt: currentDate(),
    statusCreatedBy: "admin",
  },
  {
    statusUniqueId: uuidv4(),
    statusName: "inactive - driver must upload documents",
    statusDescription: " driver must upload documents",
  },
  {
    statusUniqueId: uuidv4(),
    statusName: "inactive - driver awaiting admin verification",
    statusDescription:
      "The driver's documents have been submitted but still require admin verification before the driver can be activated.",
  },
  {
    statusUniqueId: uuidv4(),
    statusName: "inactive - admin rejected user documents",
    statusDescription:
      "The document attached by user is in approprate and rejected by admin.",
  },
  {
    statusUniqueId: uuidv4(),
    statusName: "inactive - passenger",
    statusDescription:
      "This status occurs when a passenger is suspended by an admin.",
  },
  {
    statusUniqueId: uuidv4(),
    statusName: "inactive - admin",
    statusDescription:
      "This status occurs when an admin suspends another admin user.",
  },
  {
    statusUniqueId: uuidv4(),
    statusName: "suspended - driver",
    statusDescription:
      "The driver has been suspended due to misconduct or violation of policies while on duty.",
  },
  {
    statusUniqueId: uuidv4(),
    statusName: "insufficient account balance",
    statusDescription:
      "The driver has been suspended due to insufficient balance in their account.",
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
      " Proof of ownership or right to use the vehicle for rideshare services. It confirms the vehicle is legally registered.",
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
module.exports = {
  driversDocumentRequirement,
  listOfDocuments,
  roleList,
  statusList,
};
