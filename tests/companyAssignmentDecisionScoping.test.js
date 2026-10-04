// JourneyDecision scoping for company assignments.
//
// A JourneyDecision is the row that ties a DriverRequest to ONE ShipperRequest.
// Both the assignment helper and the driver-confirmation transition used to look
// the decision up by `driverRequestId` ALONE:
//
//   SELECT journeyDecisionUniqueId FROM JourneyDecisions WHERE driverRequestId = ?
//
// That returns whatever decision the driver happens to be holding — including one
// belonging to an unrelated order they were offered in the meantime (an
// individual bid, a street order). The caller then treats it as "the decision for
// this order" and mutates it, which produced a real, reproducible failure:
//
//   13:20  order 1559 (individual_target) created
//   13:22  driver DR1004 + decision jd1003 created on order 1559
//   13:29  order 1582 (company_target) created for a company assignment
//   13:35  driver confirms the assignment -> adopts jd1003, promotes it to 4
//
// Result: order 1582 never got a decision (stuck at `waiting`), order 1559 was
// left pointing at a decision that was no longer its own, and the queue enrolment
// hook then saw the driver as "double_booked" on 1559 and silently created no
// DriverQueue row — so myPosition returned nothing after a successful confirmation.
//
// These tests pin the ShipperRequest scoping that prevents it.

jest.mock("../Services/CompanyHelper.service", () => ({
  ...jest.requireActual("../Services/CompanyHelper.service"),
  db: jest.fn(),
}));

const { db } = require("../Services/CompanyHelper.service");
const {
  createJourneyDecisionForAssignment,
} = require("../Services/CompanyAssignment/assignmentHelper/decision.service");

const SR_ASSIGNED = "sr-company-order-1582";

/**
 * Answers the three queries the helper issues, in order:
 *   1. ShipperRequest  -> numeric PK for the order being assigned
 *   2. DriverRequest   -> numeric PK for the driver
 *   3. JourneyDecision -> existing decision rows for that driver
 */
const scriptQueries = ({ shipperRequestId, driverRequestId, decisions }) => {
  const query = jest.fn(async (sql) => {
    if (/FROM ShipperRequest/i.test(sql)) {
      return [[{ shipperRequestId, shippingCost: 100 }]];
    }
    if (/FROM DriverRequest/i.test(sql)) {
      return [[{ driverRequestId }]];
    }
    if (/FROM JourneyDecisions/i.test(sql)) {
      // Honour the shipperRequestId filter the fix added. A row for a different
      // order must not be returned as "the" decision for this one.
      const filtered = sql.includes("shipperRequestId = ?")
        ? decisions.filter((d) => d.shipperRequestId === shipperRequestId)
        : decisions;
      return [filtered];
    }
    if (/INSERT INTO JourneyDecisions/i.test(sql)) {
      return [{ insertId: 1, affectedRows: 1 }];
    }
    return [{ affectedRows: 1 }];
  });
  db.mockReturnValue({ query });
  return query;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createJourneyDecisionForAssignment decision scoping", () => {
  it("reuses the driver's decision when it belongs to THIS order", async () => {
    const existing = "jd-for-this-order";
    scriptQueries({
      shipperRequestId: 1582,
      driverRequestId: 1004,
      decisions: [
        { journeyDecisionUniqueId: existing, shipperRequestId: 1582 },
      ],
    });

    const result = await createJourneyDecisionForAssignment(
      SR_ASSIGNED,
      "dr-1004",
      "dispatcher",
    );

    expect(result).toBe(existing);
  });

  it("does NOT adopt a decision that belongs to another order", async () => {
    // The driver is holding jd1003 on order 1559. This is the exact situation
    // that hijacked the decision: without the shipperRequestId filter the helper
    // returns 1559's decision and the company order is left with none.
    const query = scriptQueries({
      shipperRequestId: 1582,
      driverRequestId: 1004,
      decisions: [
        { journeyDecisionUniqueId: "jd-on-1559", shipperRequestId: 1559 },
      ],
    });

    const result = await createJourneyDecisionForAssignment(
      SR_ASSIGNED,
      "dr-1004",
      "dispatcher",
    );

    expect(result).not.toBe("jd-on-1559");
    // A fresh decision is minted for the order actually being assigned.
    expect(result).toMatch(/^[0-9a-f-]{36}$/i);

    const inserted = query.mock.calls.find(([sql]) =>
      /INSERT INTO JourneyDecisions/i.test(sql),
    );
    expect(inserted).toBeDefined();
    expect(inserted[1]).toContain(1582); // the ASSIGNED order's PK
    expect(inserted[1]).not.toContain(1559);
  });

  it("scopes the existing-decision lookup to the assigned shipper request", async () => {
    const query = scriptQueries({
      shipperRequestId: 1582,
      driverRequestId: 1004,
      decisions: [],
    });

    await createJourneyDecisionForAssignment(SR_ASSIGNED, "dr-1004", "dispatcher");

    const lookup = query.mock.calls.find(([sql]) =>
      /FROM JourneyDecisions/i.test(sql) && /SELECT/i.test(sql),
    );
    expect(lookup).toBeDefined();
    // Both the filter and the soft-delete guard must be present.
    expect(lookup[0]).toMatch(/shipperRequestId\s*=\s*\?/i);
    expect(lookup[0]).toMatch(/journeyDecisionDeletedAt IS NULL/i);
  });
});