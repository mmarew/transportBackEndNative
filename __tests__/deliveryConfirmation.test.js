"use strict";

/**
 * Unit tests for Services/DeliveryConfirmation.service.js — the POD enforcement
 * rules from docs/proof-of-delivery-pod.md §4.2:
 *
 *   1. Settle (CONFIRMED) requires signature + ≥1 photo + GPS + completed journey.
 *   2. Immutable SHA-256 signature hash written once at settle (photo order
 *      independent); previous hash preserved on admin amendment.
 *   3. Post-settle signed fields immutable; CONFIRMED status terminal;
 *      DISPUTED → CONFIRMED is admin-only re-settle.
 *   4. Tier-A OTP: bcrypt-hashed, short expiry (410 GONE), attempt cap, resend
 *      blocked while a code is active.
 *   5. Photo uploads are append-only.
 *   6. Duplicate create for a journey → 409.
 */

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

// ── Mock dependencies BEFORE requiring the service ───────────────────────────
const mockPool = { query: jest.fn() };

jest.mock("../Middleware/Database.config", () => ({ pool: mockPool }));

jest.mock("../Utils/CurrentDate", () => ({
  ...jest.requireActual("../Utils/CurrentDate"),
  // Fixed clock for deterministic tests. minutesAgo(60) → 13:00:00 so the OTP
  // hourly window (started at 14:00:00) is always treated as active.
  currentDate: () => "2026-08-15 14:00:00",
  minutesAgo: () => "2026-08-15 13:00:00",
}));

jest.mock("../CRUD/Read/ReadData", () => ({ getData: jest.fn() }));

jest.mock("../Utils/FTPHandler", () => ({
  resolveDocumentUrl: jest.fn((p) => p),
}));

jest.mock("../Utils/smsSender", () => ({ sendSms: jest.fn() }));

jest.mock("../Services/Firebase.service", () => ({
  sendFCMNotificationToUser: jest.fn(),
}));

jest.mock("../Utils/Notifications", () => ({
  sendSocketIONotificationToShipper: jest.fn(),
  sendSocketIONotificationToDriver: jest.fn(),
}));

jest.mock("../Utils/ListOfSeedData", () => ({
  usersRoles: {
    shipperRoleId: 1,
    driverRoleId: 2,
    adminRoleId: 3,
    supperAdminRoleId: 6,
  },
  journeyStatusMap: { journeyCompleted: 9 },
}));

const {
  createDeliveryConfirmation,
  updateDeliveryConfirmation,
  requestSignOtp,
  deleteDeliveryConfirmation,
  verifyDeliveryConfirmationHash,
  notifyShipperOfPodSubmit,
} = require("../Services/DeliveryConfirmation.service");
const AppError = require("../Utils/AppError");
const Config = require("../Utils/Config");
const { sendSms } = require("../Utils/smsSender");
const { sendFCMNotificationToUser } = require("../Services/Firebase.service");
const { sendSocketIONotificationToShipper } = require("../Utils/Notifications");
const { sendSocketIONotificationToDriver } = require("../Utils/Notifications");
const { getData } = require("../CRUD/Read/ReadData");

const NOW = "2026-08-15 14:00:00";

// ── Helpers ──────────────────────────────────────────────────────────────────
const baseRow = (overrides = {}) => ({
  deliveryConfirmationUniqueId: "dc-123",
  journeyUniqueId: "j-1",
  receiverUserUniqueId: "u-receiver",
  confirmedByUserUniqueId: null,
  deliveryConfirmationStatus: "PENDING",
  deliveryConfirmationDeliveredQuantity: "25.000",
  deliveryConfirmationQuantityUnit: "quintal",
  deliveryConfirmationCondition: "GOOD",
  deliveryConfirmationReceiverSignature: null,
  deliveryConfirmationShipperSignature: null,
  deliveryConfirmationPhotoUrl: "/uploads/delivery_1.jpg",
  deliveryConfirmationNotes: null,
  deliveryConfirmationLatitude: "9.01080000",
  deliveryConfirmationLongitude: "38.76120000",
  deliveryConfirmationSignatureHash: null,
  deliveryConfirmationPreviousHash: null,
  deliveryConfirmationStatement: null,
  deliveryConfirmationSubmittedAt: "2026-08-15 13:00:00",
  deliveryConfirmationReceiverSignedAt: null,
  deliveryConfirmationConfirmedAt: null,
  deliveryConfirmationShipperSignedAt: null,
  deliveryConfirmationOtpHash: null,
  deliveryConfirmationOtpExpiresAt: null,
  deliveryConfirmationOtpAttempts: 0,
  deliveryConfirmationOtpVerifiedAt: null,
  ...overrides,
});

const updateCalls = () =>
  mockPool.query.mock.calls.filter(([sql]) =>
    typeof sql === "string" && sql.startsWith("UPDATE DeliveryConfirmations SET"),
  );

// Independent re-implementation of the canonical hash input so the test proves
// the stored hash matches the documented formula (photo order independent).
const canonicalInput = (fields) =>
  [
    fields.journeyUniqueId,
    fields.receiverSignature || "",
    fields.shipperSignature || "",
    [...(fields.photoUrls || [])].sort().join(","),
    fields.deliveredQuantity ?? "",
    fields.quantityUnit || "",
    fields.condition || "",
    fields.latitude ?? "",
    fields.longitude ?? "",
    fields.confirmedAt || "",
  ].join("|");

