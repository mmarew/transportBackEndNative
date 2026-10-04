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
const { getJobsAlongRoute, getAllActiveRequests } = require("../Services/ShipperRequest");
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
            shippableItemName = ?, requestMode = ?,
            shipperRequestCreatedAt = NOW(3)
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

/**
 * Deletes ShipperRequests matching `where`, with FK enforcement suspended.
 *
 * Why this is not a plain DELETE: ShipperRequest is the parent of DriverBid,
 * DriverQueue, CompanyBidVehicleAssignment and JourneyDecisions, and
 * JourneyDecisions is in turn the parent of Commission. A bare DELETE throws
 * ER_ROW_IS_REFERENCED_2, and that used to be fatal twice over — the rows
 * survived, and because cleanup runs in beforeEach the throw cascaded through
 * every remaining test. Leftovers then poisoned later runs too: a stale row parked
 * at (9.0, 38.5) ties on distanceKm with the fixture under test and wins the
 * createdAt tiebreak, so "matches a job whose ORIGIN is on the corridor" failed for
 * a reason that had nothing to do with the corridor.
 *
 * Rather than hand-maintain the parent/child chain (it grows every time a table is
 * added), checks are suspended for the duration on one dedicated connection.
 * FOREIGN_KEY_CHECKS is session-scoped, so this affects nothing outside it — and
 * `finally` puts it back even when the DELETE throws.
 *
 * Only ever call this with a predicate that selects rows this suite cloned.
 */
const deleteRequests = async (where, params = []) => {
  const connection = await pool.getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    const [result] = await connection.query(
      `DELETE FROM ShipperRequest WHERE ${where}`,
      params,
    );
    return result;
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    connection.release();
  }
};

const dropFixtures = async () => {
  if (fixtureIds.length === 0) return;
  await deleteRequests("shipperRequestId IN (?)", [fixtureIds]);
  fixtureIds.length = 0;
};

/**
 * Deletes rows an earlier interrupted run left behind.
 *
 * Scoped to the synthetic coordinate grid this suite uses — deliberately round
 * numbers on and beside the mocked corridor, none of them a real order location.
 * Without this the suite is only correct on a database that has never had a crash,
 * which is not a property a test suite can rely on.
 */
const purgeLeakedFixtures = async () => {
  const grid = `(
      (originLatitude = 9.0 AND originLongitude IN (38.25, 38.5, 38.75))
   OR (originLatitude = 12.0 AND originLongitude = 45.0)
   OR (destinationLatitude = 9.0 AND destinationLongitude IN (38.25, 38.5, 38.75))
   OR (destinationLatitude = 12.0 AND destinationLongitude = 45.0)
  )`;
  const result = await deleteRequests(grid);
  if (result.affectedRows > 0) {
    console.warn(
      `[jobsAlongRoute] purged ${result.affectedRows} leaked fixture(s) from a previous run`,
    );
  }
};

