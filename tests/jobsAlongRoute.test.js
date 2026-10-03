/**
 * Route-corridor job search — Services/ShipperRequest/getJobsAlongRoute.service.js
 *
 * axios is mocked so the corridor geometry is deterministic and the suite never
 * depends on OSRM being reachable. Fixtures are cloned ShipperRequest rows with
 * coordinates placed deliberately on/off the mocked corridor.
 *
 * The corridor used here is a straight west→east line at latitude 9.0, from
 * longitude 38.0 to 39.0. Note that real rows in the dev database (Addis Ababa
 * ~9.03,38.74 / Adama ~8.54,39.27) also fall near it, so every assertion is
 * made against specific fixture ids — never against total counts.
 */

const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

jest.mock("axios");
const axios = require("axios");

const { decodePolyline } = require("../Utils/polyline");
const { getJobsAlongRoute } = require("../Services/ShipperRequest");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");

// ── Polyline encoder (inverse of Utils/polyline.decodePolyline) ──────────────

const encodeSigned = (num) => {
  let v = num < 0 ? ~(num << 1) : num << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
};

/** @param {Array<[number, number]>} points as [lat, lng] */
const encodePolyline = (points) => {
  let plat = 0;
  let plng = 0;
  let out = "";
  for (const [lat, lng] of points) {
    const ilat = Math.round(lat * 1e5);
    const ilng = Math.round(lng * 1e5);
    out += encodeSigned(ilat - plat);
    out += encodeSigned(ilng - plng);
    plat = ilat;
    plng = ilng;
  }
  return out;
};

// Corridor: latitude 9.0, longitude 38.0 → 39.0 (≈111 km).
const CORRIDOR = [
  [9.0, 38.0],
  [9.0, 38.25],
  [9.0, 38.5],
  [9.0, 38.75],
  [9.0, 39.0],
];
const CORRIDOR_POLYLINE = encodePolyline(CORRIDOR);

const ON_CORRIDOR = { lat: 9.0, lng: 38.5 };
const FAR_AWAY = { lat: 12.0, lng: 45.0 };

const mockRouteOk = () => {
  axios.get.mockResolvedValue({
    data: { code: "Ok", routes: [{ geometry: CORRIDOR_POLYLINE }] },
  });
};

const search = (extra = {}) =>
  getJobsAlongRoute({
    startLat: 9.0,
    startLng: 38.0,
    endLat: 9.0,
    endLng: 39.0,
    radiusKm: 25,
    sampleKm: 25,
    ...extra,
  });

// ── Fixtures ─────────────────────────────────────────────────────────────────

const fixtureIds = [];

const cloneRow = async ({ table, sourceId, pkColumn, overrideUniqueColumn }) => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND EXTRA NOT LIKE '%auto_increment%'
        AND GENERATION_EXPRESSION = ''`,
    [table],
  );
  const names = columns.map((c) => c.COLUMN_NAME);
  const selectList = names
    .map((n) => (n === overrideUniqueColumn ? "?" : `t.\`${n}\``))
    .join(", ");
  const columnList = names.map((n) => `\`${n}\``).join(", ");
  const [result] = await pool.query(
    `INSERT INTO \`${table}\` (${columnList})
     SELECT ${selectList} FROM \`${table}\` t WHERE t.\`${pkColumn}\` = ?`,
    [uuidv4(), sourceId],
  );
  return result.insertId;
};

/**
 * Clones a ShipperRequest and forces the fields the corridor search cares about.
 * isBiddingApproved is set TRUE so the queue/bidding guard never hides a fixture
 * (the clone keeps its source batch, which may belong to a queue organisation).
 */
const makeJob = async ({
  origin,
  destination,
  statusId = journeyStatusMap.waiting,
  deleted = false,
  item = null,
  requestMode = null,
}) => {
  const [rows] = await pool.query(
    "SELECT shipperRequestId FROM ShipperRequest ORDER BY shipperRequestId LIMIT 1",
  );
  const id = await cloneRow({
    table: "ShipperRequest",
    sourceId: rows[0].shipperRequestId,
    pkColumn: "shipperRequestId",
    overrideUniqueColumn: "shipperRequestUniqueId",
  });
  await pool.query(
    `UPDATE ShipperRequest
        SET journeyStatusId = ?, originLatitude = ?, originLongitude = ?,
            destinationLatitude = ?, destinationLongitude = ?,
            isBiddingApproved = TRUE, shipperRequestDeletedAt = ?,
            shippableItemName = ?, requestMode = ?
      WHERE shipperRequestId = ?`,
    [
      statusId,
      origin.lat,
      origin.lng,
      destination.lat,
      destination.lng,
      deleted ? new Date() : null,
      item,
      requestMode || "individual_target",
      id,
    ],
  );
  fixtureIds.push(id);
  return id;
};

