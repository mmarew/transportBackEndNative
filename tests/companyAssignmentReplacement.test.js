// P6 — driver replacement flow unit coverage (docs/driver-replacement-plan.md).
//
// 1. driverRequestMustStartFresh — the one-decision-per-DR fence.
//    JourneyDecisions.driverRequestId is UNIQUE (schema/06_driver_orders.js:50),
//    so a DriverRequest carries at most ONE decision for its whole life. A fresh
//    assignment must never adopt a dead decision (replace path stamped the new
//    assignment with a cancelled journey) or one that belongs to another slot
//    (pre-existing `POST /assignments/auto` 500 — ER_DUP_ENTRY).
//
// 2. Dashboard bucket SQL — 'reassigned' counts as assigned (same lifecycle
//    stage), a recall/cancel puts the slot into needsReassignment, and a slot
//    that never had a driver stays notAssigned.
//
// db() comes from CompanyHelper.service and is mocked so the assertions can
// inspect the exact SQL without a live MySQL (pattern pinned by
// companyAssignmentDecisionScoping.test.js).

jest.mock("../Services/CompanyHelper.service", () => ({
  ...jest.requireActual("../Services/CompanyHelper.service"),
  db: jest.fn(),
}));

// driver-request.service pulls in FCM + socket notification modules at require
// time. Neither is exercised here, and Firebase's admin init must stay out of
// the jest environment.
jest.mock("../Services/Firebase.service", () => ({
  sendFCMNotificationToUser: jest.fn(),
}));
jest.mock("../Utils/Notifications", () => ({
  sendSocketIONotificationToDriver: jest.fn(),
}));

const { db } = require("../Services/CompanyHelper.service");
const {
  driverRequestMustStartFresh,
} = require("../Services/CompanyAssignment/assignmentHelper/driver-request.service");
const { getCancellableSlots } = require("../Services/ShipperRequestBatch/batchRead.service");
const { getActiveRequestsCount } = require("../CRUD/Read/ReadData.shipper");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");

const SLOT_A = "sr-slot-a";
const SLOT_B = "sr-slot-b";