beforeAll(async () => {
  await pool.query("SELECT 1");
  await dropFixtures();
  await purgeLeakedFixtures();
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
    expect(hit.matchedBy).toBe("origin");
  });

  test("ignores a job whose DROP-OFF is here but whose PICKUP is not", async () => {
    // The reported bug. A driver standing at the route start used to be shown the
    // "Addis Ababa → Dire Dawa" load, because its drop-off was the road under their
    // feet: 0.5 km away, so it won the ranking outright. Serving it means driving
    // 860 km to Addis Ababa first — the opposite of useful. The pickup is what has
    // to be on the corridor.
    const id = await makeJob({ origin: FAR_AWAY, destination: ON_CORRIDOR });

    const res = await search({ limit: 50 });

    expect(res.data.find((r) => r.shipperRequestId === id)).toBeUndefined();
  });

  test("every returned row has its pickup on the corridor", async () => {
    await makeJob({ origin: ON_CORRIDOR, destination: FAR_AWAY });
    await makeJob({ origin: FAR_AWAY, destination: ON_CORRIDOR });
    await makeJob({ origin: ON_CORRIDOR, destination: ON_CORRIDOR });

    const res = await search({ limit: 50 });

    expect(res.data.length).toBeGreaterThan(0);
    // "destination" is no longer a reachable outcome — it means the drop-off was on
    // the road while the pickup was not, which is precisely what we now drop.
    expect(res.data.map((r) => r.matchedBy).sort()).toEqual(
      res.data.map(() => expect.stringMatching(/^(origin|both)$/)),
    );
  });

  test("reports how far along the route each pickup is", async () => {
    const mid = await makeJob({
      origin: { lat: 9.0, lng: 38.5 },
      destination: FAR_AWAY,
    });
    const far = await makeJob({
      origin: { lat: 9.0, lng: 38.75 },
      destination: FAR_AWAY,
    });

    const res = await search({ limit: 50 });
    const midRow = res.data.find((r) => r.shipperRequestId === mid);
    const farRow = res.data.find((r) => r.shipperRequestId === far);

    // Corridor runs 38.0 → 39.0 ≈ 110 km, so 38.5 is halfway and 38.75 is 3/4.
    expect(midRow.pickupKmAlongRoute).toBeGreaterThan(50);
    expect(midRow.pickupKmAlongRoute).toBeLessThan(60);
    expect(farRow.pickupKmAlongRoute).toBeGreaterThan(midRow.pickupKmAlongRoute);
  });

  test("tags a job with both ends on the corridor", async () => {
    const id = await makeJob({ origin: ON_CORRIDOR, destination: ON_CORRIDOR });

    const res = await search();
    const hit = res.data.find((r) => r.shipperRequestId === id);

    expect(hit).toBeDefined();
    expect(hit.matchedBy).toBe("both");
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
    // inside the padded tiles, so only the exact pass can exclude it.
    const id = await makeJob({
      origin: { lat: 9.5, lng: 38.5 },
      destination: FAR_AWAY,
    });

    const res = await search();

    expect(res.data.find((r) => r.shipperRequestId === id)).toBeUndefined();
  });

  test("ranks the nearest job first", async () => {
    const near = await makeJob({
      origin: { lat: 9.0, lng: 38.25 },
      destination: FAR_AWAY,
    });
    const farther = await makeJob({
      origin: { lat: 9.0, lng: 38.75 },
      destination: FAR_AWAY,
    });

    const res = await search({ limit: 50 });
    const ids = res.data.map((r) => r.shipperRequestId);

    expect(ids).toContain(near);
    expect(ids).toContain(farther);
    expect(ids.indexOf(near)).toBeLessThan(ids.indexOf(farther));
  });

  test("excludes a pickup that is behind the driver", async () => {
    // Driver is a quarter of the way along (≈38.25, 27 km in). A pickup back at
    // the start is 27 km behind — just past the 25 km slack for a loaded truck.
    const behind = await makeJob({
      origin: { lat: 9.0, lng: 38.0 },
      destination: FAR_AWAY,
    });
    const ahead = await makeJob({
      origin: { lat: 9.0, lng: 38.75 },
      destination: FAR_AWAY,
    });

    const res = await search({
      driverLatitude: 9.0,
      driverLongitude: 38.25,
      limit: 50,
    });
    const ids = res.data.map((r) => r.shipperRequestId);

    expect(ids).not.toContain(behind);
    expect(ids).toContain(ahead);
  });

  test("keeps a pickup inside the behindKm slack and labels it", async () => {
    // Driver at ≈38.5 (55 km in); pickup at 38.25 is 27 km back, so behindKm=30
    // has to bring it back and say so.
    const id = await makeJob({
      origin: { lat: 9.0, lng: 38.25 },
      destination: FAR_AWAY,
    });

    const res = await search({
      driverLatitude: 9.0,
      driverLongitude: 38.5,
      behindKm: 30,
      limit: 50,
    });
    const hit = res.data.find((r) => r.shipperRequestId === id);

    expect(hit).toBeDefined();
    expect(hit.behindByKm).toBeGreaterThan(20);
    expect(hit.behindByKm).toBeLessThan(35);
  });

  test("behindKm=0 excludes the same pickup", async () => {
    const id = await makeJob({
      origin: { lat: 9.0, lng: 38.25 },
      destination: FAR_AWAY,
    });

    const res = await search({
      driverLatitude: 9.0,
      driverLongitude: 38.5,
      behindKm: 0,
      limit: 50,
    });

    expect(res.data.find((r) => r.shipperRequestId === id)).toBeUndefined();
  });

  test("corridor metadata reports the driver's position on the route", async () => {
    const res = await search({
      driverLatitude: 9.0,
      driverLongitude: 38.5,
      limit: 50,
    });

    expect(res.corridor.direction).toBe("pickupAhead");
    expect(res.corridor.routeLengthKm).toBeGreaterThan(100);
    expect(res.corridor.driverKmAlongRoute).toBeGreaterThan(50);
    expect(res.corridor.driverKmAlongRoute).toBeLessThan(60);
    expect(res.corridor.behindKm).toBe(25);
  });

  test("totalItems counts reachable rows, not raw corridor matches", async () => {
    // Two rows the SQL corridor admits but the direction filter rejects.
    await makeJob({ origin: FAR_AWAY, destination: ON_CORRIDOR });
    await makeJob({ origin: { lat: 9.0, lng: 38.0 }, destination: FAR_AWAY });
    const kept = await makeJob({ origin: ON_CORRIDOR, destination: FAR_AWAY });

    const res = await search({
      driverLatitude: 9.0,
      driverLongitude: 38.5,
      behindKm: 0,
      limit: 50,
    });

    expect(res.data.map((r) => r.shipperRequestId)).toContain(kept);
    expect(res.pagination.totalItems).toBe(res.data.length);
  });

  test("measures distance from the route start when the driver position is unknown", async () => {
    const id = await makeJob({ origin: ON_CORRIDOR, destination: FAR_AWAY });

    const res = await search();
    const hit = res.data.find((r) => r.shipperRequestId === id);

    // No driverLatitude/driverLongitude here, so the route start (lng 38.0) is
    // the reference: lng 38.5 is ~55.7 km away. Only ordering is distance-based —
    // inclusion is decided by the corridor tiles.
    expect(res.distanceFrom).toBe("routeStart");
    expect(hit.distanceKm).toBeGreaterThan(50);
    expect(hit.distanceKm).toBeLessThan(60);
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
    expect(res.mode).toBe("route");
    expect(res.corridor.pointCount).toBeGreaterThan(1);
    expect(res.corridor.tileCount).toBeGreaterThan(0);
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

// ── The unified entry point: getAllActiveRequests, both modes ─────────────────

describe("getAllActiveRequests mode selection", () => {
  test("the deprecated endpoint is only a delegation — same answers either way", async () => {
    const id = await makeJob({ origin: ON_CORRIDOR, destination: FAR_AWAY });

    const viaOld = await getJobsAlongRoute({
      startLat: 9.0,
      startLng: 38.0,
      endLat: 9.0,
      endLng: 39.0,
      radiusKm: 25,
      sampleKm: 25,
      limit: 20,
    });
    const viaUnified = await getAllActiveRequests({
      startLat: 9.0,
      startLng: 38.0,
      endLat: 9.0,
      endLng: 39.0,
      radiusKm: 25,
      sampleKm: 25,
      limit: 20,
    });

    expect(viaUnified.data.map((r) => r.shipperRequestId)).toEqual(
      viaOld.data.map((r) => r.shipperRequestId),
    );
    expect(viaUnified.data.some((r) => r.shipperRequestId === id)).toBe(true);
  });

  test("four route points put it in route mode and label every row", async () => {
    const id = await makeJob({ origin: ON_CORRIDOR, destination: FAR_AWAY });

    const res = await getAllActiveRequests({
      startLat: 9.0,
      startLng: 38.0,
      endLat: 9.0,
      endLng: 39.0,
      limit: 20,
    });

    expect(res.mode).toBe("route");
    expect(res.corridor).toBeDefined();
    const hit = res.data.find((r) => r.shipperRequestId === id);
    expect(hit.matchedBy).toBe("origin");
  });

  test("no route points leave it in feed mode — the unfiltered news feed", async () => {
    const id = await makeJob({ origin: ON_CORRIDOR, destination: FAR_AWAY });

    const res = await getAllActiveRequests({ limit: 100 });

    expect(res.mode).toBe("feed");
    expect(res.corridor).toBeUndefined();
    // Feed mode is not geographically scoped, so a job far from the corridor is
    // still listed — that is the original behaviour and must not regress.
    expect(res.data.some((r) => r.shipperRequestId === id)).toBe(true);
    expect(res.data.some((r) => r.matchedBy !== undefined)).toBe(false);
  });

  test("feed mode never calls OSRM", async () => {
    await getAllActiveRequests({ limit: 5 });

    expect(axios.get).not.toHaveBeenCalled();
  });

  test("a start point equal to the end point is a 400", async () => {
    await expect(
      getAllActiveRequests({ startLat: 9.0, startLng: 38.0, endLat: 9.0, endLng: 38.0 }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(axios.get).not.toHaveBeenCalled();
  });

  test("a partly specified route falls back to feed mode instead of erroring", async () => {
    // The Joi schema rejects a half-filled route at the edge; a direct service
    // caller must degrade rather than throw, or one bad param 500s the app.
    const res = await getAllActiveRequests({ startLat: 9.0, startLng: 38.0, limit: 5 });

    expect(res.mode).toBe("feed");
    expect(axios.get).not.toHaveBeenCalled();
  });

  test("requestMode now filters in feed mode too — it used to be dropped", async () => {
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

    const narrowed = await getAllActiveRequests({
      requestMode: "company_target",
      limit: 200,
    });
    const ids = narrowed.data.map((r) => r.shipperRequestId);

    expect(narrowed.mode).toBe("feed");
    expect(ids).toContain(company);
    expect(ids).not.toContain(individual);
  });

  test("an explicit sortBy overrides nearest-first ordering", async () => {
    await makeJob({ origin: { lat: 9.0, lng: 38.9 }, destination: FAR_AWAY });
    await makeJob({ origin: { lat: 9.0, lng: 38.1 }, destination: FAR_AWAY });

    const res = await getAllActiveRequests({
      startLat: 9.0,
      startLng: 38.0,
      endLat: 9.0,
      endLng: 39.0,
      sortBy: "shipperRequestId",
      sortOrder: "ASC",
      limit: 200,
    });

    const ids = res.data.map((r) => r.shipperRequestId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  test("a known driver position becomes the distance reference", async () => {
    const id = await makeJob({ origin: ON_CORRIDOR, destination: FAR_AWAY });

    const res = await getAllActiveRequests({
      startLat: 9.0,
      startLng: 38.0,
      endLat: 9.0,
      endLng: 39.0,
      driverLatitude: 9.0,
      driverLongitude: 38.5,
      limit: 20,
    });

    const hit = res.data.find((r) => r.shipperRequestId === id);
    expect(res.distanceFrom).toBe("driver");
    expect(hit.distanceKm).toBeLessThan(1);
  });
});
