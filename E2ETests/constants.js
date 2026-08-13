// E2E test constants — role IDs are inlined here to avoid importing
// Utils/ListOfSeedData.js which chains into Utils/CurrentDate.js and may
// trigger macOS com.apple.provenance EPERM errors at test startup.
const usersRoles = {
  shipperRoleId: 1,
  driverRoleId: 2,
  adminRoleId: 3,
  vehicleOwnerRoleId: 4,
  systemRoleId: 5,
  supperAdminRoleId: 6,
  companyAdminRoleId: 7,
  companyRoleId: 8,
  vehicleRoleId: 9,
  dispatcherRoleId: 10,
  queueOrgAdminRoleId: 11,
};

// Journey status IDs — mirror of Utils/ListOfSeedData.js journeyStatusMap.
// Inlined here for the same reason as usersRoles (see comment at top of this
// file) so E2E flows can drive/assert the journey state machine by name.
// Reference: E2ETests/MAGIC_NUMBERS.md §1.
const journeyStatusMap = {
  waiting: 1,
  requested: 2,
  acceptedByDriver: 3,
  acceptedByShipper: 4,
  goToLoadingPlace: 5,
  loading: 6,
  loaded: 7,
  journeyStarted: 8,
  journeyCompleted: 9,
  cancelledByShipper: 10,
  rejectedByShipper: 11,
  cancelledByDriver: 12,
  cancelledByAdmin: 13,
  completedByAdmin: 14,
  cancelledBySystem: 15,
  noAnswerFromDriver: 16,
  notSelectedInBid: 17,
  rejectedByDriver: 18,
  replacedByCompanyAssignment: 19,
  partiallyCancelled: 20,
};

// Cancellation reason type IDs (CancellationReasonsType.cancellationReasonsTypeId).
// Auto-increment — values depend on seed order of Utils/ListOfSeedData.js
// cancellationReasons, so treat as fragile. Names describe the E2E flow.
// Reference: E2ETests/MAGIC_NUMBERS.md §3.
const cancellationReasonsType = {
  driverCancel: 2,
  shipperWholeJobCancel: 6,
};

// Query value for "mark seen / list driver cancellation notifications".
// Reference: E2ETests/MAGIC_NUMBERS.md §5.
const seenStatusNotSeenByDriver = "not seen by driver yet";

// User status IDs — mirror of Utils/ListOfSeedData.js USER_STATUS.
// Reference: E2ETests/MAGIC_NUMBERS.md §4.
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

const backendURL = "http://127.0.0.1:3000";

// Unique run identifier — makes phone numbers and emails unique per test run
// so multiple runs can coexist in the same database without conflicts.
const runId = String(Date.now()).slice(-6);

const usersData = {
  driver: {
    fullName: "Test User",
    email: `testdriver+${runId}@test.com`,
    phoneNumber: `+25199${runId}1`,
    roleId: usersRoles.driverRoleId,
    OTP: 101010,
    documentAndVehicleOfDriver: null,
    token: null,
    accountData: null,
  },
  shipper: {
    fullName: "Test Shipper",
    email: `testshipper+${runId}@test.com`,
    phoneNumber: `+25198${runId}2`,
    roleId: usersRoles.shipperRoleId,
    OTP: 101010,
    token: null,
  },
  admin: {
    fullName: "Test Admin",
    email: `testadmin+${runId}@test.com`,
    phoneNumber: `+25197${runId}3`,
    roleId: usersRoles.adminRoleId,
    statusId: 1,
    OTP: 101010,
    token: null,
  },
  companyAdmin: {
    fullName: "Test Company Admin",
    email: `testcompanyadmin+${runId}@test.com`,
    phoneNumber: `+25196${runId}4`,
    roleId: usersRoles.companyAdminRoleId,
    OTP: 101010,
    token: null,
    bids: {
      availableBids: null,
      submitted: null,
      companies: null,
      accepted_by_shipper: null,
      acceptedByCompanyBids: null,
      rejected_by_shipper: null,
      cancelled_by_company: null,
    },
  },
  // System (role 5) — pre-seeded by the backend (createTables → createUserSystem)
  // for programmatic jobs (automated rejections, expiry warnings, etc.).
  // Never created via API; verified + logged in like supperAdmin.
  systemAdmin: {
    fullName: "System",
    email: "system@system.com",
    phoneNumber: "+251922112480",
    roleId: usersRoles.systemRoleId,
    OTP: 101010,
    token: null,
  },
  // Queue organization admin (role 11) — manages the dispatch queue.
  queueOrgAdmin: {
    fullName: "Queue Org Admin",
    email: `queueorgadmin+${runId}@test.com`,
    phoneNumber: `+25194${runId}9`,
    roleId: usersRoles.queueOrgAdminRoleId,
    OTP: 101010,
    token: null,
  },
  supperAdmin: {
    fullName: "Test Supper Admin",
    email: "supperAdmin@supperAdmin.com",
    phoneNumber: "+251983222221", // Fixed — pre-seeded in the database
    roleId: usersRoles.supperAdminRoleId,
    OTP: 101010,
  },
  token: null,
  company: {
    companyName: `company-a-${runId}`,
    companyRegistrationNumber: `no-aa3a-${Date.now()}`,
    companyPhone: `+25195${runId}5`,
    companyEmail: `companya+${Date.now()}@gmail.com`,
    companyAddress: "Addis Ababa",
  },
};
const unAuthorizedDriver = { driver: null };
const shipperRequestStatusData = { data: null };
const userToken = {
  driver: undefined,
  shipper: undefined,
  admin: undefined,
  companyAdmin: undefined,
};
const listOfDelinquencyTypes = { data: null };
const listOfRoles = { data: null };
const listOfPlanPricing = { data: null };
module.exports = {
  listOfPlanPricing,
  listOfRoles,
  listOfDelinquencyTypes,
  userToken,
  backendURL,
  usersData,
  unAuthorizedDriver,
  shipperRequestStatusData,
  runId,
  usersRoles,
  journeyStatusMap,
  cancellationReasonsType,
  seenStatusNotSeenByDriver,
  USER_STATUS,
};
