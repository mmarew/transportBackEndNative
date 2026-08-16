"use strict";

/**
 * Unit tests for Services/Journey/journeyRead/getJourneysWithPodStatus.service.js —
 * filter-based, paginated GET of deliveries (journeys) with their single POD.
 *
 *  1. podStatus=NONE  → journeys with no delivery confirmation ("not proofed")
 *  2. podStatus=CONFIRMED/PENDING → filter on the confirmation status
 *  3. Driver scoped by userUniqueId=self; shipper scoped to their own requests
 *  4. Company admin/dispatcher scoped to the company's targeted shipments
 *  5. Admin sees everything, optionally narrowed to one owner
 *  6. Paginated; one POD row per journey
 */

const mockPool = { query: jest.fn() };

jest.mock("../Middleware/Database.config", () => ({ pool: mockPool }));

const {
  getJourneysWithPodStatus,
} = require("../Services/Journey/journeyRead/getJourneysWithPodStatus.service");
const AppError = require("../Utils/AppError");

const selectCalls = () =>
  mockPool.query.mock.calls.filter(([sql]) =>
    typeof sql === "string" && sql.includes("LIMIT ? OFFSET ?"),
  );

const lastSelect = () =>
  selectCalls()[selectCalls().length - 1];

const row = (overrides = {}) => ({
  journeyUniqueId: "j-1",
  journeyStatusId: 9,
  journeyStatusName: "Journey Completed",
  startTime: "2026-08-15 09:00:00",
  endTime: "2026-08-15 11:00:00",
  fare: "100.00",
  shipperUserUniqueId: "u-shipper",
  shipperFullName: "Marta Bekele",
  shipperPhone: "+251911111111",
  shippableItemName: "Fertilizer",
  shippableItemQtyInQuintal: "25.000",
  originPlace: "Addis",
  destinationPlace: "Bahir Dar",
  shippingDate: null,
  deliveryDate: null,
  driverUserUniqueId: "u-driver",
  driverFullName: "Tadesse Alemu",
  driverPhone: "+251922222222",
  deliveryConfirmationUniqueId: null,
  deliveryConfirmationStatus: null,
  confirmedByUserUniqueId: null,
  deliveryConfirmationConfirmedAt: null,
  ...overrides,
});

