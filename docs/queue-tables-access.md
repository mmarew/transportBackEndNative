# Queue Dispatch — Backend Database Access Guide

How the backend accesses the queue-dispatch tables added in
`Database/Database.js` (schema defined at `Database/Database.js:1930-2077`).
Design/semantics live in [queue-dispatch-design.md](queue-dispatch-design.md);
this doc is the concrete access reference (columns, FK paths, indexes, and the
query/transaction patterns to use).

> Status: schema landed on branch `feature/queue-dispatch`. Backend services are
> NOT yet implemented — see [§6](#6-implementation-checklist).

## 1. Tables added

| Table | Lines (Database.js) | Purpose |
|---|---|---|
| `QueueOrganization` | `1935-1967` | A client that hosts a virtual dispatch queue (Mojo Kaliy, National Cement, …) |
| `QueueOrganizationMembership` | `1969-2003` | Links users (role 11 QueueOrgAdmin / role 1 shipper) to a queue org |
| `DriverQueue` | `2005-2077` | The waiting line: one entry per vehicle per org per day |

All FKs reference tables that already existed (`Users`, `Roles`,
`VehicleDriver`, `ShipperRequest`). No forward FK references; the whole schema
can be recreated in one pass via `npm run db:create`.

## 2. Column reference

### `QueueOrganization`

| Column | Type | Notes |
|---|---|---|
| `queueOrganizationId` | INT AUTO_INCREMENT PK | |
| `queueOrganizationUniqueId` | VARCHAR(36) UNIQUE | UUID used in all APIs |
| `queueOrganizationName` | VARCHAR(255) NOT NULL | |
| `queueOrganizationType` | ENUM('customs','factory','cement','depot','other') | |
| `queueOrganizationPhone` | VARCHAR(20) NULL | |
| `queueOrganizationAddress` | VARCHAR(500) NULL | |
| `latitude` | DECIMAL(10,8) NULL | Site reference / pickup point, NOT a check-in gate |
| `longitude` | DECIMAL(11,8) NULL | |
| `approvalStatus` | ENUM('pending','approved','rejected','suspended') DEFAULT 'pending' | |
| `approvalReason` | VARCHAR(500) NULL | |
| `queueEnabled` | BOOLEAN DEFAULT FALSE | Opts into queue dispatch |
| `approvedBy` | VARCHAR(36) NULL → `Users.userUniqueId` | |
| `approvedAt` | DATETIME NULL | |
| `…CreatedAt/CreatedBy/UpdatedAt/UpdatedBy/DeletedAt/DeletedBy` | | CreatedBy/UpdatedBy/DeletedBy → `Users.userUniqueId` |
| `isDeleted` | BOOLEAN DEFAULT FALSE | |

Indexes: `queueOrganizationType`, `approvalStatus`, `isDeleted`.

### `QueueOrganizationMembership`

| Column | Type | Notes |
|---|---|---|
| `queueOrganizationMembershipId` | INT AUTO_INCREMENT PK | |
| `queueOrganizationMembershipUniqueId` | VARCHAR(36) UNIQUE | |
| `queueOrganizationUniqueId` | VARCHAR(36) → `QueueOrganization.queueOrganizationUniqueId` | |
| `userUniqueId` | VARCHAR(36) → `Users.userUniqueId` | |
| `roleId` | INT → `Roles.roleId` | 11 = queueOrgAdmin, 1 = shipper |
| `isActive` | BOOLEAN DEFAULT TRUE | |
| `membershipStartDate` / `membershipEndDate` | DATETIME | |
| audit `…CreatedAt/CreatedBy/Updated/Deleted` | | → `Users.userUniqueId` |

`UNIQUE (queueOrganizationUniqueId, userUniqueId)` — one active membership per
user per queue org (mirrors `CompanyMembership`).

### `DriverQueue`

| Column | Type | Notes |
|---|---|---|
| `queueId` | INT AUTO_INCREMENT PK | |
| `queueUniqueId` | VARCHAR(36) UNIQUE | |
| `queueOrganizationUniqueId` | VARCHAR(36) → `QueueOrganization.queueOrganizationUniqueId` | |
| `queueDate` | DATE | Daily reset key |
| `queueNumber` | INT NOT NULL | Sequence per (org, date, vehicleType) |
| `vehicleDriverUniqueId` | VARCHAR(36) → `VehicleDriver.vehicleDriverUniqueId` | The truck+driver unit in line |
| `shipperRequestUniqueId` | VARCHAR(36) NULL → `ShipperRequest.shipperRequestUniqueId` | Order assigned to this entry |
| `joinedAt` | DATETIME DEFAULT CURRENT_TIMESTAMP | Server-stamped check-in = dispute truth |
| `status` | ENUM('waiting','offered','loaded','removed') DEFAULT 'waiting' | |
| `offeredAt` / `loadedAt` | DATETIME NULL | |
| audit `…CreatedAt/CreatedBy/Updated/Deleted` | | → `Users.userUniqueId` |

`UNIQUE (vehicleDriverUniqueId, queueOrganizationUniqueId, queueDate)` — one
entry per vehicle/day. Dispatch index:
`(queueOrganizationUniqueId, queueDate, queueNumber)`.

## 3. Derived fields — do NOT store

- **Driver** → `VehicleDriver.driverUserUniqueId` (via `vehicleDriverUniqueId`).
- **Vehicle type** → `VehicleDriver.vehicleUniqueId → Vehicle.vehicleTypeUniqueId`.

```sql
SELECT dq.*, vd.driverUserUniqueId, v.vehicleTypeUniqueId
FROM DriverQueue dq
JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
JOIN Vehicle v          ON v.vehicleUniqueId         = vd.vehicleUniqueId;
```

## 4. How services query

### Import the pool (standard)

```js
const { pool } = require("../Middleware/Database.config");
// or, from Services/<Feature>/:  require("../../Middleware/Database.config")
```

### Simple read

```js
const [rows] = await pool.query(
  `SELECT queueNumber, joinedAt
   FROM DriverQueue
   WHERE queueOrganizationUniqueId = ? AND queueDate = ?
     AND status = 'waiting'
   ORDER BY queueNumber ASC`,
  [queueOrganizationUniqueId, queueDate],
);
```

DECIMAL/`DATE` columns come back as strings from mysql2; parse before returning.

### Transactions (multi-step writes)

Use `executeInTransaction` from `Utils/DatabaseTransaction.js`. It runs the
callback with a dedicated connection, sets `innodb_lock_wait_timeout`, and
auto-commits/rolls back. The connection is also published to
`Utils/TransactionContext.js` `transactionStorage`, so any helper that queries
via `transactionStorage.getStore() || pool` automatically participates.

```js
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");

await executeInTransaction(async (connection) => {
  await connection.query(
    `INSERT INTO DriverQueue (queueUniqueId, queueOrganizationUniqueId, queueDate, queueNumber, vehicleDriverUniqueId, queueCreatedBy)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [queueUniqueId, queueOrganizationUniqueId, queueDate, queueNumber, vehicleDriverUniqueId, userId],
  );
});
```

### Executor pattern used by existing services

```js
const { transactionStorage } = require("../../Utils/TransactionContext");
const executor = () => transactionStorage.getStore() || pool;
const [rows] = await executor().query(sql, values);
```

Use this in helper functions that may be called both inside and outside a
transaction.

### Ticket machine — issue `queueNumber`

Must be atomic (COUNT + 1 inside a transaction with a lock on the org+date+type
key, or use the `UNIQUE (vehicleDriverUniqueId, queueOrganizationUniqueId,
queueDate)` constraint to reject duplicate check-ins):

```js
const [agg] = await connection.query(
  `SELECT COALESCE(MAX(queueNumber), 0) + 1 AS nextNumber
   FROM DriverQueue
   WHERE queueOrganizationUniqueId = ? AND queueDate = ?`,
  [queueOrganizationUniqueId, queueDate],
);
```

Vehicle type is resolved per entry via the §3 join; if numbering must be
per-type, include the derived type in the `WHERE`/partition.

## 5. Role 11 (`queueOrgAdmin`) — pending seed

Role id **11** must be seeded before membership rows can reference it:

- `Utils/ListOfSeedData.js` → add `queueOrgAdminRoleId: 11` to the roles seed
  (existing ids run 1–10).
- `Roles` table gets a row `(11, 'queueOrgAdmin', …)`.

Not yet done — part of the backend implementation task.

## 6. Implementation checklist

Not started (design-only so far). Order:

1. [ ] Seed role 11 (`Utils/ListOfSeedData.js` + `Roles`).
2. [ ] `QueueOrganization` CRUD + admin approve/`queueEnabled` routes (§8 endpoints in the design doc).
3. [ ] `QueueOrganizationMembership` (role-gated by 11 / shipper 1).
4. [ ] `DriverQueue` check-in / position / checkout (ticket-machine numbering).
5. [ ] `handleQueueDispatch` branch in `Services/ShipperRequest/create.service.js` (offer to front driver via JourneyDecision; reuse `automaticTimeout.service.js` for the offer timer).
6. [ ] QueueOrgAdmin manage/override endpoints (audit-logged).

## 7. Related docs

- `docs/queue-dispatch-design.md` — full design, endpoints, dispatch rules, open questions.
- `docs/setup.md` — `npm run db:create` / `db:seed`.
- `Middleware/Database.config.js` — pool + `getConnection` + `ping`.
- `Utils/DatabaseTransaction.js` / `Utils/TransactionContext.js` — transaction helpers.
