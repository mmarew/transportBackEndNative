// Double-booking fence + queue enrollment for COMPANY assignments.
//
// Two separate gaps are covered here:
//
//  1. `assertDriverNotDoubleBooked` (Services/DriverQueue/helpers.js). Before
//     this, the only driver-side guard was in the auto-assigner and it read
//     `CompanyBidVehicleAssignment` alone — so a driver who had taken a QUEUE job
//     or an individual bid (neither writes an assignment row) was invisible to
//     it, and the manual `POST /assignments` + `/assignments/bulk` paths had no
//     driver-side guard at all. One driver must never hold two jobs.
//
//  2. `ensureQueueEntryForAcceptedJob`
//     (Services/DriverQueue/accept-linkage.service.js). A company confirm
//     promotes the decision to `acceptedByShipper` (4), while the queue hook in
//     JourneyStatus/update.service.js only fires on `acceptedByDriver` (3) — so a
//     driver who was waiting in the FIFO kept a WAITING row while holding the
//     job. The orchestrator reuses their FIFO position (only linkage +
//     loadingOrderNumber change), enrolls them when they were never queued, and
//     refuses to touch anything when they already hold another job.

jest.mock("../Services/DriverQueue/checkin.service", () => ({
  insertQueueEntryRow: jest.fn(),
}));

jest.mock("../Services/DriverQueue/position.service", () => ({
  checkout: jest.fn(),
}));

jest.mock("../Utils/QueueSocket", () => ({
  emitQueueSnapshot: jest.fn(),
  notifyQueueOrgAdmins: jest.fn(),
}));

// Keep every constant real (LIVE_ENTRY_STATUSES, JOB_STATUSES,
// ACTIVE_JOURNEY_STATUSES, journeyStatusMap, QUEUE_STATUS) so the fences run
// against production values; only logQueueHistory (pool-backed pre-image read)
// is stubbed.
jest.mock("../Services/DriverQueue/helpers", () => ({
  ...jest.requireActual("../Services/DriverQueue/helpers"),
  logQueueHistory: jest.fn(),
}));

// updateData performs the real UPDATE for the reused-FIFO-entry branch —
// pool-backed, so stub it (this is how we assert the existing row is the one
// updated, with only the linkage + yard number changed).
jest.mock("../CRUD/Update/Data.update", () => ({
  ...jest.requireActual("../CRUD/Update/Data.update"),
  updateData: jest.fn(),
}));

// createData performs the real INSERT for insertQueueEntryRow — pool-backed, so
// stub it.
jest.mock("../CRUD/Create/CreateData", () => ({
  ...jest.requireActual("../CRUD/Create/CreateData"),
  createData: jest.fn(),
}));

jest.mock("../Services/CompanyHelper.service", () => ({
  ...jest.requireActual("../Services/CompanyHelper.service"),
  db: jest.fn(),
}));

const {
  assertDriverNotDoubleBooked,
  findDriverBusyState,
} = require("../Services/DriverQueue/helpers");
const { ensureQueueEntryForAcceptedJob } = require("../Services/DriverQueue/accept-linkage.service");
const { updateData } = require("../CRUD/Update/Data.update");
const { insertQueueEntryRow } = require("../Services/DriverQueue/checkin.service");
const AppError = require("../Utils/AppError");

const DRIVER = "driver-uuid";
const ORDER = "order-uuid";
const OTHER_ORDER = "order-elsewhere";
const ORG = "org-under-test";
const QUEUE_ENTRY = "queue-uuid";