describe("getJourneysWithPodStatus — filtering & scoping", () => {
  beforeEach(() => {
    mockPool.query.mockReset();
  });

  it("rejects an invalid podStatus with 400", async () => {
    await expect(
      getJourneysWithPodStatus({ podStatus: "BOGUS", roleId: 3 }),
    ).rejects.toMatchObject({
      statusCode: AppError.BAD_REQUEST,
      message: expect.stringContaining("Invalid podStatus"),
    });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("podStatus=NONE returns deliveries with no POD (dc NULL), paginated", async () => {
    mockPool.query
      .mockResolvedValueOnce([[row()]])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    const result = await getJourneysWithPodStatus({
      podStatus: "NONE",
      roleId: 3,
      page: 2,
      limit: 5,
    });

    const [sql, values] = lastSelect();
    expect(String(sql)).toContain("dc.deliveryConfirmationUniqueId IS NULL");
    expect(selectCalls().length).toBe(1);
    // LIMIT/OFFSET are the last two bound values.
    expect(values.slice(-2)).toEqual([5, 5]);

    expect(result).toMatchObject({
      data: [
        {
          podStatus: "NONE",
          hasPod: false,
          deliveryConfirmation: null,
        },
      ],
      pagination: { currentPage: 2, limit: 5, totalItems: 1 },
    });
  });

  it("podStatus=PENDING filters on the confirmation status", async () => {
    mockPool.query
      .mockResolvedValueOnce([
        [
          row({
            deliveryConfirmationUniqueId: "dc-1",
            deliveryConfirmationStatus: "PENDING",
          }),
        ],
      ])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    const result = await getJourneysWithPodStatus({
      podStatus: "PENDING",
      roleId: 3,
    });
    const [sql, values] = lastSelect();
    expect(String(sql)).toContain("dc.deliveryConfirmationStatus = ?");
    expect(values[0]).toBe("PENDING");
    expect(result.data[0]).toMatchObject({
      podStatus: "PENDING",
      hasPod: true,
      deliveryConfirmation: { deliveryConfirmationStatus: "PENDING" },
    });
  });

  it("driver scope: userUniqueId=self → dr.userUniqueId is bound to the caller", async () => {
    mockPool.query
      .mockResolvedValueOnce([[row()]])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    await getJourneysWithPodStatus({
      roleId: 2,
      viewerUserUniqueId: "u-driver-self",
    });
    const [sql, values] = lastSelect();
    expect(String(sql)).toContain("dr.userUniqueId = ?");
    expect(values).toContain("u-driver-self");
    // Drivers never get an admin-style owner OR clause.
    expect(String(sql)).not.toContain("sr.userUniqueId = ?");
  });

  it("shipper scope binds sr.userUniqueId", async () => {
    mockPool.query
      .mockResolvedValueOnce([[row()]])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    await getJourneysWithPodStatus({
      roleId: 1,
      viewerUserUniqueId: "u-shipper-self",
    });
    const [sql, values] = lastSelect();
    expect(String(sql)).toContain("sr.userUniqueId = ?");
    expect(values).toContain("u-shipper-self");
  });

  it("shipper response includes shipperRequestId and batchId (integer ids, no uuid)", async () => {
    mockPool.query
      .mockResolvedValueOnce([
        [
          row({
            shipperRequestId: 583,
            batchId: 12,
          }),
        ],
      ])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    const result = await getJourneysWithPodStatus({
      roleId: 1,
      viewerUserUniqueId: "u-shipper-self",
    });
    expect(result.data[0].shipper).toMatchObject({
      shipperRequestId: 583,
      batchId: 12,
    });
    expect(result.data[0].shipper).not.toHaveProperty("shipperRequestUniqueId");
    // The batch id must come from the ShipperRequestBatch JOIN (b.batchId).
    const [sql] = lastSelect();
    expect(String(sql)).toContain("b.batchId AS batchId");
  });

  it("admin sees everything; an owner filter narrows to that user", async () => {
    mockPool.query
      .mockResolvedValueOnce([[row()]])
      .mockResolvedValueOnce([[{ total: 1 }]]);
    await getJourneysWithPodStatus({
      roleId: 3,
      ownerUserUniqueId: "u-driver-x",
    });
    const [sql, values] = lastSelect();
    expect(String(sql)).toContain("(dr.userUniqueId = ? OR sr.userUniqueId = ?)");
    expect(values.filter((v) => v === "u-driver-x").length).toBe(2);
  });

  it("company dispatcher is scoped to the company's targeted shipments", async () => {
    mockPool.query
      .mockResolvedValueOnce([[{ companyUniqueId: "company-1" }]]) // membership
      .mockResolvedValueOnce([[row()]]) // data
      .mockResolvedValueOnce([[{ total: 1 }]]); // count
    await getJourneysWithPodStatus({
      roleId: 10,
      viewerUserUniqueId: "u-dispatcher",
    });
    const [sql, values] = lastSelect();
    expect(String(sql)).toContain("sr.targetCompanyUniqueId = ?");
    expect(values[0]).toBe("company-1");
  });

  it("company member without an active membership sees nothing", async () => {
    mockPool.query
      .mockResolvedValueOnce([[]]) // no membership
      .mockResolvedValueOnce([[row()]])
      .mockResolvedValueOnce([[{ total: 0 }]]);
    await getJourneysWithPodStatus({ roleId: 7, viewerUserUniqueId: "u-x" });
    const [sql] = lastSelect();
    expect(String(sql)).toContain("1 = 0");
  });
});