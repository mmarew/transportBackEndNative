// Auto-enrollment of bid winners into the queue yard (see
// Services/DriverQueue/lifecycle.service.js → autoEnrollBidWinner).
//
// A driver who wins a bid WITHOUT ever holding a queue row — the offer came
// from the distance matcher / bidding board while they stood outside every line
// — must still get a queue row stamped `agreed` carrying a yard
// `loadingOrderNumber`, otherwise the yard board cannot show what they load and
// the per-org+day number sequence skips a truck.
//
// These tests drive autoEnrollBidWinner with a scripted executor so every fence
// branch is covered without the heavy org/vehicle/shipper fixtures the E2E
// suite needs. The end-to-end happy path lives in
// E2ETests/Queue/BidBasePlacement.js (QBB-05).

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

// Only the vehicle resolver is stubbed; the constants (LIVE_ENTRY_STATUSES,
// JOB_STATUSES), today(), nextLoadingNumber and logQueueHistory stay real so the
// fences are exercised against the production values. lifecycle.service
// destructures this at import time, so the stub must exist before it loads —
// configure the shared jest.fn in beforeEach instead of spying later.
jest.mock("../Services/DriverQueue/helpers", () => ({
  ...jest.requireActual("../Services/DriverQueue/helpers"),
  resolveLatestActiveVehicleDriverForUser: jest.fn(),
  // The history pre-image read hits the ambient pool; the real INSERT goes
  // through createData, which is also pool-backed. Neither is under test here.
  logQueueHistory: jest.fn(),
}));

jest.mock("../CRUD/Update/Data.update", () => ({
  ...jest.requireActual("../CRUD/Update/Data.update"),
  updateData: jest.fn(),
}));

const { updateData } = require("../CRUD/Update/Data.update");

// db() is the ambient transaction executor. Same destructuring constraint:
// mock the module up front, then point the shared jest.fn at a scripted
// executor per test.
jest.mock("../Services/CompanyHelper.service", () => ({
  ...jest.requireActual("../Services/CompanyHelper.service"),
  db: jest.fn(),
}));

const {
  insertQueueEntryRow,
} = require("../Services/DriverQueue/checkin.service");
const { checkout } = require("../Services/DriverQueue/position.service");
const { emitQueueSnapshot } = require("../Utils/QueueSocket");
const { db } = require("../Services/CompanyHelper.service");
const { resolveLatestActiveVehicleDriverForUser } = require("../Services/DriverQueue/helpers");
const { autoEnrollBidWinner } = require("../Services/DriverQueue/lifecycle.service");

const QUEUE_STATUS = {
  WAITING: 1,
  REQUESTED: 2,
  AGREED: 3,
  GO_TO_LOADING_PLACE: 5,
  LOADING: 6,
  LOADED: 7,
  JOURNEY_STARTED: 8,
  JOURNEY_COMPLETED: 9,
  SHIPPER_CANCELED: 10,
  CANCELLED_AFTER_ACCEPT: 12,
  NO_ANSWER_FROM_DRIVER: 16,
  CANCELLED_BEFORE_ACCEPT: 18,
};

const ORG = "org-under-test";
const OTHER_ORG = "org-elsewhere";
const DRIVER = "driver-uuid";
const SHIPPER = "shipper-uuid";
const ORDER = "order-uuid";
const ACTOR = "queue-admin-uuid";
const VEHICLE_DRIVER = "vehicle-driver-uuid";
const VEHICLE_TYPE = "vehicle-type-uuid";

// Scripted stand-in for the transaction executor. `liveEntries` drives the
// one-queue-per-day fence; `loadingMax` drives the yard-number sequence.
const makeExecutor = ({ liveEntries = [], loadingMax = 0 } = {}) => {
  const calls = [];
  const executor = {
    calls,
    query: jest.fn(async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("AS shipperUserUniqueId")) {
        return [[{ queueOrganizationUniqueId: ORG, shipperUserUniqueId: SHIPPER }]];
      }
      if (sql.includes("AS nextNumber")) {
        return [[{ nextNumber: loadingMax + 1 }]];
      }
      if (sql.includes("FROM DriverQueue dq") && sql.includes("FOR UPDATE")) {
        return [liveEntries];
      }
      throw new Error(`Unexpected SQL in autoEnrollBidWinner:\n${sql}`);
    }),
  };
  return executor;
};

const liveEntry = (overrides = {}) => ({
  queueId: 1,
  queueUniqueId: "q-1",
  queueOrganizationUniqueId: ORG,
  status: QUEUE_STATUS.WAITING,
  shipperRequestUniqueId: null,
  ...overrides,
});