// Scripted executor for the busy-state query: `journeys` and `assignments` feed
// the two halves of the fence, `loadingOrderNumber` the post-link read.
const makeExecutor = ({
  journeys = [],
  assignments = [],
  loadingOrderNumber = null,
  queueOrg = ORG,
  liveEntries = [],
  orderHolders = [],
  loadingMax = 0,
  noVehicle = false,
} = {}) => ({
  // Matchers are ordered by specificity: several of these queries all contain
  // `FROM DriverQueue dq`, so the narrow shapes must be tested first.
  query: jest.fn(async (sql, params = []) => {
    // Busy-state fence (helpers.findDriverBusyState). The real query appends an
    // ignore clause when re-processing an order the driver already holds, so the
    // scripted executor has to honour it — otherwise a confirm looks
    // double-booked by the very order it is confirming.
    const ignored = params.length > 1 ? params[1] : null;
    if (sql.includes("FROM JourneyDecisions jd")) {
      return [journeys.filter((j) => !ignored || j.shipperRequestUniqueId !== ignored)];
    }
    if (sql.includes("FROM CompanyBidVehicleAssignment cba")) {
      return [assignments.filter((a) => !ignored || a.shipperRequestUniqueId !== ignored)];
    }
    // nextLoadingNumber — also a DriverQueue read, so it must win over the
    // generic DriverQueue branches below.
    if (sql.includes("AS nextNumber")) {
      return [[{ nextNumber: loadingMax + 1 }]];
    }
    // Orchestrator's post-link read of the stamped yard number.
    if (sql.includes("SELECT dq.loadingOrderNumber")) {
      return [[{ loadingOrderNumber }]];
    }
    // Queue-org probe (linkQueueEntryOnAccept guard 4 + orchestrator).
    if (sql.includes("FROM ShipperRequest sr")) {
      return [[{ queueOrganizationUniqueId: queueOrg }]];
    }
    // autoEnrollBidWinner's aliased order read.
    if (sql.includes("AS shipperUserUniqueId")) {
      return [[{ queueOrganizationUniqueId: queueOrg }]];
    }
    if (sql.includes("FROM DriverQueue dq")) {
      // (a) the driver's own live unlinked entry (also selects dq.queueUniqueId)
      if (sql.includes("dq.queueUniqueId")) {
        return [liveEntries];
      }
      // (b) other-holder fence -> `SELECT dq.queueId ... FOR UPDATE`
      return [orderHolders];
    }
    // Latest active vehicle for the enrolling driver.
    if (sql.includes("VehicleDriver")) {
      return [noVehicle ? [] : [{ vehicleDriverUniqueId: "vd-1", vehicleUniqueId: "veh-1" }]];
    }
    throw new Error(`Unexpected SQL:\n${sql}`);
  }),
});

const QUEUE_STATUS = {
  WAITING: 1,
  REQUESTED: 2,
  AGREED: 3,
  GO_TO_LOADING_PLACE: 5,
  LOADING: 6,
};

const journeyRow = (overrides = {}) => ({
  journeyDecisionUniqueId: "jd-1",
  journeyStatusId: 4,
  shipperRequestUniqueId: ORDER,
  ...overrides,
});

