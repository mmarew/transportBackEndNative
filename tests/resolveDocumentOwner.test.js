/**
 * ResolveDocumentOwner middleware unit tests.
 *
 * Verifies that the owner context (ownerType / ownerUniqueId) used by
 * authorizeDocumentAccess() is always taken from the document row itself.
 */

jest.mock("../Middleware/Database.config", () => ({
  pool: { query: jest.fn() },
}));

jest.mock("../Utils/TransactionContext", () => ({
  transactionStorage: { getStore: jest.fn(() => undefined) },
}));

const { pool } = require("../Middleware/Database.config");
const { resolveDocumentOwner } = require("../Middleware/ResolveDocumentOwner");

const run = (req) =>
  new Promise((resolve) => {
    resolveDocumentOwner()(req, {}, (error) => resolve(error ?? null));
  });

describe("ResolveDocumentOwner", () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  it("sets owner context from a company document row", async () => {
    pool.query.mockResolvedValue([
      [
        {
          attachedDocumentUniqueId: "doc-1",
          ownerType: "company",
          ownerUniqueId: "company-1",
        },
      ],
    ]);

    const req = { params: { attachedDocumentUniqueId: "doc-1" } };
    const nextError = await run(req);

    expect(nextError).toBeNull();
    expect(req.ownerType).toBe("company");
    expect(req.ownerUniqueIdParam).toBe("company-1");
    expect(req.attachedDocument.ownerUniqueId).toBe("company-1");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM AttachedDocuments"),
      ["doc-1"],
    );
  });

  it("keeps vehicle documents on the vehicle branch", async () => {
    pool.query.mockResolvedValue([
      [
        {
          attachedDocumentUniqueId: "doc-2",
          ownerType: "vehicle",
          ownerUniqueId: "vehicle-9",
        },
      ],
    ]);

    const req = { params: { attachedDocumentUniqueId: "doc-2" } };
    await run(req);

    expect(req.ownerType).toBe("vehicle");
    expect(req.ownerUniqueIdParam).toBe("vehicle-9");
  });

  it("treats rows without ownerType as self-owned user documents", async () => {
    pool.query.mockResolvedValue([
      [
        {
          attachedDocumentUniqueId: "doc-3",
          ownerType: null,
          ownerUniqueId: "user-3",
        },
      ],
    ]);

    const req = { params: { attachedDocumentUniqueId: "doc-3" } };
    await run(req);

    expect(req.ownerType).toBe("user");
    expect(req.ownerUniqueIdParam).toBe("user-3");
  });

  it("returns 404 for an unknown document instead of guessing an owner", async () => {
    pool.query.mockResolvedValue([[]]);

    const req = { params: { attachedDocumentUniqueId: "missing" } };
    const nextError = await run(req);

    expect(nextError).not.toBeNull();
    expect(nextError.statusCode).toBe(404);
    expect(req.ownerType).toBeUndefined();
  });

  it("returns 400 when no document id is present", async () => {
    const nextError = await run({ params: {} });

    expect(nextError.statusCode).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});