const run = (executor, extra = {}) =>
  autoEnrollBidWinner({
    executor,
    shipperRequestUniqueId: ORDER,
    driverUserUniqueId: DRIVER,
    queueOrganizationUniqueId: ORG,
    actorUserUniqueId: ACTOR,
    ...extra,
  });

beforeEach(() => {
  resolveLatestActiveVehicleDriverForUser.mockResolvedValue({
    vehicleDriverUniqueId: VEHICLE_DRIVER,
    vehicleTypeUniqueId: VEHICLE_TYPE,
    driverUserUniqueId: DRIVER,
  });
  insertQueueEntryRow.mockResolvedValue({
    queueUniqueId: "created-queue-uuid",
    queueNumber: 7,
    duplicate: false,
  });
});

describe("autoEnrollBidWinner", () => {
  it("creates an agreed entry with a yard number when the driver holds no queue row", async () => {
    const executor = makeExecutor({ loadingMax: 4 });

    const result = await run(executor);

    expect(result).toMatchObject({
      queueUniqueId: "created-queue-uuid",
      queueNumber: 7,
      loadingOrderNumber: 5,
    });
    expect(checkout).not.toHaveBeenCalled();

    // Written straight to AGREED: a transient WAITING row would count the
    // winner in everyone else's waitingAhead between insert and update.
    expect(insertQueueEntryRow).toHaveBeenCalledTimes(1);
    const args = insertQueueEntryRow.mock.calls[0][0];
    expect(args.status).toBe(QUEUE_STATUS.AGREED);
    expect(args.historyEvent).toBe("auto_enrolled");
    expect(args.loadingOrderNumber).toBe(5);
    expect(args.shipperRequestUniqueId).toBe(ORDER);
    expect(args.queueOrganizationUniqueId).toBe(ORG);
    expect(args.targetedShipperUserUUID).toBe(SHIPPER);
    expect(args.vehicleDriver.vehicleTypeUniqueId).toBe(VEHICLE_TYPE);
    expect(args.createdBy).toBe(ACTOR);
    // Accept is an admin-side action — there is no driver GPS to record.
    expect(args.driverLatitude).toBeNull();
    expect(args.driverLongitude).toBeNull();

    expect(emitQueueSnapshot).toHaveBeenCalledWith({
      queueOrganizationUniqueId: ORG,
      queueDate: expect.any(String),
    });
  });

  it("resolves the winning org from the order when the caller does not supply it", async () => {
    const executor = makeExecutor();

    const result = await run(executor, { queueOrganizationUniqueId: null });

    expect(result.queueUniqueId).toBe("created-queue-uuid");
    expect(insertQueueEntryRow.mock.calls[0][0].queueOrganizationUniqueId).toBe(ORG);
  });

  it("refuses to enroll a driver who already holds a job in another org", async () => {
    const executor = makeExecutor({
      liveEntries: [
        liveEntry({
          queueOrganizationUniqueId: OTHER_ORG,
          status: QUEUE_STATUS.LOADING,
          shipperRequestUniqueId: "another-order",
        }),
      ],
    });

    await expect(run(executor)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("already on an active job"),
    });
    expect(insertQueueEntryRow).not.toHaveBeenCalled();
    expect(checkout).not.toHaveBeenCalled();
  });

  it("refuses to enroll a driver holding a job in the winning org too", async () => {
    const executor = makeExecutor({
      liveEntries: [
        liveEntry({
          status: QUEUE_STATUS.AGREED,
          shipperRequestUniqueId: "another-order",
        }),
      ],
    });

    await expect(run(executor)).rejects.toMatchObject({ statusCode: 409 });
    expect(insertQueueEntryRow).not.toHaveBeenCalled();
  });

  it("checks out a live position in another org before enrolling", async () => {
    const executor = makeExecutor({
      liveEntries: [liveEntry({ queueOrganizationUniqueId: OTHER_ORG })],
    });

    const result = await run(executor);

    expect(checkout).toHaveBeenCalledWith(OTHER_ORG, { userUniqueId: DRIVER });
    expect(result.checkedOutOrganizationUniqueId).toBe(OTHER_ORG);
    expect(insertQueueEntryRow).toHaveBeenCalledTimes(1);
  });

  it("does not check out a stale terminal row — only live entries are fenced on", async () => {
    // A driver who finished a job earlier today keeps a terminal row. It must
    // not trigger a checkout; they simply join the new org's queue.
    const executor = makeExecutor();

    await run(executor);

    expect(checkout).not.toHaveBeenCalled();
    expect(insertQueueEntryRow).toHaveBeenCalledTimes(1);
  });

  it("refuses when the driver has no active vehicle to number", async () => {
    resolveLatestActiveVehicleDriverForUser.mockResolvedValue(null);
    const executor = makeExecutor();

    await expect(run(executor)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("no active vehicle"),
    });
    expect(insertQueueEntryRow).not.toHaveBeenCalled();
  });

  // The entry is born AGREED with the order attached, so the accept instant has
  // to be stamped on insert. A normal check-in leaves agreedAt NULL because it
  // only agrees later, in linkQueueEntryOnAccept.
  it("stamps agreedAt when inserting an already-agreed entry", async () => {
    const executor = makeExecutor({ loadingMax: 4 });
    await run(executor);
    const args = insertQueueEntryRow.mock.calls[0][0];
    expect(args.status).toBe(3);
    expect(args.agreedAt).toEqual(expect.any(String));
    expect(args.agreedAt).not.toBeNull();
  });

  // ER_DUP_ENTRY means the (org, date, vehicleType, queueNumber) key lost a race
  // and NO row was written. Returning success would hand the caller a
  // queueUniqueId that does not exist and commit a job with no yard row.
  it("surfaces a lost numbering race as a conflict instead of a phantom row", async () => {
    const executor = makeExecutor({ loadingMax: 4 });
    insertQueueEntryRow.mockResolvedValueOnce({
      queueUniqueId: "never-inserted",
      queueNumber: 7,
      duplicate: true,
    });
    const error = await run(executor).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(409);
  });

  it("refuses when the order is not a queue order", async () => {
    const executor = makeExecutor();
    executor.query = jest.fn(async (sql) => {
      if (sql.includes("AS shipperUserUniqueId")) {
        return [[{ queueOrganizationUniqueId: null, shipperUserUniqueId: SHIPPER }]];
      }
      throw new Error(`Unexpected SQL:\n${sql}`);
    });

    await expect(
      run(executor, { queueOrganizationUniqueId: null }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(insertQueueEntryRow).not.toHaveBeenCalled();
  });
});

