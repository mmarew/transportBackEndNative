"use strict";

/**
 * Unit Tests: PassengerRequest Validation Rules
 *
 * Tests the Joi schema rules WITHOUT needing a database:
 *   1. numberOfVehicles max cap (100)
 *   2. individual_target mode rejects 10+ vehicles
 *   3. company_target mode accepts 10+ vehicles
 *   4. individual_target mode allows ≤ 9 vehicles
 */

const uuid = () => require("uuid").v4();

describe("PassengerRequest Validation", () => {
  const { createPassengerRequest } = require("../Validations/PassengerRequest.schema");

  const validPayload = (overrides = {}) => ({
    passengerRequestBatchId: uuid(),
    numberOfVehicles: 1,
    shippingDate: "2026-06-01",
    deliveryDate: "2026-06-05",
    shippingCost: 15000,
    shippableItemQtyInQuintal: 100,
    shippableItemName: "Coffee",
    originLocation: { latitude: 9.0, longitude: 38.7, description: "Addis" },
    destination: { latitude: 7.0, longitude: 38.5, description: "Hawassa" },
    vehicle: { vehicleTypeUniqueId: uuid() },
    ...overrides,
  });

  test("rejects numberOfVehicles > 100", () => {
    const result = createPassengerRequest.validate(
      validPayload({ numberOfVehicles: 101 }),
    );
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain("100");
  });

  test("accepts numberOfVehicles = 100 with company_target", () => {
    const result = createPassengerRequest.validate(
      validPayload({ numberOfVehicles: 100, requestMode: "company_target" }),
    );
    expect(result.error).toBeUndefined();
    expect(result.value.numberOfVehicles).toBe(100);
  });

  test("rejects individual_target with 10+ vehicles", () => {
    const result = createPassengerRequest.validate(
      validPayload({ numberOfVehicles: 10, requestMode: "individual_target" }),
    );
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain("company_target");
  });

  test("rejects default mode (individual_target) with 15 vehicles", () => {
    const result = createPassengerRequest.validate(
      validPayload({ numberOfVehicles: 15 }),
    );
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain("company_target");
  });

  test("allows individual_target with exactly 9 vehicles", () => {
    const result = createPassengerRequest.validate(
      validPayload({ numberOfVehicles: 9, requestMode: "individual_target" }),
    );
    expect(result.error).toBeUndefined();
    expect(result.value.numberOfVehicles).toBe(9);
  });

  test("allows individual_target with 1 vehicle (default)", () => {
    const result = createPassengerRequest.validate(validPayload());
    expect(result.error).toBeUndefined();
    expect(result.value.numberOfVehicles).toBe(1);
    expect(result.value.requestMode).toBe("individual_target");
  });

  test("allows company_target with 1 vehicle", () => {
    const result = createPassengerRequest.validate(
      validPayload({ numberOfVehicles: 1, requestMode: "company_target" }),
    );
    expect(result.error).toBeUndefined();
  });
});