/** Stub the single linked-decision query driverRequestMustStartFresh issues. */
const linkedDecision = ({ journeyStatusId, shipperRequestUniqueId }) => {
  const query = jest.fn(async () => [
    shipperRequestUniqueId === undefined
      ? []
      : [
          {
            journeyDecisionUniqueId: "jd-linked",
            journeyStatusId,
            shipperRequestUniqueId,
          },
        ],
  ]);
  db.mockReturnValue({ query });
  return query;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("driverRequestMustStartFresh decision table", () => {
  const base = {
    existingUniqueId: "dr-1",
    existingStatus: journeyStatusMap.acceptedByShipper, // 4 — company-confirmed
  };

  it("false without slot context (single-driver / individual paths)", async () => {
    const query = linkedDecision({
      journeyStatusId: journeyStatusMap.cancelledByDriver,
      shipperRequestUniqueId: SLOT_A,
    });
    await expect(driverRequestMustStartFresh({ ...base })).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it("false when the DR has no linked decision at all", async () => {
    linkedDecision({ shipperRequestUniqueId: undefined });
    await expect(
      driverRequestMustStartFresh({ ...base, shipperRequestUniqueId: SLOT_A }),
    ).resolves.toBe(false);
  });

  it("false for rejectedByDriver — its own branch notifies the driver", async () => {
    linkedDecision({
      journeyStatusId: journeyStatusMap.requested,
      shipperRequestUniqueId: SLOT_A,
    });
    await expect(
      driverRequestMustStartFresh({
        ...base,
        existingStatus: journeyStatusMap.rejectedByDriver,
        shipperRequestUniqueId: SLOT_A,
      }),
    ).resolves.toBe(false);
  });

  it("false when the same slot's decision is still live (idempotent retry)", async () => {
    linkedDecision({
      journeyStatusId: journeyStatusMap.acceptedByShipper,
      shipperRequestUniqueId: SLOT_A,
    });
    await expect(
      driverRequestMustStartFresh({ ...base, shipperRequestUniqueId: SLOT_A }),
    ).resolves.toBe(false);
  });

  it("true when the same slot's decision is terminal (stale JD after cancel/recall)", async () => {
    linkedDecision({
      journeyStatusId: journeyStatusMap.cancelledByDriver,
      shipperRequestUniqueId: SLOT_A,
    });
    await expect(
      driverRequestMustStartFresh({ ...base, shipperRequestUniqueId: SLOT_A }),
    ).resolves.toBe(true);
  });

  it("false when another slot holds an ACTIVE INDIVIDUAL decision (delegated branch)", async () => {
    linkedDecision({
      journeyStatusId: journeyStatusMap.requested,
      shipperRequestUniqueId: SLOT_B,
    });
    await expect(
      driverRequestMustStartFresh({
        ...base,
        existingStatus: journeyStatusMap.requested,
        shipperRequestUniqueId: SLOT_A,
      }),
    ).resolves.toBe(false);
  });

  it("true when another slot holds the decision — the auto-assign ER_DUP_ENTRY case", async () => {
    linkedDecision({
      journeyStatusId: journeyStatusMap.cancelledByDriver,
      shipperRequestUniqueId: SLOT_B,
    });
    await expect(
      driverRequestMustStartFresh({ ...base, shipperRequestUniqueId: SLOT_A }),
    ).resolves.toBe(true);
  });

  it("true when another slot's decision is terminal even if the DR is individual-active", async () => {
    linkedDecision({
      journeyStatusId: journeyStatusMap.rejectedByDriver,
      shipperRequestUniqueId: SLOT_B,
    });
    await expect(
      driverRequestMustStartFresh({
        ...base,
        existingStatus: journeyStatusMap.requested,
        shipperRequestUniqueId: SLOT_A,
      }),
    ).resolves.toBe(true);
  });
});

describe("slotState bucket SQL (getCancellableSlots)", () => {
  const runSlotState = async (slotState) => {
    const query = jest.fn(async (sql) =>
      /AS total/i.test(sql) ? [[{ total: 0 }]] : [[]],
    );
    db.mockReturnValue({ query });
    await getCancellableSlots("batch-1", { slotState });
    // Whitespace-insensitive: the IN-lists wrap across lines in the source SQL.
    return query.mock.calls
      .map((call) => String(call[0]).replace(/\s+/g, ""))
      .join("\n");
  };

  const LEFT_HISTORY = "IN('cancelled_by_driver','cancelled_by_company','rejected_by_driver')";

  it("assigned bucket counts assigned AND reassigned rows", async () => {
    const sql = await runSlotState("assigned");
    expect(sql).toContain("IN('assigned','reassigned')");
  });

  it("needsReassignment fires for recalls and driver cancellations", async () => {
    const sql = await runSlotState("needsReassignment");
    expect(sql).toContain("ANDEXISTS(");
    expect(sql).toContain(LEFT_HISTORY);
  });

  it("notAssigned excludes every slot that ever had a driver", async () => {
    const sql = await runSlotState("notAssigned");
    expect(sql).toContain("NOTEXISTS(");
    expect(sql).toContain(LEFT_HISTORY);
  });
});

describe("company breakdown SQL (getActiveRequestsCount)", () => {
  it("assigned bucket includes reassigned; needsReassignment includes recalls", async () => {
    const connection = {
      query: jest.fn().mockResolvedValue([[{}], []]),
    };
    await getActiveRequestsCount("user-1", connection);

    const breakdown = connection.query.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => sql.includes("AS needsReassignment"));
    expect(breakdown).toBeDefined();

    const norm = breakdown.replace(/\s+/g, "");
    expect(norm).toContain("IN('assigned','reassigned')");
    expect(norm).toContain(
      "cba2.assignmentStatusIN('cancelled_by_driver','cancelled_by_company','rejected_by_driver')",
    );
    expect(norm).toContain("ASnotAssigned");
  });
});
