/* eslint-disable max-lines */
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("./CurrentDate");

const usersRoles = {
  shipperRoleId: 1,
  driverRoleId: 2,
  adminRoleId: 3,
  vehicleOwnerRoleId: 4,
  systemRoleId: 5,
  supperAdminRoleId: 6,
  companyAdminRoleId: 7,
  companyRoleId: 8, // entity role — for company document requirements
  vehicleRoleId: 9, // entity role — for vehicle document requirements
  dispatcherRoleId: 10, // company dispatcher — manages fleet dispatch
};
const usersRolesList = {
  shipper: { roleId: 1, roleName: "shipper" },
  driver: { roleId: 2, roleName: "driver" },
  admin: { roleId: 3, roleName: "admin" },
  vehicleOwner: { roleId: 4, roleName: "vehicle owner" },
  system: { roleId: 5, roleName: "system" },
  supperAdmin: { roleId: 6, roleName: "supper admin" },
  companyAdmin: { roleId: 7, roleName: "CompanyAdmin" },
  company: { roleId: 8, roleName: "company" },
  vehicle: { roleId: 9, roleName: "vehicle" },
  dispatcher: { roleId: 10, roleName: "Dispatcher" },
};
const roleList = [
  {
    roleId: 1,
    roleUniqueId: uuidv4(),
    roleName: "Shipper",
    roleDescription: "a person who can make order to driver to load goods",
    roleCreatedAt: currentDate(),
  },
  {
    roleId: 2,
    roleUniqueId: uuidv4(),
    roleName: "Driver",
    roleDescription: "a person who can recive order from shipper to load goods",
    roleCreatedAt: currentDate(),
  },
  {
    roleId: 3,
    roleUniqueId: uuidv4(),
    roleName: "Admin",
    roleDescription: "a person who can manage the system, driver and shipper",
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
      "a person who can manage drivers shippers and admins using api requests",
    roleCreatedAt: currentDate(),
  },
  {
    roleId: 7,
    roleUniqueId: uuidv4(),
    roleName: "CompanyAdmin",
    roleDescription:
      "A person who manages their company fleet, bids on requests, and assigns drivers.",
    roleCreatedAt: currentDate(),
  },
  {
    roleId: 8,
    roleUniqueId: uuidv4(),
    roleName: "company",
    roleDescription:
      "Entity role for transport companies. Used to define and verify company-level document requirements (TIN, trade license, etc.).",
    roleCreatedAt: currentDate(),
  },
  {
    roleId: 9,
    roleUniqueId: uuidv4(),
    roleName: "vehicle",
    roleDescription:
      "Entity role for vehicles. Used to define and verify vehicle-level document requirements (insurance, roadworthiness certificate, etc.).",
    roleCreatedAt: currentDate(),
  },
  {
    roleId: 10,
    roleUniqueId: uuidv4(),
    roleName: "Dispatcher",
    roleDescription:
      "A company dispatcher who manages fleet assignments, monitors vehicle availability, and coordinates driver schedules on behalf of the company.",
    roleCreatedAt: currentDate(),
  },
];
/**
 * User Status ID Constants
 * Maps human-readable status names to their corresponding database status IDs.
 * Use these constants instead of magic numbers for better code readability and maintainability.
 *
 * @example
 * // ✅ Good - using constant
 * if (statusId === USER_STATUS.ACTIVE) { ... }
 *
 * // ❌ Bad - using magic number
 * if (statusId === 1) { ... }
 */
const USER_STATUS = {
  ACTIVE: 1,
  INACTIVE_VEHICLE_NOT_REGISTERED: 2,
  INACTIVE_REQUIRED_DOCUMENTS_MISSING: 3,
  INACTIVE_DOCUMENTS_REJECTED: 4,
  INACTIVE_DOCUMENTS_PENDING: 5,
  INACTIVE_USER_IS_BANNED_BY_ADMIN: 6,
  INACTIVE_DRIVER_DOESN_T_HAVE_A_SUBSCRIPTION: 7,
  ACCOUNT_DELETED: 8,
};
const statusList = [
  // 1. Active (vehicle registered + all required documents accepted)
  {
    statusId: 1,
    statusUniqueId: uuidv4(),
    statusName: "active",
    statusDescription:
      "Driver has registered a vehicle and all required documents are accepted. Driver is active. if user is not driver, it is shipper or admin and it is active",
    statusCreatedAt: currentDate(),
  },
  // 2. No vehicle registered (overrides other states)
  {
    statusId: 2,
    statusUniqueId: uuidv4(),
    statusName: "inactive - vehicle not registered",
    statusDescription: "Driver has not registered a vehicle.",
    statusCreatedAt: currentDate(),
  },
  // 3. Not attached documents (some required docs missing)
  {
    statusId: 3,
    statusUniqueId: uuidv4(),
    statusName: "inactive - required documents missing",
    statusDescription: "Driver has not attached all required documents.",
    statusCreatedAt: currentDate(),
  },
  // 4. Rejected (any rejected document exists)
  {
    statusId: 4,
    statusUniqueId: uuidv4(),
    statusName: "inactive - documents rejected",
    statusDescription: "One or more required documents have been rejected.",
    statusCreatedAt: currentDate(),
  },
  // 5. Pending (any pending, none rejected)
  {
    statusId: 5,
    statusUniqueId: uuidv4(),
    statusName: "inactive - documents pending",
    statusDescription:
      "One or more required documents are pending review to be seen and approved by admin.",
    statusCreatedAt: currentDate(),
  },
  // 6. Banned (kept for administrative actions)
  {
    statusId: 6,
    statusUniqueId: uuidv4(),
    statusName: "inactive - User is banned by admin",
    statusDescription:
      "User is banned by admin when it commits some crimes or brake rules",
    statusCreatedAt: currentDate(),
  },
  // subscription
  {
    statusId: 7,
    statusUniqueId: uuidv4(),
    statusName: "inactive - Driver doesn't have a subscription",
    statusDescription:
      "Driver is banned by the system when they don't have a subscription",
    statusCreatedAt: currentDate(),
  },
  // 8. Account deleted (user requested or admin deleted)
  {
    statusId: 8,
    statusUniqueId: uuidv4(),
    statusName: "inactive - account deleted",
    statusDescription:
      "User account has been deleted and can no longer access the service",
    statusCreatedAt: currentDate(),
  },
];