describe("markEntryAgreed auto-enrollment wiring", () => {
  it("routes a bid winner with no entry through auto-enrollment", async () => {
    const lifecycle = require("../Services/DriverQueue/lifecycle.service");
    // No linked entry and no live own entry → the auto-enrollment branch.
    // autoEnrollBidWinner is called as a local reference inside the module, so
    // assert on its observable effect (the row written) rather than a spy.
    db.mockReturnValue(makeExecutor({ liveEntries: [] }));

    const result = await lifecycle.markEntryAgreed({
      shipperRequestUniqueId: ORDER,
      userUniqueId: DRIVER,
      bidOrder: true,
      queueOrganizationUniqueId: ORG,
      actorUserUniqueId: ACTOR,
    });

    expect(result).toMatchObject({
      updated: true,
      autoEnrolled: true,
      queueUniqueId: "created-queue-uuid",
      loadingOrderNumber: 1,
    });
    expect(insertQueueEntryRow).toHaveBeenCalledWith(
      expect.objectContaining({
        queueOrganizationUniqueId: ORG,
        status: QUEUE_STATUS.AGREED,
        shipperRequestUniqueId: ORDER,
        createdBy: ACTOR,
      }),
    );
  });

  it("still marks a linked entry agreed without auto-enrolling", async () => {
    const lifecycle = require("../Services/DriverQueue/lifecycle.service");
    const executor = makeExecutor();
    // The linked-entry lookup returns this row; the status filter is applied in
    // SQL in production, so the fake simply returns a REQUESTED holder.
    executor.query = jest.fn(async (sql) => {
      if (sql.includes("AS nextNumber")) return [[{ nextNumber: 1 }]];
      if (sql.includes("FROM DriverQueue dq")) {
        return [
          [
            {
              queueId: 5,
              queueUniqueId: "linked-queue-uuid",
              queueOrganizationUniqueId: ORG,
              queueDate: "2026-01-01",
              status: QUEUE_STATUS.REQUESTED,
              loadingOrderNumber: null,
              driverUserUniqueId: DRIVER,
            },
          ],
        ];
      }
      throw new Error(`Unexpected SQL:\n${sql}`);
    });
    db.mockReturnValue(executor);

    const result = await lifecycle.markEntryAgreed({
      shipperRequestUniqueId: ORDER,
      userUniqueId: DRIVER,
      bidOrder: true,
      queueOrganizationUniqueId: ORG,
    });

    expect(result.autoEnrolled).toBeUndefined();
    // Regression guard: a driver who DID hold a linked entry keeps that row —
    // no second row is synthesized and no cross-org checkout is triggered.
    expect(insertQueueEntryRow).not.toHaveBeenCalled();
    expect(checkout).not.toHaveBeenCalled();
    expect(updateData).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "DriverQueue",
        conditions: { queueId: 5 },
        updateValues: expect.objectContaining({
          status: QUEUE_STATUS.AGREED,
          shipperRequestUniqueId: ORDER,
          loadingOrderNumber: 1,
        }),
      }),
    );
  });
});