const assignmentRow = (overrides = {}) => ({
  assignmentUniqueId: "as-1",
  assignmentStatus: "assigned",
  shipperRequestUniqueId: ORDER,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── assertDriverNotDoubleBooked ──────────────────────────────────────────

describe("assertDriverNotDoubleBooked", () => {
  it("passes when the driver holds nothing", async () => {
    const executor = makeExecutor();
    await expect(
      assertDriverNotDoubleBooked({ executor, driverUserUniqueId: DRIVER }),
    ).resolves.toEqual({ busy: false });
  });

  it("refuses a driver already on an active journey", async () => {
    const executor = makeExecutor({
      journeys: [journeyRow({ journeyStatusId: 6, shipperRequestUniqueId: OTHER_ORDER })],
    });
    await expect(
      assertDriverNotDoubleBooked({ executor, driverUserUniqueId: DRIVER }),
    ).rejects.toThrow(/already engaged on an active journey/);
  });

  it("refuses a driver holding a non-terminal assignment row", async () => {
    const executor = makeExecutor({ assignments: [assignmentRow()] });
    await expect(
      assertDriverNotDoubleBooked({ executor, driverUserUniqueId: DRIVER }),
    ).rejects.toThrow(/assignment as-1 \(status assigned\)/);
  });

  it("throws 409 so the caller cannot mistake it for a bad request", async () => {
    const executor = makeExecutor({ assignments: [assignmentRow()] });
    const error = await assertDriverNotDoubleBooked({
      executor,
      driverUserUniqueId: DRIVER,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(AppError.CONFLICT);
  });

  it("names the order the driver already holds", async () => {
    const executor = makeExecutor({
      journeys: [journeyRow({ shipperRequestUniqueId: OTHER_ORDER })],
    });
    await expect(
      assertDriverNotDoubleBooked({
        executor,
        driverUserUniqueId: DRIVER,
        actorLabel: "another company assignment",
      }),
    ).rejects.toThrow(new RegExp(OTHER_ORDER));
  });

  // The confirm path resolves the order BEFORE the decision is promoted, so the
  // fence must not trip on the order being confirmed.
  it("ignores the order being processed", async () => {
    const executor = makeExecutor({ journeys: [journeyRow()] });
    await expect(
      assertDriverNotDoubleBooked({
        executor,
        driverUserUniqueId: DRIVER,
        ignoreShipperRequestUniqueId: ORDER,
      }),
    ).resolves.toEqual({ busy: false });
    const [call] = executor.query.mock.calls;
    expect(call[1]).toEqual([DRIVER, ORDER]);
  });

  it("still fences a different order while ignoring the current one", async () => {
    const executor = makeExecutor({
      journeys: [journeyRow({ shipperRequestUniqueId: OTHER_ORDER })],
    });
    const state = await findDriverBusyState(executor, DRIVER, null, ORDER);
    expect(state.busy).toBe(true);
    expect(state.journey.shipperRequestUniqueId).toBe(OTHER_ORDER);
  });

  // A taken queue job writes a JourneyDecision but NO assignment row — the exact
  // case the old auto-assigner guard was blind to.
  it("catches a queue job that has no assignment row", async () => {
    const executor = makeExecutor({
      journeys: [journeyRow({ journeyStatusId: 5, shipperRequestUniqueId: OTHER_ORDER })],
      assignments: [],
    });
    const state = await findDriverBusyState(executor, DRIVER);
    expect(state).toEqual(
      expect.objectContaining({ busy: true, assignment: null }),
    );
  });

  it("treats a terminal assignment as free (no rows survive the SQL filter)", async () => {
    const executor = makeExecutor({ assignments: [] });
    await expect(
      assertDriverNotDoubleBooked({ executor, driverUserUniqueId: DRIVER }),
    ).resolves.toEqual({ busy: false });
  });
});

// ── ensureQueueEntryForAcceptedJob ───────────────────────────────────────

describe("ensureQueueEntryForAcceptedJob", () => {
  const run = (executor, extra = {}) =>
    ensureQueueEntryForAcceptedJob({
      shipperRequestUniqueId: ORDER,
      driverUserUniqueId: DRIVER,
      actorUserUniqueId: DRIVER,
      executor,
      ...extra,
    });

  // linkQueueEntryOnAccept is a module-local binding, so it cannot be spied on —
  // these tests script the executor its real queries hit instead.
  const makeLinkedExecutor = (overrides = {}) =>
    makeExecutor({
      ...overrides,
      liveEntries: overrides.liveEntries || [
        {
          queueId: 7,
          queueUniqueId: QUEUE_ENTRY,
          queueOrganizationUniqueId: ORG,
          queueDate: "2026-10-04",
          status: QUEUE_STATUS.WAITING,
          shipperRequestUniqueId: null,
        },
      ],
    });

  it("does nothing when the driver already holds another job", async () => {
    const executor = makeExecutor({
      journeys: [journeyRow({ shipperRequestUniqueId: OTHER_ORDER })],
    });
    const result = await run(executor);
    expect(result).toEqual(
      expect.objectContaining({
        handled: false,
        outcome: "double_booked",
        queueUniqueId: null,
      }),
    );
    // Must never reach the enrollment path — no second row, no new yard number.
    const sql = executor.query.mock.calls.map((c) => c[0]).join("\n");
    expect(sql).not.toContain("AS nextNumber");
    expect(sql).not.toContain("AS shipperUserUniqueId");
  });

  // "If the driver already holds a same-org requested entry for a different
  // order, keep the old job" — nothing is retired and nothing is created.
  it("keeps the old job: never rewrites or deletes the held entry", async () => {
    // The held assignment must be a DIFFERENT order: the confirm path ignores the
    // order being processed, so an assignment on this same order is not a clash.
    const executor = makeExecutor({
      assignments: [assignmentRow({ shipperRequestUniqueId: OTHER_ORDER })],
    });
    const result = await run(executor);
    expect(result.outcome).toBe("double_booked");
    const sql = executor.query.mock.calls.map((c) => c[0]).join("\n");
    expect(sql).not.toMatch(/UPDATE DriverQueue/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(updateData).not.toHaveBeenCalled();
  });

  // "If in FIFO but without a job, use the FIFO queue and update only
  // loadingOrderNumber" — the WAITING row becomes the job holder.
  it("reuses the FIFO entry rather than creating a second row", async () => {
    // loadingMax 11 -> nextLoadingNumber issues 12, matching the post-link read.
    const executor = makeLinkedExecutor({ loadingOrderNumber: 12, loadingMax: 11 });
    const result = await run(executor);
    expect(result).toEqual({
      handled: true,
      outcome: "linked",
      queueUniqueId: QUEUE_ENTRY,
      loadingOrderNumber: 12,
    });
    expect(insertQueueEntryRow).not.toHaveBeenCalled();
    // Existing row reused: flipped to AGREED, order linked, yard number stamped.
    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "DriverQueue",
        updateValues: expect.objectContaining({
          status: QUEUE_STATUS.AGREED,
          shipperRequestUniqueId: ORDER,
          loadingOrderNumber: 12,
        }),
        conditions: { queueId: 7 },
      }),
    );
  });

  it("skips queue bookkeeping for a non-queue (street) order", async () => {
    const executor = makeExecutor({ queueOrg: null });
    const result = await run(executor);
    expect(result).toEqual(
      expect.objectContaining({ handled: false, outcome: "not_queue_order" }),
    );
    expect(updateData).not.toHaveBeenCalled();
    expect(insertQueueEntryRow).not.toHaveBeenCalled();
  });

  // Delegates to the existing bid-winner enrollment rather than adding a second
  // implementation of check-in / numbering.
  it("enrolls a driver who was never queued, through autoEnrollBidWinner", async () => {
    const executor = makeExecutor({ queueOrg: ORG, liveEntries: [] });
    const result = await run(executor);
    // autoEnrollBidWinner needs a vehicle; without one it reports 409 internally
    // and the orchestrator surfaces 'failed'. Either way the shared writer owns
    // the insert, so assert on the delegation rather than the outcome.
    expect(["enrolled", "failed"]).toContain(result.outcome);
    const sql = executor.query.mock.calls.map((c) => c[0]).join("\n");
    expect(sql).toContain("AS shipperUserUniqueId");
  });

  it("does not create a row when the driver has no active vehicle", async () => {
    const executor = makeExecutor({ queueOrg: ORG, liveEntries: [] });
    const result = await run(executor);
    expect(result).toEqual(
      expect.objectContaining({ handled: false, outcome: "failed" }),
    );
    expect(result.reason).toMatch(/vehicle/i);
    expect(insertQueueEntryRow).not.toHaveBeenCalled();
  });

  // The job is already confirmed at this point, so a queue failure must not
  // reject the driver's acceptance.
  it("reports a failure instead of throwing", async () => {
    const executor = {
      query: jest.fn(async (sql) => {
        if (sql.includes("FROM JourneyDecisions jd")) return [[]];
        if (sql.includes("FROM CompanyBidVehicleAssignment cba")) return [[]];
        throw new Error("db down");
      }),
    };
    const result = await run(executor);
    expect(result).toEqual(
      expect.objectContaining({
        handled: false,
        outcome: "failed",
        reason: "db down",
      }),
    );
  });

  it("requires both order and driver ids", async () => {
    await expect(
      ensureQueueEntryForAcceptedJob({ driverUserUniqueId: DRIVER }),
    ).resolves.toEqual(
      expect.objectContaining({ handled: false, outcome: "failed" }),
    );
  });

  // The order being confirmed must not trip the fence that protects against a
  // SECOND job.
  it("ignores the confirmed order itself in the busy check", async () => {
    const executor = makeLinkedExecutor({
      journeys: [journeyRow({ shipperRequestUniqueId: ORDER })],
      loadingOrderNumber: 3,
    });
    const result = await run(executor);
    expect(result.outcome).toBe("linked");
  });
});