const dropFixtures = async () => {
  if (fixtureIds.length === 0) return;
  await pool.query("DELETE FROM ShipperRequest WHERE shipperRequestId IN (?)", [
    fixtureIds,
  ]);
  fixtureIds.length = 0;
};

beforeAll(async () => {
  await pool.query("SELECT 1");
});
beforeEach(async () => {
  await dropFixtures();
  jest.clearAllMocks();
  mockRouteOk();
});
afterAll(dropFixtures);

// ── Polyline codec ───────────────────────────────────────────────────────────

describe("polyline codec", () => {
  test("decodePolyline round-trips an encoded route", () => {
    const decoded = decodePolyline(CORRIDOR_POLYLINE);
    expect(decoded).toHaveLength(CORRIDOR.length);
    // decoder returns [lng, lat]
    expect(decoded[0][1]).toBeCloseTo(9.0, 4);
    expect(decoded[0][0]).toBeCloseTo(38.0, 4);
    expect(decoded[decoded.length - 1][0]).toBeCloseTo(39.0, 4);
  });

  test("decodePolyline is safe on bad input", () => {
    expect(decodePolyline("")).toEqual([]);
    expect(decodePolyline(null)).toEqual([]);
    expect(decodePolyline(undefined)).toEqual([]);
  });
});

// ── Corridor matching ────────────────────────────────────────────────────────

describe("getJobsAlongRoute corridor matching", () => {
  test("matches a job whose ORIGIN is on the corridor", async () => {
    const id = await makeJob({ origin: ON_CORRIDOR, destination: FAR_AWAY });

    const res = await search();
    const hit = res.data.find((r) => r.shipperRequestId === id);

    expect(hit).toBeDefined();
    expect(hit.originOnCorridor).toBe(true);
    expect(hit.destinationOnCorridor).toBe(false);
    expect(hit.distanceToCorridorKm).toBeLessThanOrEqual(25);
  });

  test("matches a job whose DESTINATION is on the corridor", async () => {
    const id = await makeJob({ origin: FAR_AWAY, destination: ON_CORRIDOR });

    const res = await search();
    const hit = res.data.find((r) => r.shipperRequestId === id);

    expect(hit).toBeDefined();
    expect(hit.originOnCorridor).toBe(false);
    expect(hit.destinationOnCorridor).toBe(true);
  });

  test("ignores a job with both ends off the corridor", async () => {
    const id = await makeJob({
      origin: { lat: 4.0, lng: 34.0 },
      destination: { lat: 13.0, lng: 46.0 },
    });

    const res = await search();

    expect(res.data.find((r) => r.shipperRequestId === id)).toBeUndefined();
  });

  test("ignores a job just outside the radius", async () => {
    // ~0.5° north of the corridor ≈ 55 km, beyond the 25 km radius but still
    // inside the padded bounding box, so only the exact pass can exclude it.
    const id = await makeJob({
      origin: { lat: 9.5, lng: 38.5 },
      destination: FAR_AWAY,
    });

    const res = await search();

    expect(res.data.find((r) => r.shipperRequestId === id)).toBeUndefined();
  });

  test("ranks nearest-to-corridor first", async () => {
    const near = await makeJob({
      origin: { lat: 9.0, lng: 38.5 },
      destination: FAR_AWAY,
    });
    const farther = await makeJob({
      origin: { lat: 9.15, lng: 38.5 },
      destination: FAR_AWAY,
    });

    const res = await search();
    const ids = res.data.map((r) => r.shipperRequestId);

    expect(ids).toContain(near);
    expect(ids).toContain(farther);
    expect(ids.indexOf(near)).toBeLessThan(ids.indexOf(farther));
  });
});

// ── Guards inherited from the active-jobs feed ───────────────────────────────