const vehicleStatusTypes = [
  {
    VehicleStatusTypeId: 1,
    VehicleStatusTypeName: "active",
    statusTypeDescription:
      "When   Vehicle are active and ready to be used by drivers.",
  },
  {
    VehicleStatusTypeId: 2,
    VehicleStatusTypeName: "inactive",
    statusTypeDescription:
      "When   Vehicle are inactive and not ready to be used by drivers.",
  },
  {
    VehicleStatusTypeId: 3,
    VehicleStatusTypeName: "deleted",
    statusTypeDescription: "When   Vehicle are deleted by the admin.",
  },
  {
    VehicleStatusTypeId: 4,
    VehicleStatusTypeName: "suspended",
    statusTypeDescription: "When   Vehicle are suspended by the admin.",
  },
  {
    VehicleStatusTypeId: 5,
    VehicleStatusTypeName: "rejected",
    statusTypeDescription: "When   Vehicle are rejected by the admin.",
  },
  {
    VehicleStatusTypeId: 6,
    VehicleStatusTypeName: "reserved by other driver",
    statusTypeDescription: "when other driver has reserved the vehicle",
  },
];

const listOfVehicleStatusTypes = vehicleStatusTypes;
const companyRoles = {
  ownerUniqueId: "57898801-e280-4020-9178-f5122fe6bec9",
  managerUniqueId: "57e8b851-dceb-4423-99e0-eb9b2b4f9d81",
  dispatcherUniqueId: "750858d6-e816-45b0-a088-9dfe6b4d80ff",
  driverUniqueId: "b7ab7faa-0c76-45e2-a973-ecf4478e9ece",
};

const companyRoleList = [
  {
    companyRoleUniqueId: companyRoles.ownerUniqueId,
    companyRoleName: "owner",
    companyRoleDescription: "Top level access to company management.",
  },
  {
    companyRoleUniqueId: companyRoles.managerUniqueId,
    companyRoleName: "manager",
    companyRoleDescription: "Can manage members and fleet.",
  },
  {
    companyRoleUniqueId: companyRoles.dispatcherUniqueId,
    companyRoleName: "dispatcher",
    companyRoleDescription: "Manages assignments and bids.",
  },
  {
    companyRoleUniqueId: companyRoles.driverUniqueId,
    companyRoleName: "driver",
    companyRoleDescription: "Associated driver member of the company.",
  },
];
const VEHICLE_STATUS_TYPES = {
  ACTIVE: 1,
  INACTIVE: 2,
  DELETED: 3,
  SUSPENDED: 4,
  REJECTED: 5,
  RESERVED_BY_OTHER_DRIVER: 6,
};

