// Resilience when a JourneyDecision outlives its ShipperRequest.
//
// A ShipperRequest row can be hard-deleted while the JourneyDecision that
// points at it survives (observed in the dev database: 53 dangling decisions,
// e.g. shipperRequestId 16). Both driver-facing entry points resolve the shipper
// through that reference:
//
//   GET /api/driver/verifyDriverJourneyStatus
//     → handleExistingJourney → fetchJourneyNotificationData
//   PUT /api/driver/cancelDriverRequest
//     → inline ShipperRequest⋈Users lookup
//
// Both used to throw AppError 404, which is a dead end for the driver: the
// journey-status call 404s on every poll, and the cancel call 404s too, so the
// request can never be cleared. Both already had a graceful branch written for
// exactly this case — they just never ran, because the helper threw first.
//
// These tests pin the degrade-instead-of-throw contract.

jest.mock("../CRUD/Read/ReadData", () => ({
  ...jest.requireActual("../CRUD/Read/ReadData"),
  performJoinSelect: jest.fn(),
  getData: jest.fn(),
}));

jest.mock("../CRUD/Create/CreateData", () => ({
  ...jest.requireActual("../CRUD/Create/CreateData"),
  insertData: jest.fn(),
}));

jest.mock("../CRUD/Update/Data.update", () => ({
  ...jest.requireActual("../CRUD/Update/Data.update"),
  updateData: jest.fn(),
}));

jest.mock("../Services/JourneyDecisions.service", () => ({
  ...jest.requireActual("../Services/JourneyDecisions.service"),
  getJourneyDecisionByJourneyDecisionUniqueId: jest.fn(),
}));

jest.mock("../Utils/AppError", () => {
  const actual = jest.requireActual("../Utils/AppError");
  return { __esModule: true, default: actual };
});

const { performJoinSelect } = require("../CRUD/Read/ReadData");
const { fetchJourneyNotificationData } = require("../Services/DriverRequest/helpers");

const JOURNEY_DECISION = {
  journeyDecisionId: 4,
  journeyDecisionUniqueId: "jd-uniq-4",
  shipperRequestId: 16,
  driverRequestId: 4,
  journeyStatusId: 4,
};

const DRIVER_REQUEST = {
  driverRequestId: 4,
  driverRequestUniqueId: "dr-uniq-4",
  userUniqueId: "driver-uniq",
  journeyStatusId: 4,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("fetchJourneyNotificationData with a missing ShipperRequest row", () => {
  it("resolves with a shipper-less payload instead of throwing 404", async () => {
    // The join comes back empty — the row the decision points at is gone.
    performJoinSelect.mockResolvedValue([]);

    const result = await fetchJourneyNotificationData(
      JOURNEY_DECISION.journeyDecisionUniqueId,
      [DRIVER_REQUEST],
      { vehicleUniqueId: "veh-1" },
      [JOURNEY_DECISION],
    );

    expect(result).not.toBeNull();
    expect(result.shipperRequest).toBeNull();
    // Both callers branch on this exact pair to take their graceful path.
    expect(result.message).toBe("error");
  });

  it("still returns the journey decision so the caller can self-cancel it", async () => {
    performJoinSelect.mockResolvedValue([]);

    const result = await fetchJourneyNotificationData(
      JOURNEY_DECISION.journeyDecisionUniqueId,
      [DRIVER_REQUEST],
      { vehicleUniqueId: "veh-1" },
      [JOURNEY_DECISION],
    );

    // handleExistingJourney passes journeyDecisionUniqueId to
    // updateJourneyStatus; without it the driver stays wedged.
    expect(result.journeyDecision.journeyDecisionUniqueId).toBe(
      JOURNEY_DECISION.journeyDecisionUniqueId,
    );
  });

  it("does not touch the shipper row at all after detecting it is missing", async () => {
    performJoinSelect.mockResolvedValue([]);

    await fetchJourneyNotificationData(
      JOURNEY_DECISION.journeyDecisionUniqueId,
      [DRIVER_REQUEST],
      { vehicleUniqueId: "veh-1" },
      [JOURNEY_DECISION],
    );

    // Exactly one lookup: the one that came back empty. The batch/profile
    // follow-up queries must not run against a row we know is gone.
    expect(performJoinSelect).toHaveBeenCalledTimes(1);
  });

  it("still resolves normally when the ShipperRequest row is present", async () => {
    performJoinSelect.mockResolvedValue([
      {
        shipperRequestId: 16,
        shipperRequestUniqueId: "sr-uniq-16",
        userUniqueId: "shipper-uniq",
        phoneNumber: "+251900000001",
        requestMode: "individual_target",
      },
    ]);

    const result = await fetchJourneyNotificationData(
      JOURNEY_DECISION.journeyDecisionUniqueId,
      [DRIVER_REQUEST],
      { vehicleUniqueId: "veh-1" },
      [JOURNEY_DECISION],
    );

    expect(result.shipperRequest).toMatchObject({ shipperRequestId: 16 });
    expect(result.shipperRequest.phoneNumber).toBe("+251900000001");
  });
});