const expectedHash = (fields) =>
  crypto.createHash("sha256").update(canonicalInput(fields)).digest("hex");

describe("updateDeliveryConfirmation — settle-time evidence validation", () => {
  it("rejects settle without a receiver or shipper signature", async () => {
    mockPool.query.mockResolvedValueOnce([[baseRow()]]);
    await expect(
      updateDeliveryConfirmation("dc-123", { status: "CONFIRMED" }, "u-shipper", 1),
    ).rejects.toMatchObject({
      statusCode: AppError.BAD_REQUEST,
      message: expect.stringContaining("signature"),
    });
  });

  it("rejects settle when the journey is not completed", async () => {
    mockPool.query
      .mockResolvedValueOnce([[baseRow()]])
      .mockResolvedValueOnce([[{ journeyStatusId: 5 }]]); // journeyStarted
    await expect(
      updateDeliveryConfirmation(
        "dc-123",
        { status: "CONFIRMED", shipperSignature: "sig-b64" },
        "u-shipper",
        1,
      ),
    ).rejects.toMatchObject({
      statusCode: AppError.BAD_REQUEST,
      message: expect.stringContaining("completed journey"),
    });
  });
});

describe("updateDeliveryConfirmation — settle happy path & immutable hash", () => {
  const settleQueries = (rowOverrides = {}, journeyStatusId = 9) =>
    mockPool.query
      .mockResolvedValueOnce([[baseRow(rowOverrides)]]) // current row
      .mockResolvedValueOnce([[{ journeyStatusId }]]) // journey
      .mockResolvedValueOnce([
        [{ fullName: "Abebe Kebede", phoneNumber: "+251911234567" }],
      ]) // receiver
      .mockResolvedValueOnce([[]]) // stored photos
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // main UPDATE

  it("settles, writes confirmedBy/confirmedAt/shipperSignedAt/statement and a 64-hex hash", async () => {
    settleQueries();
    const result = await updateDeliveryConfirmation(
      "dc-123",
      { status: "CONFIRMED", shipperSignature: "sig-b64" },
      "u-shipper",
      1,
    );

    expect(result.message).toBe("Delivery confirmation updated successfully");
    const [sql, values] = updateCalls().at(-1);
    expect(sql).toContain("deliveryConfirmationStatus = ?");
    expect(sql).toContain("confirmedByUserUniqueId = ?");
    expect(sql).toContain("deliveryConfirmationShipperSignedAt = ?");
    expect(sql).toContain("deliveryConfirmationStatement = ?");
    expect(sql).toContain("deliveryConfirmationSignatureHash = ?");
    // First settle has no previous hash to preserve.
    expect(sql).not.toContain("deliveryConfirmationPreviousHash = ?");
    expect(values).toContain("u-shipper");
    expect(values).toContain(NOW);
    expect(values.some((v) => typeof v === "string" && v.includes("Abebe Kebede"))).toBe(
      true,
    );

    // values tail = [..., hash, updatedBy, updatedAt, deliveryConfirmationUniqueId]
    const storedHash = values[values.length - 4];
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
    // Hash matches the documented canonical formula, independently recomputed.
    expect(storedHash).toBe(
      expectedHash({
        journeyUniqueId: "j-1",
        receiverSignature: "",
        shipperSignature: "sig-b64",
        photoUrls: [],
        deliveredQuantity: "25.000",
        quantityUnit: "quintal",
        condition: "GOOD",
        latitude: "9.01080000",
        longitude: "38.76120000",
        confirmedAt: NOW,
      }),
    );
  });

  it("produces the same hash regardless of photo upload order", async () => {
    const run = async (photoUrls) => {
      settleQueries();
      await updateDeliveryConfirmation(
        "dc-123",
        { status: "CONFIRMED", shipperSignature: "sig", photoUrls },
        "u-shipper",
        1,
      );
    const [sql, values] = updateCalls().at(-1);
    expect(sql).toContain("deliveryConfirmationSignatureHash = ?");
    return values[values.length - 4];
  };

    const hashA = await run(["/uploads/z.jpg", "/uploads/a.jpg"]);
    const hashB = await run(["/uploads/a.jpg", "/uploads/z.jpg"]);
    expect(hashA).toBe(hashB);
  });

  it("admin re-settle of a DISPUTED confirmation writes a fresh hash", async () => {
    settleQueries({ deliveryConfirmationStatus: "DISPUTED" });
    await updateDeliveryConfirmation(
      "dc-123",
      { status: "CONFIRMED", shipperSignature: "sig-b64" },
      "u-admin",
      3,
    );
    const [sql, values] = updateCalls().at(-1);
    expect(sql).toContain("deliveryConfirmationSignatureHash = ?");
    expect(values[values.length - 4]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("admin amendment of a CONFIRMED record preserves the previous hash", async () => {
    mockPool.query
      .mockResolvedValueOnce([
        [
          baseRow({
            deliveryConfirmationStatus: "CONFIRMED",
            deliveryConfirmationSignatureHash: "oldhash123",
            deliveryConfirmationConfirmedAt: NOW,
          }),
        ],
      ])
      .mockResolvedValueOnce([[]]) // stored photos
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // main UPDATE
    await updateDeliveryConfirmation(
      "dc-123",
      { condition: "DAMAGED" },
      "u-admin",
      6,
    );
    const [sql, values] = updateCalls().at(-1);
    expect(sql).toContain("deliveryConfirmationPreviousHash = ?");
    expect(values).toContain("oldhash123");
    const newHash = values[values.length - 4];
    expect(newHash).toMatch(/^[0-9a-f]{64}$/);
    expect(newHash).not.toBe("oldhash123");
  });
});

describe("updateDeliveryConfirmation — post-settle immutability & status machine", () => {
  it("blocks non-admin edits to signed fields after CONFIRMED", async () => {
    mockPool.query.mockResolvedValueOnce([
      [baseRow({ deliveryConfirmationStatus: "CONFIRMED" })],
    ]);
    await expect(
      updateDeliveryConfirmation("dc-123", { deliveredQuantity: 30 }, "u-driver", 2),
    ).rejects.toMatchObject({
      statusCode: AppError.FORBIDDEN,
      message: expect.stringContaining("cannot be changed"),
    });
  });

  it("blocks any status change away from CONFIRMED", async () => {
    mockPool.query.mockResolvedValueOnce([
      [baseRow({ deliveryConfirmationStatus: "CONFIRMED" })],
    ]);
    await expect(
      updateDeliveryConfirmation("dc-123", { status: "DISPUTED" }, "u-shipper", 1),
    ).rejects.toMatchObject({
      statusCode: AppError.FORBIDDEN,
      message: expect.stringContaining("cannot change status"),
    });
  });

  it("blocks non-admin re-settle of a DISPUTED confirmation", async () => {
    mockPool.query.mockResolvedValueOnce([
      [baseRow({ deliveryConfirmationStatus: "DISPUTED" })],
    ]);
    await expect(
      updateDeliveryConfirmation("dc-123", { status: "CONFIRMED" }, "u-shipper", 1),
    ).rejects.toMatchObject({
      statusCode: AppError.FORBIDDEN,
      message: expect.stringContaining("Only an admin"),
    });
  });

  it("blocks DISPUTED going back to PENDING", async () => {
    mockPool.query.mockResolvedValueOnce([
      [baseRow({ deliveryConfirmationStatus: "DISPUTED" })],
    ]);
    await expect(
      updateDeliveryConfirmation("dc-123", { status: "PENDING" }, "u-admin", 3),
    ).rejects.toMatchObject({
      statusCode: AppError.FORBIDDEN,
    });
  });
});

describe("updateDeliveryConfirmation — Tier-A OTP", () => {
  let otpHash;

  beforeAll(async () => {
    otpHash = await bcrypt.hash("123456", 4);
  });

  it("rejects an invalid OTP and increments the attempt counter", async () => {
    mockPool.query
      .mockResolvedValueOnce([
        [
          baseRow({
            deliveryConfirmationOtpHash: otpHash,
            deliveryConfirmationOtpExpiresAt: "2026-08-15 14:30:00",
          }),
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // attempts increment
    await expect(
      updateDeliveryConfirmation(
        "dc-123",
        { otpCode: "000000", receiverSignature: "sig" },
        "u-driver",
        2,
      ),
    ).rejects.toMatchObject({
      statusCode: AppError.BAD_REQUEST,
      message: expect.stringContaining("Invalid OTP"),
    });
    const [, values] = mockPool.query.mock.calls.find(([sql]) =>
      String(sql).includes("deliveryConfirmationOtpAttempts"),
    );
    expect(values[0]).toBe(1);
  });

  it("rejects an expired OTP with 410 GONE", async () => {
    mockPool.query.mockResolvedValueOnce([
      [
        baseRow({
          deliveryConfirmationOtpHash: otpHash,
          deliveryConfirmationOtpExpiresAt: "2026-08-15 13:30:00",
        }),
      ],
    ]);
    await expect(
      updateDeliveryConfirmation(
        "dc-123",
        { otpCode: "123456", receiverSignature: "sig" },
        "u-driver",
        2,
      ),
    ).rejects.toMatchObject({
      statusCode: AppError.GONE,
      message: expect.stringContaining("expired"),
    });
  });

  it("rejects after the attempt cap is reached", async () => {
    mockPool.query.mockResolvedValueOnce([
      [
        baseRow({
          deliveryConfirmationOtpHash: otpHash,
          deliveryConfirmationOtpExpiresAt: "2026-08-15 14:30:00",
          deliveryConfirmationOtpAttempts: 5,
        }),
      ],
    ]);
    await expect(
      updateDeliveryConfirmation(
        "dc-123",
        { otpCode: "123456", receiverSignature: "sig" },
        "u-driver",
        2,
      ),
    ).rejects.toMatchObject({
      statusCode: AppError.BAD_REQUEST,
      message: expect.stringContaining("Too many"),
    });
  });

  it("accepts the test code without a prior OTP request (dev create→sign flow)", async () => {
    mockPool.query
      .mockResolvedValueOnce([[baseRow()]]) // no OTP hash at all
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // verifiedAt
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // main UPDATE
    await updateDeliveryConfirmation(
      "dc-123",
      { otpCode: "101010", receiverSignature: "sig" },
      "u-driver",
      2,
    );
    const [sql] = updateCalls().at(-1);
    expect(sql).toContain("deliveryConfirmationReceiverSignature = ?");
  });

  it("accepts a valid OTP and binds the receiver signature with a timestamp", async () => {
    mockPool.query
      .mockResolvedValueOnce([
        [
          baseRow({
            deliveryConfirmationOtpHash: otpHash,
            deliveryConfirmationOtpExpiresAt: "2026-08-15 14:30:00",
          }),
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // verifiedAt
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // main UPDATE
    await updateDeliveryConfirmation(
      "dc-123",
      { otpCode: "123456", receiverSignature: "sig" },
      "u-driver",
      2,
    );
    const [sql] = updateCalls().at(-1);
    expect(sql).toContain("deliveryConfirmationReceiverSignature = ?");
    expect(sql).toContain(
      "deliveryConfirmationReceiverSignedAt = COALESCE(deliveryConfirmationReceiverSignedAt, ?)",
    );
  });
});

describe("updateDeliveryConfirmation — photo append", () => {
  it("inserts new photos into the evidence set on update", async () => {
    mockPool.query
      .mockResolvedValueOnce([[baseRow()]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // main UPDATE
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // photo INSERT
    await updateDeliveryConfirmation(
      "dc-123",
      { photoUrls: ["/uploads/new1.jpg"] },
      "u-driver",
      2,
    );
    const insertCall = mockPool.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO DeliveryConfirmationPhotos"),
    );
    expect(insertCall).toBeTruthy();
    expect(insertCall[1]).toContain("/uploads/new1.jpg");
  });
});

describe("createDeliveryConfirmation — one per journey", () => {
  it("hands back the existing record when the journey already has one (idempotent)", async () => {
    getData
      .mockResolvedValueOnce([{ journeyUniqueId: "j-1" }]) // journey exists
      .mockResolvedValueOnce([{ userUniqueId: "u-receiver" }]); // receiver exists
    mockPool.query
      .mockRejectedValueOnce(
        Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" }),
      )
      // getDeliveryConfirmations: count, data, photos
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([
        [
          {
            deliveryConfirmationUniqueId: "dc-existing",
            journeyUniqueId: "j-1",
            receiverUserUniqueId: "u-receiver",
            deliveryConfirmationStatus: "PENDING",
            deliveryConfirmationDeliveredQuantity: "10.000",
            deliveryConfirmationQuantityUnit: "quintal",
            deliveryConfirmationCondition: "GOOD",
            deliveryConfirmationPhotoUrl: null,
          },
        ],
      ])
      .mockResolvedValueOnce([[]]); // no photos
    const result = await createDeliveryConfirmation({
      journeyUniqueId: "j-1",
      receiverUserUniqueId: "u-receiver",
      createdBy: "u-driver",
      condition: "GOOD",
      photoUrls: ["/uploads/a.jpg"],
      latitude: 9.0108,
      longitude: 38.7612,
    });
    expect(result).toMatchObject({
      isExisting: true,
      message: expect.stringContaining("already exists"),
      data: {
        deliveryConfirmationUniqueId: "dc-existing",
        deliveryConfirmationStatus: "PENDING",
      },
    });
  });

  it("settles the driver's PENDING record when the shipper self-confirms (idempotent)", async () => {
    getData.mockResolvedValueOnce([
      { journeyUniqueId: "j-1", journeyStatusId: 9 },
    ]); // journey exists + completed
    mockPool.query
      // createShipperDirectConfirmation: journey→shipper, receiver, INSERT(dup)
      .mockResolvedValueOnce([[{ shipperUserUniqueId: "u-shipper" }]])
      .mockResolvedValueOnce([
        [{ fullName: "Marta Bekele", phoneNumber: "+251900000000" }],
      ])
      .mockRejectedValueOnce(
        Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" }),
      )
      // getDeliveryConfirmations: count, data, photos
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([
        [
          {
            deliveryConfirmationUniqueId: "dc-existing",
            journeyUniqueId: "j-1",
            receiverUserUniqueId: "u-shipper",
            deliveryConfirmationStatus: "PENDING",
            deliveryConfirmationPhotoUrl: null,
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      // updateDeliveryConfirmation (settle): current, journey, receiver, photos, UPDATE
      .mockResolvedValueOnce([
        [
          baseRow({
            deliveryConfirmationUniqueId: "dc-existing",
            receiverUserUniqueId: "u-shipper",
          }),
        ],
      ])
      .mockResolvedValueOnce([[{ journeyStatusId: 9 }]])
      .mockResolvedValueOnce([
        [{ fullName: "Marta Bekele", phoneNumber: "+251900000000" }],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await createDeliveryConfirmation({
      journeyUniqueId: "j-1",
      createdBy: "u-shipper",
      roleId: 1,
      shipperSignature: "sig",
      status: "CONFIRMED",
      photoUrls: [],
    });

    expect(result).toMatchObject({
      isExisting: true,
      message: expect.stringContaining("confirmed by the shipper"),
      data: { deliveryConfirmationUniqueId: "dc-existing" },
    });
    const [updateSql] = updateCalls().at(-1);
    expect(updateSql).toContain("deliveryConfirmationShipperSignature = ?");
    expect(updateSql).toContain("confirmedByUserUniqueId = ?");
  });
});

describe("deleteDeliveryConfirmation — settled-record guard", () => {
  it("blocks non-admin deletion of a CONFIRMED record", async () => {
    mockPool.query.mockResolvedValueOnce([
      [baseRow({ deliveryConfirmationStatus: "CONFIRMED" })],
    ]);
    await expect(
      deleteDeliveryConfirmation("dc-123", "u-driver", 2),
    ).rejects.toMatchObject({
      statusCode: AppError.FORBIDDEN,
      message: expect.stringContaining("cannot be deleted"),
    });
  });

  it("allows admin deletion of a CONFIRMED record (audited soft delete)", async () => {
    mockPool.query
      .mockResolvedValueOnce([
        [baseRow({ deliveryConfirmationStatus: "CONFIRMED" })],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // soft-delete UPDATE
    await expect(
      deleteDeliveryConfirmation("dc-123", "u-admin", 3),
    ).resolves.toMatchObject({
      message: expect.stringContaining("deleted successfully"),
    });
  });

  it("allows non-admin deletion of a PENDING record", async () => {
    mockPool.query
      .mockResolvedValueOnce([[baseRow()]]) // PENDING
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(
      deleteDeliveryConfirmation("dc-123", "u-driver", 2),
    ).resolves.toBeTruthy();
  });

  it("returns 404 for an unknown confirmation", async () => {
    mockPool.query.mockResolvedValueOnce([[]]);
    await expect(
      deleteDeliveryConfirmation("dc-missing", "u-driver", 2),
    ).rejects.toMatchObject({ statusCode: AppError.NOT_FOUND });
  });
});

describe("createDeliveryConfirmation — receiverSignedAt at create", () => {
  const createQueries = () => {
    getData
      .mockResolvedValueOnce([{ journeyUniqueId: "j-1" }]) // journey exists
      .mockResolvedValueOnce([{ userUniqueId: "u-receiver" }]); // receiver exists
    mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT
  };

  it("stamps receiverSignedAt when a signature is provided at create", async () => {
    createQueries();
    await createDeliveryConfirmation({
      journeyUniqueId: "j-1",
      receiverUserUniqueId: "u-receiver",
      createdBy: "u-driver",
      receiverSignature: "sig",
      condition: "GOOD",
      photoUrls: ["/uploads/a.jpg"],
      latitude: 9.0108,
      longitude: 38.7612,
    });
    // INSERT values: [uniqueId, journey, receiver, qty, unit, condition,
    //                 signature, receiverSignedAt, photo, ...]
    const [, values] = mockPool.query.mock.calls[0];
    expect(values[6]).toBe("sig");
    expect(values[7]).toBe(NOW);
  });

  it("leaves receiverSignedAt null when no signature is provided", async () => {
    createQueries();
    await createDeliveryConfirmation({
      journeyUniqueId: "j-1",
      receiverUserUniqueId: "u-receiver",
      createdBy: "u-driver",
      condition: "GOOD",
      photoUrls: ["/uploads/a.jpg"],
      latitude: 9.0108,
      longitude: 38.7612,
    });
    const [, values] = mockPool.query.mock.calls[0];
    expect(values[6]).toBeNull();
    expect(values[7]).toBeNull();
  });
});

describe("createDeliveryConfirmation — proof photo required at submission", () => {
  it("rejects a PENDING submission without at least one proof photo", async () => {
    getData.mockResolvedValueOnce([{ journeyUniqueId: "j-1" }]); // journey exists
    await expect(
      createDeliveryConfirmation({
        journeyUniqueId: "j-1",
        receiverUserUniqueId: "u-receiver",
        createdBy: "u-driver",
        condition: "GOOD",
        photoUrls: [],
        latitude: 9.0108,
        longitude: 38.7612,
      }),
    ).rejects.toMatchObject({
      statusCode: AppError.BAD_REQUEST,
      message: expect.stringContaining("proof photo"),
    });
  });

  it("rejects a PENDING submission without GPS coordinates", async () => {
    getData.mockResolvedValueOnce([{ journeyUniqueId: "j-1" }]); // journey exists
    await expect(
      createDeliveryConfirmation({
        journeyUniqueId: "j-1",
        receiverUserUniqueId: "u-receiver",
        createdBy: "u-driver",
        condition: "GOOD",
        photoUrls: ["/uploads/a.jpg"],
      }),
    ).rejects.toMatchObject({
      statusCode: AppError.BAD_REQUEST,
      message: expect.stringContaining("GPS"),
    });
  });

  it("accepts a PENDING submission when a photo is present", async () => {
    getData
      .mockResolvedValueOnce([{ journeyUniqueId: "j-1", journeyStatusId: 9 }]) // journey
      .mockResolvedValueOnce([{ userUniqueId: "u-receiver" }]); // receiver exists
    mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT
    const result = await createDeliveryConfirmation({
      journeyUniqueId: "j-1",
      receiverUserUniqueId: "u-receiver",
      createdBy: "u-driver",
      condition: "GOOD",
      photoUrls: ["/uploads/a.jpg"],
      latitude: 9.0108,
      longitude: 38.7612,
    });
    expect(result).toMatchObject({
      data: { deliveryConfirmationStatus: "PENDING" },
    });
  });
});

describe("createDeliveryConfirmation — shipper-initiated direct POD (status CONFIRMED)", () => {
  const directQueries = ({
    journeyStatusId = 9,
    journeyShipperId = "u-shipper",
    receiverName = "Marta Bekele",
  } = {}) => {
    getData.mockResolvedValueOnce([
      { journeyUniqueId: "j-1", journeyStatusId },
    ]); // journey exists
    mockPool.query
      .mockResolvedValueOnce([[{ shipperUserUniqueId: journeyShipperId }]]) // journey→shipper
      .mockResolvedValueOnce([
        [{ fullName: receiverName, phoneNumber: "+251900000000" }],
      ]) // receiver (shipper default)
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT
  };

  it("creates a CONFIRMED record for the journey's shipper (no photo/GPS required)", async () => {
    directQueries();
    const result = await createDeliveryConfirmation({
      journeyUniqueId: "j-1",
      createdBy: "u-shipper",
      shipperSignature: "sig-b64",
      deliveredQuantity: 20,
      quantityUnit: "kg",
      condition: "GOOD",
      notes: "Left with the gatehouse.",
      status: "CONFIRMED",
      photoUrls: [],
    });

    expect(result).toMatchObject({
      message: "Delivery confirmation created successfully",
      data: {
        receiverUserUniqueId: "u-shipper",
        deliveryConfirmationStatus: "CONFIRMED",
      },
    });

    const [sql, values] = mockPool.query.mock.calls[2];
    expect(String(sql)).toContain("'CONFIRMED'");
    expect(String(sql)).toContain("deliveryConfirmationShipperSignature");
    expect(String(sql)).toContain("deliveryConfirmationSignatureHash");
    expect(String(sql)).toContain("confirmedByUserUniqueId");
    expect(String(sql)).toContain("deliveryConfirmationShipperSignedAt");
    expect(values).toContain("u-shipper"); // receiver defaults to shipper
    expect(values).toContain("sig-b64");
    expect(values.some((v) => typeof v === "string" && v.includes("Marta Bekele"))).toBe(
      true,
    );
    // Immutable SHA-256 settle hash computed at insert (no photo/GPS → empty/blank).
    // INSERT values: [uniqueId, journey, receiver, qty, unit, condition, sig,
    //                 signedAt, statement, HASH, photo, notes, submittedAt,
    //                 createdBy, confirmedBy, confirmedAt, createdAt, updatedAt]
    const storedHash = values[9];
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(storedHash).toBe(
      expectedHash({
        journeyUniqueId: "j-1",
        receiverSignature: "",
        shipperSignature: "sig-b64",
        photoUrls: [],
        deliveredQuantity: 20,
        quantityUnit: "kg",
        condition: "GOOD",
        latitude: "",
        longitude: "",
        confirmedAt: NOW,
      }),
    );
  });

  it("attributes shipper-attached photos and notifies the driver", async () => {
    directQueries();
    mockPool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // photos INSERT
      .mockResolvedValueOnce([
        // notifyDriverOfPodConfirmed: journey→driver JOIN
        [{ driverUserUniqueId: "u-driver", driverPhoneNumber: "+251911111111" }],
      ]);
    sendSocketIONotificationToDriver.mockResolvedValueOnce({ status: "success" });
    sendFCMNotificationToUser.mockResolvedValueOnce({ status: "success" });
    await createDeliveryConfirmation({
      journeyUniqueId: "j-1",
      createdBy: "u-shipper",
      shipperSignature: "sig",
      status: "CONFIRMED",
      photoUrls: ["/uploads/d.jpg"],
    });

    // INSERT into DeliveryConfirmationPhotos stamps the attaching user.
    const photosInsert = mockPool.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO DeliveryConfirmationPhotos"),
    );
    expect(photosInsert).toBeTruthy();
    expect(photosInsert[1]).toEqual([
      expect.any(String), // deliveryConfirmationPhotoUniqueId
      expect.any(String), // deliveryConfirmationUniqueId
      "/uploads/d.jpg",
      "u-shipper",
    ]);
    expect(sendSocketIONotificationToDriver).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: expect.any(String),
        message: expect.objectContaining({ message: "POD confirmed." }),
      }),
    );
  });

  it("403 when a non-shipper (e.g. the driver) tries to self-confirm", async () => {
    directQueries({ journeyShipperId: "u-real-shipper" });
    await expect(
      createDeliveryConfirmation({
        journeyUniqueId: "j-1",
        createdBy: "u-driver",
        receiverSignature: "driver-sig",
        status: "CONFIRMED",
        photoUrls: [],
      }),
    ).rejects.toMatchObject({
      statusCode: AppError.FORBIDDEN,
      message: expect.stringContaining("Only the shipper"),
    });
  });

  it("400 when the journey is not completed yet", async () => {
    directQueries({ journeyStatusId: 5 }); // journeyStarted
    await expect(
      createDeliveryConfirmation({
        journeyUniqueId: "j-1",
        createdBy: "u-shipper",
        shipperSignature: "sig",
        status: "CONFIRMED",
        photoUrls: [],
      }),
    ).rejects.toMatchObject({
      statusCode: AppError.BAD_REQUEST,
      message: expect.stringContaining("completed journey"),
    });
  });

  it("400 when no shipper signature is provided", async () => {
    directQueries();
    await expect(
      createDeliveryConfirmation({
        journeyUniqueId: "j-1",
        createdBy: "u-shipper",
        status: "CONFIRMED",
        photoUrls: [],
      }),
    ).rejects.toMatchObject({
      statusCode: AppError.BAD_REQUEST,
      message: expect.stringContaining("shipper signature"),
    });
  });

  it("driver-initiated create without CONFIRMED status still creates a PENDING record", async () => {
    getData
      .mockResolvedValueOnce([{ journeyUniqueId: "j-1", journeyStatusId: 9 }]) // journey
      .mockResolvedValueOnce([{ userUniqueId: "u-receiver" }]); // receiver exists
    mockPool.query.mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT
    const result = await createDeliveryConfirmation({
      journeyUniqueId: "j-1",
      receiverUserUniqueId: "u-receiver",
      createdBy: "u-driver",
      condition: "GOOD",
      photoUrls: ["/uploads/a.jpg"],
      latitude: 9.0108,
      longitude: 38.7612,
    });
    expect(result).toMatchObject({
      data: { deliveryConfirmationStatus: "PENDING" },
    });
  });
});

describe("requestSignOtp — per-phone hourly cap", () => {
  const requestQueries = (rowOverrides = {}) => {
    mockPool.query
      .mockResolvedValueOnce([
        [
          baseRow({
            // expired code so the active-code gate passes
            deliveryConfirmationOtpExpiresAt: "2026-08-15 13:30:00",
            ...rowOverrides,
          }),
        ],
      ])
      .mockResolvedValueOnce([
        [{ fullName: "Abebe Kebede", phoneNumber: "+251911234567" }],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
  };

  it("allows up to 5 requests per hour, then blocks with 429", async () => {
    for (let count = 0; count < 5; count += 1) {
      requestQueries({
        deliveryConfirmationOtpRequestCount: count,
        deliveryConfirmationOtpWindowStartAt: NOW, // window already open
      });
      await expect(requestSignOtp("dc-123")).resolves.toMatchObject({
        message: "OTP sent to the receiver",
      });
    }
    requestQueries({
      deliveryConfirmationOtpRequestCount: 5,
      deliveryConfirmationOtpWindowStartAt: NOW,
    });
    await expect(requestSignOtp("dc-123")).rejects.toMatchObject({
      statusCode: AppError.TOO_MANY_REQUESTS,
      message: expect.stringContaining("Too many OTP requests"),
    });
  });

  it("resets the counter once the hourly window expires", async () => {
    // Window started 2 hours ago (older than minutesAgo(60) = 13:00:00) with 5
    // requests already used — a new request must be allowed after reset.
    requestQueries({
      deliveryConfirmationOtpRequestCount: 5,
      deliveryConfirmationOtpWindowStartAt: "2026-08-15 12:00:00",
    });
    const result = await requestSignOtp("dc-123");
    expect(result.message).toBe("OTP sent to the receiver");
    // The OTP UPDATE carries the reset counter (1) and new window start (NOW).
    const [, values] = mockPool.query.mock.calls.find(([sql]) =>
      String(sql).includes("deliveryConfirmationOtpRequestCount"),
    );
    expect(values[2]).toBe(1);
    expect(values[3]).toBe(NOW);
  });
});

describe("verifyDeliveryConfirmationHash — admin tool", () => {
  it("rejects non-admin callers", async () => {
    await expect(
      verifyDeliveryConfirmationHash("dc-123", 2),
    ).rejects.toMatchObject({
      statusCode: AppError.FORBIDDEN,
      message: expect.stringContaining("Only an admin"),
    });
  });

  it("marks rows settled before the hash feature as legacy", async () => {
    mockPool.query.mockResolvedValueOnce([[baseRow({ deliveryConfirmationSignatureHash: null })]]);
    const result = await verifyDeliveryConfirmationHash("dc-123", 3);
    expect(result.data).toMatchObject({ legacy: true, valid: null });
  });

  it("returns valid=true when the stored hash matches the recomputed hash", async () => {
    const confirmedAt = NOW;
    const row = baseRow({
      deliveryConfirmationShipperSignature: "sig-b64",
      deliveryConfirmationConfirmedAt: confirmedAt,
      deliveryConfirmationSignatureHash: expectedHash({
        journeyUniqueId: "j-1",
        receiverSignature: "",
        shipperSignature: "sig-b64",
        photoUrls: ["/uploads/a.jpg"],
        deliveredQuantity: "25.000",
        quantityUnit: "quintal",
        condition: "GOOD",
        latitude: "9.01080000",
        longitude: "38.76120000",
        confirmedAt,
      }),
    });
    mockPool.query
      .mockResolvedValueOnce([[row]])
      .mockResolvedValueOnce([[{ deliveryConfirmationPhotoUrl: "/uploads/a.jpg" }]]);
    const result = await verifyDeliveryConfirmationHash("dc-123", 6);
    expect(result.data.valid).toBe(true);
    expect(result.data.legacy).toBe(false);
  });

  it("returns valid=false for a tampered stored hash", async () => {
    const row = baseRow({
      deliveryConfirmationSignatureHash: "deadbeef",
      deliveryConfirmationConfirmedAt: NOW,
    });
    mockPool.query
      .mockResolvedValueOnce([[row]])
      .mockResolvedValueOnce([[]]); // no stored photos
    const result = await verifyDeliveryConfirmationHash("dc-123", 3);
    expect(result.data.valid).toBe(false);
    expect(result.data.storedHash).toBe("deadbeef");
  });
});

describe("notifyShipperOfPodSubmit — FCM push", () => {
  it("notifies the journey's shipper (roleId 1) with the journey id", async () => {
    mockPool.query.mockResolvedValueOnce([
      [{ shipperUserUniqueId: "u-shipper" }],
    ]);
    await notifyShipperOfPodSubmit("j-1");
    expect(sendFCMNotificationToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userUniqueId: "u-shipper",
        roleId: 1,
        data: { journeyUniqueId: "j-1" },
      }),
    );
  });

  it("pushes a WebSocket message to the shipper when a phone number is known", async () => {
    mockPool.query.mockResolvedValueOnce([
      [
        {
          shipperUserUniqueId: "u-shipper",
          shipperRequestId: 42,
          shipperPhoneNumber: "+251911000000",
        },
      ],
    ]);
    sendSocketIONotificationToShipper.mockResolvedValueOnce({
      status: "success",
    });
    await notifyShipperOfPodSubmit("j-1", "dc-9");
    expect(sendSocketIONotificationToShipper).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: "+251911000000",
        message: expect.objectContaining({
          message: "POD submitted.",
          data: expect.objectContaining({
            journeyUniqueId: "j-1",
            deliveryConfirmationUniqueId: "dc-9",
          }),
        }),
      }),
    );
  });

  it("skips quietly when the journey has no shipper", async () => {
    mockPool.query.mockResolvedValueOnce([[]]);
    const result = await notifyShipperOfPodSubmit("j-1");
    expect(result.message).toContain("No shipper");
    expect(sendFCMNotificationToUser).not.toHaveBeenCalled();
  });

  it("never throws when FCM fails", async () => {
    mockPool.query.mockResolvedValueOnce([
      [{ shipperUserUniqueId: "u-shipper" }],
    ]);
    sendFCMNotificationToUser.mockRejectedValueOnce(new Error("fcm down"));
    const result = await notifyShipperOfPodSubmit("j-1");
    expect(result.message).toBe("Notification skipped");
  });
});

describe("requestSignOtp — Tier-A OTP issuance", () => {
  const originalNodeEnv = Config.NODE_ENV;
  const originalUseTestOtp = Config.USE_TEST_OTP;

  afterEach(() => {
    Config.NODE_ENV = originalNodeEnv;
    Config.USE_TEST_OTP = originalUseTestOtp;
  });

  it("skips SMS and issues the fixed test OTP (101010) outside production", async () => {
    Config.NODE_ENV = "development";
    Config.USE_TEST_OTP = false;
    sendSms.mockClear();
    mockPool.query
      .mockResolvedValueOnce([[baseRow()]])
      .mockResolvedValueOnce([
        [{ fullName: "Abebe Kebede", phoneNumber: "+251911234567" }],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // OTP fields UPDATE
    const result = await requestSignOtp("dc-123");
    expect(result.message).toBe("OTP sent to the receiver");
    expect(sendSms).not.toHaveBeenCalled();
    const [, values] = mockPool.query.mock.calls.find(([q]) =>
      String(q).includes("deliveryConfirmationOtpHash"),
    );
    expect(String(values[0])).not.toBe("101010"); // stored hashed, not plaintext
    expect(await bcrypt.compare("101010", String(values[0]))).toBe(true);
  });

  it("sends a random 6-digit OTP via SMS in production", async () => {
    Config.NODE_ENV = "production";
    Config.USE_TEST_OTP = false;
    sendSms.mockClear();
    mockPool.query
      .mockResolvedValueOnce([[baseRow()]])
      .mockResolvedValueOnce([
        [{ fullName: "Abebe Kebede", phoneNumber: "+251911234567" }],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // OTP fields UPDATE
    const result = await requestSignOtp("dc-123");
    expect(result.message).toBe("OTP sent to the receiver");
    expect(sendSms).toHaveBeenCalledWith(
      "+251911234567",
      expect.stringMatching(/^\d{6}$/),
    );
    const [sql, values] = mockPool.query.mock.calls.find(([q]) =>
      String(q).includes("deliveryConfirmationOtpHash"),
    );
    expect(sql).toContain("deliveryConfirmationOtpExpiresAt");
    expect(sql).toContain("deliveryConfirmationOtpAttempts = 0");
    expect(String(values[0])).not.toBe(String(sendSms.mock.calls[0][1])); // stored hashed, not plaintext
  });

  it("blocks a resend while an OTP is still active", async () => {
    mockPool.query.mockResolvedValueOnce([
      [
        baseRow({
          deliveryConfirmationOtpHash: "x",
          deliveryConfirmationOtpExpiresAt: "2026-08-15 14:30:00",
        }),
      ],
    ]);
    await expect(requestSignOtp("dc-123")).rejects.toMatchObject({
      statusCode: AppError.TOO_MANY_REQUESTS,
    });
  });

  it("only issues OTPs while the confirmation is PENDING", async () => {
    mockPool.query.mockResolvedValueOnce([
      [baseRow({ deliveryConfirmationStatus: "CONFIRMED" })],
    ]);
    await expect(requestSignOtp("dc-123")).rejects.toMatchObject({
      statusCode: AppError.BAD_REQUEST,
      message: expect.stringContaining("PENDING"),
    });
  });
});