const listOfDocuments = [
  {
    isExpirationDateRequired: true,
    documentTypeName: "Driver’s License",
    documentTypeDescription:
      " A valid and unexpired driver’s license. The admin needs this to ensure the driver is legally permitted to operate a vehicle.",
  },
  {
    isExpirationDateRequired: false,
    documentTypeName: " Vehicle Registration (librea)",
    documentTypeDescription:
      "Proof of ownership or right to use the vehicle for ride share services. It confirms the vehicle is legally registered.",
  },
  {
    isExpirationDateRequired: true,
    documentTypeName: "Insurance Document",
    documentTypeDescription:
      "Proof of insurance coverage, ensuring that the driver and shippers are protected in the event of an accident.",
  },
  {
    isExpirationDateRequired: false,
    documentTypeName: "Profile Photo",
    documentTypeDescription:
      "Profile Photo is used to identify current face of user",
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
  {
    isExpirationDateRequired: true,
    documentTypeName: "Business License",
    documentTypeDescription:
      "A valid business license for the transport company, verifying legal operational status.",
  },
  {
    isExpirationDateRequired: true,
    documentTypeName: "Commercial Registration",
    documentTypeDescription:
      "Official commercial registration document for the legal entity.",
  },
  {
    isExpirationDateRequired: true,
    documentTypeName: "Tax Registration (TIN) Certificate",
    documentTypeDescription:
      "Official tax identification number certificate for the company.",
  },
  {
    isExpirationDateRequired: false,
    documentTypeName: "Company Logo",
    documentTypeDescription:
      "Official logo of the transport company, used for branding and identification in the platform.",
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
  businessLicense: 8,
  commercialRegistration: 9,
  taxRegistrationCertificate: 10,
  companyLogo: 11, // typeId 11 — company branding document
};

const driversDocumentRequirement = [
  // Driver personal documents only.
  // Vehicle-level docs (librea typeId=2, insurance typeId=3)
  // are now in vehicleDocumentRequirement (roleId=9).
  {
    roleId: "2",
    documentTypeId: "1",
    documentTypeName: "Driver’s License",
    isDocumentMandatory: true,
    isExpirationDateRequired: true,
    isFileNumberRequired: true,
  },
  {
    roleId: "2",
    documentTypeId: "4",
    documentTypeName: "Profile Photo",
    isDocumentMandatory: true,
    isExpirationDateRequired: false,
    isFileNumberRequired: false,
  },
];
// document type and id to shipper/shipper
const shipperDocumentRequirement = [
  // profile images
  {
    roleId: 1,
    documentTypeId: 4,
    documentTypeName: "Profile Photo",
    isDocumentMandatory: false,
    isExpirationDateRequired: false,
  },
  // national id
  {
    roleId: 1,
    documentTypeId: 7,
    documentTypeName: "National ID",
    isDocumentMandatory: false,
    isExpirationDateRequired: false,
  },
];

// Company entity document requirements (roleId 8 — 'company' entity role)
// These are attached via POST /api/company/attachDocuments/:companyUniqueId
const companyDocumentRequirement = [
  {
    roleId: 8, // company entity role (NOT companyAdmin user role)
    documentTypeId: 8,
    documentTypeName: "Business License",
    isDocumentMandatory: true,
    isExpirationDateRequired: true,
    isFileNumberRequired: true,
  },
  {
    roleId: 8,
    documentTypeId: 9,
    documentTypeName: "Commercial Registration",
    isDocumentMandatory: true,
    isExpirationDateRequired: true,
    isFileNumberRequired: true,
  },
  {
    roleId: 8,
    documentTypeId: 10,
    documentTypeName: "Tax Registration (TIN) Certificate",
    isDocumentMandatory: true,
    isExpirationDateRequired: true,
    isFileNumberRequired: true,
  },
  {
    roleId: 8,
    documentTypeId: 11,
    documentTypeName: "Company Logo",
    isDocumentMandatory: false, // optional — nice to have but not blocking
    isExpirationDateRequired: false,
    isFileNumberRequired: false,
  },
];

// Vehicle entity document requirements (roleId 9 — 'vehicle' entity role)
// These are attached via POST /api/vehicle/attachDocuments/:vehicleUniqueId
const vehicleDocumentRequirement = [
  {
    roleId: 9,
    documentTypeId: 3,
    documentTypeName: "Insurance Document",
    isDocumentMandatory: true,
    isExpirationDateRequired: true,
    isFileNumberRequired: true,
  },
  {
    roleId: 9,
    documentTypeId: 2,
    documentTypeName: "Vehicle Registration (librea)",
    isDocumentMandatory: true,
    isExpirationDateRequired: false,
    isFileNumberRequired: true,
  },
];

// CompanyAdmin user document requirements (roleId 7)
// National ID is mandatory to verify the identity of company admins.
const companyAdminDocumentRequirement = [
  {
    roleId: 7,
    documentTypeId: 7,
    documentTypeName: "National ID",
    isDocumentMandatory: true,
    isExpirationDateRequired: false,
    isFileNumberRequired: true,
  },
  {
    roleId: 7,
    documentTypeId: 4,
    documentTypeName: "Profile Photo",
    isDocumentMandatory: false,
    isExpirationDateRequired: false,
    isFileNumberRequired: false,
  },
];

// Dispatcher user document requirements (roleId 10)
// National ID + Profile Photo required for fleet dispatcher identity.
const dispatcherDocumentRequirement = [
  {
    roleId: 10,
    documentTypeId: 7,
    documentTypeName: "National ID",
    isDocumentMandatory: true,
    isExpirationDateRequired: false,
    isFileNumberRequired: true,
  },
  {
    roleId: 10,
    documentTypeId: 4,
    documentTypeName: "Profile Photo",
    isDocumentMandatory: true,
    isExpirationDateRequired: false,
    isFileNumberRequired: false,
  },
];

const vehicleTypes = [
  // ── Light & Medium — open flatbed/curtain trucks, bulk cargo only ──────────
  {
    vehicleTypeName: "Light Truck (up to 35 Quintal)",
    carryingCapacity: 35,
    cargoType: "bulk_only", // open/flatbed, no container fittings
    vehicleTypeDescription:
      "Small/light freight truck for bulk cargo up to 35 quintal. Cannot carry ISO containers.",
    createdAt: null,
    updatedAt: null,
  },
  {
    vehicleTypeName: "Medium Truck (up to 50 Quintal)",
    carryingCapacity: 50,
    cargoType: "bulk_only",
    vehicleTypeDescription:
      "Medium freight truck for bulk cargo up to 50 quintal. Cannot carry ISO containers.",
    createdAt: null,
    updatedAt: null,
  },
  {
    vehicleTypeName: "Medium Truck (up to 100 Quintal)",
    carryingCapacity: 100,
    cargoType: "bulk_only",
    vehicleTypeDescription:
      "Medium freight truck for bulk cargo up to 100 quintal. Cannot carry ISO containers.",
    createdAt: null,
    updatedAt: null,
  },
  // ── Heavy — flatbed trucks that can also accept ISO containers ────────────
  {
    vehicleTypeName: "Heavy Truck (125–175 Quintal)",
    carryingCapacity: 175,
    cargoType: "both", // flatbed: bulk load OR a 20ft container
    vehicleTypeDescription:
      "Heavy truck for loads 125–175 quintal. Accepts bulk cargo or a single 20ft ISO container.",
    createdAt: null,
    updatedAt: null,
  },
  {
    vehicleTypeName: "Extra Heavy Truck (176–250 Quintal)",
    carryingCapacity: 250,
    cargoType: "both", // flatbed: bulk load OR containers
    vehicleTypeDescription:
      "Extra-heavy truck for loads 176–250 quintal. Accepts bulk cargo or ISO containers.",
    createdAt: null,
    updatedAt: null,
  },
  // ── Container trucks — fitted with cassoni; bulk or container ─────────────
  {
    vehicleTypeName: "20ft Container Truck (251–300 Quintal)",
    carryingCapacity: 300,
    cargoType: "both", // cassoni truck: bulk or 20ft container
    vehicleTypeDescription:
      "Container truck with 20ft cassoni fitting for loads 251–300 quintal. Accepts bulk cargo or a 20ft ISO container.",
    createdAt: null,
    updatedAt: null,
  },
  // ── Specialised multi-container rigs — containers ONLY ───────────────────
  {
    vehicleTypeName: "2×20ft or 40ft Low-Bed Truck (301–350 Quintal)",
    carryingCapacity: 350,
    cargoType: "container_only", // specialised low-bed multi-axle rig
    vehicleTypeDescription:
      "Specialised low-bed container rig for 301–350 quintal. Carries either 2 × 20ft OR 1 × 40ft ISO containers ",
    createdAt: null,
    updatedAt: null,
  },
  {
    vehicleTypeName: "2×20ft or 40ft Container Truck (351–400 Quintal)",
    carryingCapacity: 400,
    cargoType: "container_only", // specialised multi-axle container rig
    vehicleTypeDescription:
      "Specialised multi-container truck for 351–400 quintal. Carries either 2 × 20ft OR 1 × 40ft ISO containers  ",
    createdAt: null,
    updatedAt: null,
  },
];
const journeyStatus = [
  {

    journeyStatusId: 1,
    journeyStatusName: "waiting",
    journeyStatusDescription:
      "Initial state when a shipper creates a transport request, waiting for drivers to respond and accept.",
  },
  {
    journeyStatusId: 2,
    journeyStatusName: "requested",
    journeyStatusDescription:
      "A shipper request has been sent or forwarded to a driver. The driver has received the request but has not yet responded.",
  },
  {
    journeyStatusId: 3,
    journeyStatusName: "acceptedByDriver",
    journeyStatusDescription:
      "Driver has accepted the shipper request and provided their bidding price. At this point, a JourneyDecision record is created, linking the driver and shipper request.",
  },
  {
    journeyStatusId: 4,
    journeyStatusName: "acceptedByShipper",
    journeyStatusDescription:
      "Shipper has selected one driver from multiple drivers who accepted the request. This occurs when multiple drivers accepted (status 3), and the shipper chooses one driver's offer.",
  },
  {
    journeyStatusId: 5,
    journeyStatusName: "journeyStarted",
    journeyStatusDescription:
      "The actual journey has been initiated by the driver. This occurs after the shipper has accepted the driver (status 4), and the driver begins the transportation.",
  },
  {
    journeyStatusId: 6,
    journeyStatusName: "journeyCompleted",
    journeyStatusDescription:
      "The journey has been successfully completed by the driver. The transportation service has been fully delivered.",
  },
  {
    journeyStatusId: 7,
    journeyStatusName: "cancelledByShipper",
    journeyStatusDescription:
      "Shipper has cancelled the entire transport request. This cancellation affects all drivers who were involved, and the entire shipment is cancelled.",
  },
  {
    journeyStatusId: 8,
    journeyStatusName: "rejectedByShipper",
    journeyStatusDescription:
      "Shipper has rejected a specific driver's offer after the driver accepted the request (status 3). This rejection only affects the specific driver that was rejected, and the shipper can still select other drivers who accepted the request.",
  },
  {
    journeyStatusId: 9,
    journeyStatusName: "cancelledByDriver",
    journeyStatusDescription:
      "Driver canceled the request after accepting it and providing their bidding price. This occurs after the driver has committed to participate in the bid (status 3 - acceptedByDriver), meaning a JourneyDecision record exists. The driver withdraws their commitment, which can happen at any point after acceptance, including before or after the shipper selects a driver, or even after the journey has started.",
  },
  {
    journeyStatusId: 10,
    journeyStatusName: "cancelledByAdmin",
    journeyStatusDescription:
      "Admin has cancelled the request. This administrative cancellation can occur at various stages of the journey lifecycle.",
  },
  {
    journeyStatusId: 11,
    journeyStatusName: "completedByAdmin",
    journeyStatusDescription:
      "Admin has manually marked the journey as completed. This administrative action is used when a journey needs to be marked as completed through administrative intervention.",
  },
  {
    journeyStatusId: 12,
    journeyStatusName: "cancelledBySystem",
    journeyStatusDescription:
      "System has automatically cancelled the request. This can occur due to system-level rules, timeout conditions, or other automated cancellation scenarios.",
  },
  {
    journeyStatusId: 13,
    journeyStatusName: "noAnswerFromDriver",
    journeyStatusDescription:
      "Driver did not respond to the incoming request within the expected time. The request is then automatically forwarded to another available driver.",
  },
  {
    journeyStatusId: 14,
    journeyStatusName: "notSelectedInBid",
    journeyStatusDescription:
      "Driver had accepted the shipper request (status 3) and participated in the bid process, but the shipper selected a different driver. The driver's offer was not chosen during the bid selection.",
  },
  {
    journeyStatusId: 15,
    journeyStatusName: "rejectedByDriver",
    journeyStatusDescription:
      "Driver rejected the incoming shipper request before accepting it. This occurs at the initial request stage (status 2 - requested), meaning the driver never accepted the request, did not provide a bidding price, and no JourneyDecision record was created. The driver declined participation in the bid process from the start.",
  },
  {
    journeyStatusId: 16,
    journeyStatusName: "replacedByCompanyAssignment",
    journeyStatusDescription:
      "The individual driver-shipper connection was automatically replaced because a transport company assigned this driver to a company-managed freight job. The individual ShipperRequest is returned to the waiting pool and the driver's new JourneyDecision is linked to the company assignment. This is a system-level status with clear intent — company assignments take priority over individual matches.",
  },
  {
    journeyStatusId: 17,
    journeyStatusName: "partiallyCancelled",
    journeyStatusDescription:
      "A company freight batch was partially cancelled by the shipper. One or more vehicle slots were cancelled while others had already completed their journey or are still in transit. The batch remains open for the active/completed slots. This status applies only to ShipperRequestBatch records — individual ShipperRequest rows within the batch keep their own terminal status (journeyCompleted or cancelledByShipper).",
  },
];
const journeyStatusMap = {
  waiting: 1,
  requested: 2,
  acceptedByDriver: 3,
  // accept oly one driver request but others are not selected so they will have notSelectedInBid status
  acceptedByShipper: 4,
  journeyStarted: 5,
  journeyCompleted: 6,
  // cancel all shipment
  cancelledByShipper: 7,
  // reject one driver request but others are not selected so they will have either acceptedByShipper if they willbe selected or   notSelectedInBid status or rejectedByDriver if they will be rejected too
  rejectedByShipper: 8,
  // driver cancelled the request after accepting it and providing their bidding price
  cancelledByDriver: 9,
  // admin cancelled the request
  cancelledByAdmin: 10,
  // admin manually marked the journey as completed
  completedByAdmin: 11,
  // system cancelled the request
  cancelledBySystem: 12,
  // driver did not respond to the incoming request within the expected time. The request is then automatically forwarded to another available driver.
  noAnswerFromDriver: 13,
  //driver accepted the request and provided bidding price but not selected during bid selection process
  notSelectedInBid: 14,
  // driver rejected incoming call before accepting it
  rejectedByDriver: 15,
  // individual link replaced because company assigned this driver to a company freight job
  replacedByCompanyAssignment: 16,
  // batch partially cancelled — some slots cancelled, others completed or still active
  partiallyCancelled: 17,
};
// these are active because they can be used to check if it is active or not
const activeJourneyStatuses = [
  journeyStatusMap.waiting,
  journeyStatusMap.requested,
  journeyStatusMap.acceptedByDriver,
  journeyStatusMap.acceptedByShipper,
  journeyStatusMap.journeyStarted,
];

// Cancellation reasons are tagged with `requestMode` to serve the right list
// in the right context:
//   'individual' → single driver-to-shipper request (street pickup style)
//   'company'    → company freight / batch request (fleet logistics)
//   'both'       → applies in both contexts
//
// roleId key:
//   1 = Shipper  (the one who posted the cargo request)
//   2 = Driver   (the one who accepts the trip)
//   3 = Admin    (system / call-center override)
const cancellationReasons = [

  // ══════════════════════════════════════════════════════════════════════════
  //  SHIPPER reasons (roleId: 1)
  //  The shipper is cancelling a job they posted.
  //  Individual reasons = about one driver. Company reasons = about the fleet.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Individual only (requestMode: 'individual') ───────────────────────────
  // Shown ONLY on individual_target jobs (one driver, one truck)
  { cancellationReason: "Driver arrived too late to the pickup location", roleId: 1, requestMode: "individual" },
  { cancellationReason: "Driver did not come to my location at all", roleId: 1, requestMode: "individual" },
  { cancellationReason: "Found an available driver directly on the road", roleId: 1, requestMode: "individual" },
  { cancellationReason: "Driver's vehicle did not match the listed type", roleId: 1, requestMode: "individual" },
  { cancellationReason: "Driver was rude or behaved unprofessionally", roleId: 1, requestMode: "individual" },
  { cancellationReason: "Driver's vehicle appeared unsafe or in poor condition", roleId: 1, requestMode: "individual" },
  { cancellationReason: "Driver demanded more money than the agreed price", roleId: 1, requestMode: "individual" },
  { cancellationReason: "Driver was not answering calls or messages", roleId: 1, requestMode: "individual" },
  { cancellationReason: "Driver refused to go to the agreed destination", roleId: 1, requestMode: "individual" },
  { cancellationReason: "Driver did not have the proper loading equipment", roleId: 1, requestMode: "individual" },
  { cancellationReason: "Driver's bid price was too high compared to other drivers", roleId: 1, requestMode: "individual" },

  // ── Company only (requestMode: 'company') ─────────────────────────────────
  // Shown ONLY on company_target jobs (bulk fleet, 10+ trucks)
  { cancellationReason: "Company did not assign vehicles within the agreed time", roleId: 1, requestMode: "company" },
  { cancellationReason: "Company provided fewer vehicles than agreed in the batch", roleId: 1, requestMode: "company" },
  { cancellationReason: "Assigned vehicles did not meet the cargo weight or type requirements", roleId: 1, requestMode: "company" },
  { cancellationReason: "Drivers assigned by the company were unqualified or unlicensed", roleId: 1, requestMode: "company" },
  { cancellationReason: "Company did not respond after the bid was accepted", roleId: 1, requestMode: "company" },
  { cancellationReason: "Company demanded changes to price or terms after acceptance", roleId: 1, requestMode: "company" },
  { cancellationReason: "Company's fleet was unavailable on the agreed shipping date", roleId: 1, requestMode: "company" },
  { cancellationReason: "Company representative was unreachable after bid acceptance", roleId: 1, requestMode: "company" },
  { cancellationReason: "Company dispatched vehicles to the wrong pickup location", roleId: 1, requestMode: "company" },
  { cancellationReason: "Company's vehicles were not clean or prepared for cargo", roleId: 1, requestMode: "company" },
  { cancellationReason: "Company's insurance or documentation was found to be invalid", roleId: 1, requestMode: "company" },
  { cancellationReason: "Decided to split the cargo and use individual drivers instead", roleId: 1, requestMode: "company" },
  { cancellationReason: "Company's bid price was too high for the full batch", roleId: 1, requestMode: "company" },
  { cancellationReason: "Company did not have enough vehicles for the entire batch", roleId: 1, requestMode: "company" },

  // ── Both (requestMode: 'both') ─────────────────────────────────────────────
  // Shown in both individual and company modes
  { cancellationReason: "Cargo no longer needs to be transported — plans changed", roleId: 1, requestMode: "both" },
  { cancellationReason: "Found a significantly better price elsewhere", roleId: 1, requestMode: "both" },
  { cancellationReason: "Entered incorrect pickup or destination location", roleId: 1, requestMode: "both" },
  { cancellationReason: "Shipping date or schedule changed", roleId: 1, requestMode: "both" },
  { cancellationReason: "Cargo details were entered incorrectly (wrong type, weight, or quantity)", roleId: 1, requestMode: "both" },
  { cancellationReason: "Cargo was sold or transferred to someone else before shipment", roleId: 1, requestMode: "both" },
  { cancellationReason: "Recipient at the destination is unavailable to receive the goods", roleId: 1, requestMode: "both" },
  { cancellationReason: "Government or customs clearance issue delayed the shipment", roleId: 1, requestMode: "both" },
  { cancellationReason: "I posted this request by mistake", roleId: 1, requestMode: "both" },
  { cancellationReason: "Weather conditions are not suitable for transport", roleId: 1, requestMode: "both" },
  { cancellationReason: "Road or route to the destination is closed or blocked", roleId: 1, requestMode: "both" },
  { cancellationReason: "Safety concerns about the vehicle or route", roleId: 1, requestMode: "both" },
  { cancellationReason: "Cargo packaging was not ready in time", roleId: 1, requestMode: "both" },
  { cancellationReason: "Financial or payment arrangement fell through", roleId: 1, requestMode: "both" },

  // ══════════════════════════════════════════════════════════════════════════
  //  DRIVER reasons (roleId: 2)
  //  Driver cancels after accepting a bid.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Individual only ───────────────────────────────────────────────────────
  { cancellationReason: "Shipper was not at the agreed pickup location", roleId: 2, requestMode: "individual" },
  { cancellationReason: "Shipper was unresponsive to calls and messages", roleId: 2, requestMode: "individual" },
  { cancellationReason: "Shipper requested a route or road I cannot take", roleId: 2, requestMode: "individual" },
  { cancellationReason: "Cargo was heavier or larger than described in the request", roleId: 2, requestMode: "individual" },
  { cancellationReason: "Shipper was disrespectful, rude, or threatening", roleId: 2, requestMode: "individual" },
  { cancellationReason: "Shipper tried to change the destination after I accepted", roleId: 2, requestMode: "individual" },
  { cancellationReason: "Shipper refused to pay the agreed amount", roleId: 2, requestMode: "individual" },

  // ── Company only ───────────────────────────────────────────────────────────
  { cancellationReason: "Company dispatcher assigned me the wrong route or location", roleId: 2, requestMode: "company" },
  { cancellationReason: "Loading dock or warehouse was not ready when I arrived", roleId: 2, requestMode: "company" },
  { cancellationReason: "Cargo details did not match what was described in the contract", roleId: 2, requestMode: "company" },
  { cancellationReason: "I was reassigned to a different batch by my company", roleId: 2, requestMode: "company" },
  { cancellationReason: "Company's loading staff were not available at the site", roleId: 2, requestMode: "company" },

  // ── Both ───────────────────────────────────────────────────────────────────
  { cancellationReason: "Vehicle breakdown or mechanical issue", roleId: 2, requestMode: "both" },
  { cancellationReason: "Personal or family emergency", roleId: 2, requestMode: "both" },
  { cancellationReason: "Safety concern at pickup or delivery location", roleId: 2, requestMode: "both" },
  { cancellationReason: "Incorrect pickup location was given in the request", roleId: 2, requestMode: "both" },
  { cancellationReason: "Accepted this request by mistake", roleId: 2, requestMode: "both" },

  // ══════════════════════════════════════════════════════════════════════════
  //  ADMIN / SYSTEM reasons (roleId: 3)
  // ══════════════════════════════════════════════════════════════════════════
  { cancellationReason: "Cancelled due to app or system technical issue", roleId: 3, requestMode: "both" },
  { cancellationReason: "Route or road unavailable due to weather or official closure", roleId: 3, requestMode: "both" },
  { cancellationReason: "Driver account suspended during an active request", roleId: 3, requestMode: "both" },
  { cancellationReason: "Company account suspended during an active batch", roleId: 3, requestMode: "company" },
  { cancellationReason: "Fraud or platform policy violation detected", roleId: 3, requestMode: "both" },
  { cancellationReason: "Duplicate request detected by the system", roleId: 3, requestMode: "both" },
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
const TariffRateList = [
  {
    tariffRateId: 1,
    tariffRateName: "Standard",
    standingTariffRate: 100,
    journeyTariffRate: 25,
    timingTariffRate: 10,
    tariffRateDescription: "some descriptions ",
    tariffRateEffectiveDate: "2026-01-01",
    tariffRateExpirationDate: "2030-01-01",
  },

  {
    tariffRateId: 2,
    tariffRateName: "Premium",
    standingTariffRate: 150,
    journeyTariffRate: 45,
    timingTariffRate: 30,
    tariffRateDescription: "some descriptions ",
    tariffRateEffectiveDate: "2026-01-01",
    tariffRateExpirationDate: "2030-01-01",
  },
];

const CommissionRates = [
  {
    commissionRateUniqueId: "default-rate",
    commissionRate: 0.1,
    commissionRateEffectiveDate: "2029-01-01",
    commissionRateExpirationDate: "2030-01-01",
    commissionRateDeletedAt: null,
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
    durationInDays: 30,
  },
  {
    planName: "One month",
    isFree: false,
    durationInDays: 30,
  },
  {
    planName: "Three Months",
    isFree: false,
    durationInDays: 90,
  },
  {
    planName: "One Year",
    isFree: false,
    durationInDays: 365,
  },
];
const savedSubscriptionPlanLists = {};
const subscriptionPlanPricingLists = [
  {
    subscriptionPlanUniqueId:
      savedSubscriptionPlanLists?.[0]?.subscriptionPlanUniqueId,
    price: 700,
    durationInDays: 30,
    effectiveFrom: currentDate(),
  },
  {
    subscriptionPlanUniqueId:
      savedSubscriptionPlanLists?.[1]?.subscriptionPlanUniqueId,
    price: 700,
    durationInDays: 30,
    effectiveFrom: currentDate(),
  },
  {
    subscriptionPlanUniqueId:
      savedSubscriptionPlanLists?.[2]?.subscriptionPlanUniqueId,
    price: 1800,
    durationInDays: 90,
    effectiveFrom: currentDate(),
  },
  {
    subscriptionPlanUniqueId:
      savedSubscriptionPlanLists?.[3]?.subscriptionPlanUniqueId,
    price: 6000,
    durationInDays: 365,
    effectiveFrom: currentDate(),
  },
];
const depositSources = [
  {
    sourceKey: "Driver",
    sourceLabel: "when drivers make direct deposit to there account",
  },

  {
    sourceKey: "Bonus",
    sourceLabel: "When one driver make direct transfer to other driver",
  },
];
const commissionStatusList = [
  {
    statusName: "REQUESTED",
    description: "Commission requested by the system/admin",
    effectiveFrom: currentDate(),
    effectiveTo: null,
  },
  {
    statusName: "PENDING",
    description: "Commission calculated but not yet paid",
    effectiveFrom: currentDate(),
    effectiveTo: null,
  },
  {
    statusName: "PAID",
    description: "Commission successfully paid",
    effectiveFrom: currentDate(),
    effectiveTo: null,
  },
  {
    statusName: "FREE",
    description: "Commission waived or free tier",
    effectiveFrom: currentDate(),
    effectiveTo: null,
  },
  {
    statusName: "CANCELED",
    description: "Commission canceled",
    effectiveFrom: currentDate(),
    effectiveTo: null,
  },
];

const listOfDelinquenciesTypes = [
  {
    delinquencyTypeName: "late arrival of driver",
    delinquencyTypeDescription: "Driver late arrival",
    delinquencyTypeId: 1,
    defaultPoints: 1,
    defaultSeverity: "LOW",
    applicableRoles: "Driver",
    isActive: true,
    createdAt: currentDate(),
  },
  {
    delinquencyTypeName: "rude behavior of driver",
    delinquencyTypeDescription: "Driver rude behavior",
    delinquencyTypeId: 2,
    defaultPoints: 1,
    defaultSeverity: "LOW",
    applicableRoles: "Driver",
    isActive: true,
    createdAt: currentDate(),
  },
  {
    delinquencyTypeName: "late departure of driver",
    delinquencyTypeDescription: "Driver late departure",
    delinquencyTypeId: 3,
    defaultPoints: 1,
    defaultSeverity: "LOW",
    applicableRoles: "Driver",
    isActive: true,
    createdAt: currentDate(),
  },
  {
    delinquencyTypeName: "rude behavior of shipper",
    delinquencyTypeDescription: "Shipper rude behavior",
    delinquencyTypeId: 4,
    defaultPoints: 1,
    defaultSeverity: "LOW",
    applicableRoles: "shipper",
    isActive: true,
    createdAt: currentDate(),
  },
  {
    delinquencyTypeName: "late departure of shipper",
    delinquencyTypeDescription: "Shipper late departure",
    delinquencyTypeId: 5,
    defaultPoints: 1,
    defaultSeverity: "LOW",
    applicableRoles: "shipper",
    isActive: true,
    createdAt: currentDate(),
  },
  {
    delinquencyTypeName: "Goods not delivered",
    delinquencyTypeDescription: "Goods not delivered",
    delinquencyTypeId: 6,
    defaultPoints: 1,
    defaultSeverity: "LOW",
    applicableRoles: "Driver",
    isActive: true,
    createdAt: currentDate(),
  },
  {
    delinquencyTypeName: "Payments not made",
    delinquencyTypeDescription: "Payments not made to driver by shipper",
    delinquencyTypeId: 7,
    defaultPoints: 1,
    defaultSeverity: "LOW",
    applicableRoles: "shipper",
    isActive: true,
    createdAt: currentDate(),
  },
  // ── Commission evasion ─────────────────────────────────────────────────────
  // Driver or company cancels/rejects a job AFTER agreeing — bypassing commission.
  // High points so 1st offense crosses the 20-point MEDIUM ban threshold instantly.
  {
    delinquencyTypeName: "Driver commission evasion",
    delinquencyTypeDescription:
      "Driver rejected or cancelled a freight job after accepting a bid, " +
      "bypassing platform commission. This is a HIGH severity violation.",
    delinquencyTypeId: 8,
    defaultPoints: 25, // ← crosses 20-pt (3-day) on 1st offense; 50-pt (30-day) on 2nd
    defaultSeverity: "HIGH",
    duplicateCheckWindowHours: 1, // same job cannot be reported twice within 1h
    applicableRoles: "Driver",
    isActive: true,
    createdAt: currentDate(),
  },
  {
    delinquencyTypeName: "Company commission evasion",
    delinquencyTypeDescription:
      "A transport company rejected or cancelled a freight job after the bid " +
      "was accepted by the shipper, bypassing platform commission. HIGH severity violation.",
    delinquencyTypeId: 9,
    defaultPoints: 30, // ← instantly triggers 7-day HIGH ban on 1st offense (30 total)
    defaultSeverity: "HIGH",
    duplicateCheckWindowHours: 1,
    applicableRoles: "CompanyAdmin",
    isActive: true,
    createdAt: currentDate(),
  },
];

const CANCELED_JOURNEY_CONTEXTS = {
  PASSENGER_REQUEST: "ShipperRequest",
  DRIVER_REQUEST: "DriverRequest",
  JOURNEY_DECISIONS: "JourneyDecisions",
  JOURNEY: "Journey",
};
module.exports = {
  CANCELED_JOURNEY_CONTEXTS,
  listOfDelinquenciesTypes,
  listOfVehicleStatusTypes,
  depositSources,
  subscriptionPlanLists,
  financialInstitutionAccount,
  listOfDocumentsTypeAndId,
  activeJourneyStatuses,
  journeyStatusMap,
  vehicleStatusTypes,
  CommissionRates,
  TariffRateList,
  paymentMethod,
  paymentStatus,
  cancellationReasons,
  journeyStatus,
  vehicleTypes,
  driversDocumentRequirement,
  listOfDocuments,
  usersRolesList,
  roleList,
  statusList,
  usersRoles,
  shipperDocumentRequirement,
  companyAdminDocumentRequirement,
  dispatcherDocumentRequirement,
  subscriptionPlanPricingLists,
  commissionStatusList,
  USER_STATUS,
  VEHICLE_STATUS_TYPES,
  companyRoles,
  companyRoleList,
  companyDocumentRequirement,
  vehicleDocumentRequirement,
};