describe("getJobsAlongRoute guards", () => {
  test("excludes soft-deleted jobs", async () => {
    const id = await makeJob({
      origin: ON_CORRIDOR,
      destination: FAR_AWAY,
      deleted: true,
    });

    const res = await search();

    expect(res.data.find((r) => r.shipperRequestId === id)).toBeUndefined();
  });

  test("excludes terminal statuses such as cancelledByAdmin", async () => {
    const id = await makeJob({
      origin: ON_CORRIDOR,
      destination: FAR_AWAY,
      statusId: journeyStatusMap.cancelledByAdmin,
    });

    const res = await search();

    expect(res.data.find((r) => r.shipperRequestId === id)).toBeUndefined();
  });

  test("a GET never rewrites the stored status", async () => {
    const id = await makeJob({
      origin: ON_CORRIDOR,
      destination: FAR_AWAY,
      statusId: journeyStatusMap.acceptedByDriver,
    });

    await search();

    const [rows] = await pool.query(
      "SELECT journeyStatusId FROM ShipperRequest WHERE shipperRequestId = ?",
      [id],
    );
    expect(rows[0].journeyStatusId).toBe(journeyStatusMap.acceptedByDriver);
  });
});

// ── Optional filters ─────────────────────────────────────────────────────────

describe("getJobsAlongRoute filters", () => {
  test("shippableItemName narrows to matching cargo", async () => {
    const coffee = await makeJob({
      origin: ON_CORRIDOR,
      destination: FAR_AWAY,
      item: "Coffee Beans",
    });
    const cement = await makeJob({
      origin: ON_CORRIDOR,
      destination: FAR_AWAY,
      item: "Cement",
    });

    const res = await search({ shippableItemName: "coffee" });
    const ids = res.data.map((r) => r.shipperRequestId);

    expect(ids).toContain(coffee);
    expect(ids).not.toContain(cement);
  });

  test("requestMode narrows when supplied", async () => {
    const individual = await makeJob({
      origin: ON_CORRIDOR,
      destination: FAR_AWAY,
      requestMode: "individual_target",
    });
    const company = await makeJob({
      origin: ON_CORRIDOR,
      destination: FAR_AWAY,
      requestMode: "company_target",
    });

    const res = await search({ requestMode: "company_target" });
    const ids = res.data.map((r) => r.shipperRequestId);

    expect(ids).toContain(company);
    expect(ids).not.toContain(individual);
  });

  test("requestMode is not forced — omitting it returns both", async () => {
    const individual = await makeJob({
      origin: ON_CORRIDOR,
      destination: FAR_AWAY,
      requestMode: "individual_target",
    });
    const company = await makeJob({
      origin: ON_CORRIDOR,
      destination: FAR_AWAY,
      requestMode: "company_target",
    });

    const ids = (await search()).data.map((r) => r.shipperRequestId);

    expect(ids).toContain(individual);
    expect(ids).toContain(company);
  });

  test("omitting vehicleTypeUniqueId still returns matches", async () => {
    const id = await makeJob({ origin: ON_CORRIDOR, destination: FAR_AWAY });

    const res = await search();

    expect(res.data.find((r) => r.shipperRequestId === id)).toBeDefined();
  });
});

// ── Failure handling and response shape ──────────────────────────────────────

describe("getJobsAlongRoute failures and shape", () => {
  test("an unroutable pair is a 400, not a 500", async () => {
    axios.get.mockResolvedValue({ data: { code: "NotFound", routes: [] } });

    await expect(
      search({ startLat: 0, startLng: 0, endLat: 1, endLng: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("an OSRM timeout is a 400", async () => {
    axios.get.mockRejectedValue(Object.assign(new Error("timeout"), { code: "ECONNABORTED" }));

    await expect(search()).rejects.toMatchObject({ statusCode: 400 });
  });

  test("OSRM is called with lon,lat pairs and polyline geometry", async () => {
    await search({ startLat: 9.0, startLng: 38.0, endLat: 9.0, endLng: 39.0 });

    expect(axios.get).toHaveBeenCalledTimes(1);
    const url = axios.get.mock.calls[0][0];
    expect(url).toContain("/route/v1/driving/38,9;39,9");
    expect(url).toContain("overview=full");
    expect(url).toContain("geometries=polyline");
  });

  test("response carries pagination and corridor metadata", async () => {
    await makeJob({ origin: ON_CORRIDOR, destination: FAR_AWAY });

    const res = await search({ page: 1, limit: 5 });

    expect(res.pagination).toMatchObject({ currentPage: 1, limit: 5 });
    expect(typeof res.pagination.totalItems).toBe("number");
    expect(res.corridor.pointCount).toBeGreaterThan(1);
    expect(res.data.length).toBeLessThanOrEqual(5);
  });

  test("no internal ranking fields leak into the response", async () => {
    await makeJob({ origin: ON_CORRIDOR, destination: FAR_AWAY });

    const res = await search();
    const leaked = res.data.flatMap((r) =>
      Object.keys(r).filter((k) => k.startsWith("_")),
    );

    expect(leaked).toEqual([]);
  });
});
