# Queue Dispatch — Backend Database Access Guide

How the backend accesses the queue-dispatch tables added in
`Database/Database.js` (schema defined at `Database/Database.js:1930`).
Design/semantics live in [queue-dispatch-design.md](queue-dispatch-design.md);
this doc is the concrete access reference (columns, FK paths, indexes, and the
query/transaction patterns to use).

> Status: **implemented** on branch `feature/queue-dispatch` — schema, services,
> controllers, routes, socket events, the auto-offer branch
> (`handleQueueDispatch`), and the offer lifecycle (accept / reject / timeout) are
> all live. See [§6](#6-implementation-checklist).

## 1. Tables added

| Table | Lines (Database.js) | Purpose |
|---|---|---|
| `QueueOrganization` | `1935-1967` | A client that hosts a virtual dispatch queue (Mojo Kaliy, National Cement, …) |
| `QueueOrganizationMembership` | `1969-2003` | Links users (role 11 QueueOrgAdmin / role 1 shipper) to a queue org |
| `DriverQueue` | `2005-2077` | The waiting line: one entry per vehicle per org per day |
| `QueueAuditLog` | `2079-2108` | Immutable audit trail for overrides / removals / manual check-ins / dispatches |

All FKs reference tables that already existed (`Users`, `Roles`,
`VehicleDriver`, `ShipperRequest`). No forward FK references; the whole schema
can be recreated in one pass via `npm run db:create`.

One alteration to an **existing** table: `ShipperRequest` gains a
`queueOrganizationUniqueId` column (see §2.5). It is defined in the
`ShipperRequest` CREATE TABLE, and its index + FK are added **idempotently** by
`ensureQueueOrgReferences()` in `Services/Database/tableManage.service.js` (which
runs inside `createTable()` after the schema and checks `information_schema`), so
the schema can be re-run on an already-migrated database.

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

### `QueueAuditLog`

| Column | Type | Notes |
|---|---|---|
| `queueAuditId` | INT AUTO_INCREMENT PK | |
| `queueAuditUniqueId` | VARCHAR(36) UNIQUE | |
| `queueOrganizationUniqueId` | VARCHAR(36) → `QueueOrganization.queueOrganizationUniqueId` | |
| `queueDate` | DATE | Which day's queue changed |
| `queueUniqueId` | VARCHAR(36) NULL → `DriverQueue.queueUniqueId` | Affected entry |
| `action` | ENUM('override','remove','manual_checkin','dispatch') | |
| `beforeValue` / `afterValue` | VARCHAR(500) NULL | JSON snapshots |
| `reason` | VARCHAR(500) NULL | Supervisor note |
| `performedBy` | VARCHAR(36) → `Users.userUniqueId` | Who did it |
| `performedAt` | DATETIME DEFAULT CURRENT_TIMESTAMP | |

Indexes: `(queueOrganizationUniqueId, queueDate)`, `queueUniqueId`.

### 2.5 Alteration to `ShipperRequest` (existing table)

| Column | Type | Notes |
|---|---|---|
| `queueOrganizationUniqueId` | VARCHAR(36) NULL → `QueueOrganization.queueOrganizationUniqueId` | Set when the order is placed against a queue-enabled org |

Defined in the `ShipperRequest` CREATE TABLE (near `Database/Database.js:378`);
the index + FK are added idempotently after the schema runs, by
`ensureQueueOrgReferences()` in `Services/Database/tableManage.service.js`:

- Column missing → `ALTER TABLE ShipperRequest ADD COLUMN queueOrganizationUniqueId VARCHAR(36) NULL DEFAULT NULL`
- Index `idx_shipperRequest_queueOrg` missing → added on `(queueOrganizationUniqueId)`
- Constraint `fk_shipperRequest_queueOrg` missing → FK to `QueueOrganization(queueOrganizationUniqueId)`

Each step is guarded by an `information_schema` check, so running the full schema
init (`npm run db:create`) on an existing database is safe — an older database
that already has `ShipperRequest` without the column gets migrated in place.

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

## 5. REST + socket API (implemented)

All queue REST endpoints are on `Routes/queue/` (mounted in `Routes/index.js`)
and authenticated via `verifyTokenOfAxios`. Writes that change the queue also
push a real-time update over socket.io, so clients do **not** poll.

### REST endpoints

| Method | Endpoint | Access | Service |
|---|---|---|---|
| POST | `/api/queueOrganization` | Admin / SuperAdmin / CompanyAdmin | `Services/QueueOrganization.service.js:createQueueOrganization` |
| GET | `/api/queueOrganization?type=&approvalStatus=&queueEnabled=` | Authenticated | `getQueueOrganizations` |
| PATCH | `/api/queueOrganization/:id` | QueueOrgAdmin / Admin | `updateQueueOrganization` |
| PATCH | `/api/queueOrganization/:id/approve` | Admin / SuperAdmin | `approveQueueOrganization` |
| DELETE | `/api/queueOrganization/:id` | Admin / SuperAdmin | `deleteQueueOrganization` |
| POST | `/api/queueOrganization/:id/members/:userUniqueId` | QueueOrgAdmin / Admin | `addMember` (role 11 or 1) |
| GET | `/api/queueOrganization/:id/members` | QueueOrgAdmin / Admin | `getMembers` |
| POST | `/api/queue/driver/checkin` | Driver | `Services/DriverQueue.service.js:checkin` |
| GET | `/api/queue/driver/myPosition?queueOrganizationUniqueId=` | Driver | `myPosition` |
| DELETE | `/api/queue/driver/checkout` | Driver | `checkout` |
| GET | `/api/queue/status?queueOrganizationUniqueId=&date=` | QueueOrgAdmin / Admin | `getQueueStatus` |
| POST | `/api/queue/manualCheckin` | QueueOrgAdmin | `manualCheckin` |
| PATCH | `/api/queue/entry/:queueUniqueId/override` | QueueOrgAdmin | `overrideEntry` (audit logged) |
| DELETE | `/api/queue/entry/:queueUniqueId` | QueueOrgAdmin | `removeEntry` (audit logged) |
| POST | `/api/queue/dispatch` | QueueOrgAdmin | `dispatch` (offer front driver) |
| POST | `/api/shipperRequest` (+ optional `queueOrganizationUniqueId`) | Shipper | queue-enabled org order → `handleQueueDispatch` auto-offers the front driver |

### Socket events (Utils/QueueSocket.js + SocketAdapter.config.js)

Connection: same `io()` handshake as existing clients (`user` ∈ driver / shipper /
admin / company / **queueOrgAdmin**). Register `queueOrgAdmin` in
`Utils/WSPusher.js` valid user types (done).

| Event | Direction | Purpose |
|---|---|---|
| `queue:subscribe` | client → server | Join `queueOrg:<orgUniqueId>` (all dates) and `queueOrg:<orgUniqueId>:<queueDate>` (that day). Body `{ queueOrganizationUniqueId, queueDate? }` |
| `queue:subscribed` | server → client | Ack on join |
| `queue:unsubscribe` | client → server | Leave rooms |
| `queue:unsubscribed` | server → client | Ack on leave |
| `queue` | server → client | Live push: check-in / loaded / removed / offered. Payload = `JSON.stringify({ message:"success", messageTypes, data })` |

Writes call `emitQueueSnapshot()` (broadcast full queue to the day room) and
`notifyQueueOrgAdmins()` (push to role-11 sockets). `messageTypes` keys:
`queue_checkin_confirmed`, `queue_position_changed`, `queue_order_offered`,
`queue_order_rejected`, `queue_order_assigned`, `queue_removed`,
`queue_org_approved`, `queue_org_updated`.

### Example socket client (frontend)

```js
// driver app — after checkin, subscribe to live updates
import { io } from "socket.io-client";
const socket = io(API_URL, { auth: { user: "driver", phoneNumber, token: `Bearer ${token}` } });
socket.emit("queue:subscribe", { queueOrganizationUniqueId, queueDate: "2026-08-06" });
socket.on("queue", (msg) => {
  const { data, messageTypes } = JSON.parse(msg);
  console.log("queue changed", messageTypes, data);
});
```

## 6. Implementation checklist

Scaffold + engine landed on `feature/queue-dispatch` (role 11 seed, guard, message
types, socket events, schema, validations, services, controllers, routes):

1. [x] Seed role 11 (`Utils/ListOfSeedData.js` + `Roles`).
2. [x] `QueueOrganization` CRUD + admin approve/`queueEnabled` routes.
3. [x] `QueueOrganizationMembership` (role-gated by 11 / shipper 1).
4. [x] `DriverQueue` check-in / position / checkout / status / override / remove / dispatch (ticket-machine numbering).
5. [x] `handleQueueDispatch` branch in `Services/ShipperRequest/create.service.js` — auto-offer to the front driver when a queue-enabled org places an order. Offer window handled by `releaseExpiredOffers` in `automaticTimeout.service.js`; on reject/timeout advance the order to the next driver (`rejectOffer` / `offerToNextDriver`).
6. [x] QueueOrgAdmin manage/override endpoints (audit-logged via `QueueAuditLog`).
7. [x] Schema applied to `transportCompanyTest`; the `ShipperRequest.queueOrganizationUniqueId` column/index/FK are applied idempotently via `ensureQueueOrgReferences()` in `createTable` — `npm run db:create` is safe to re-run.
8. [ ] End-to-end accept flow still to be exercised against a live DB (engine verified via `node --check` + eslint; check-in → dispatch verified; accept → `markEntryLoaded` → journey path pending a DB run).

## 7. Related docs

- `docs/queadmin-operations.md` and `docs/queadmin-frontend.md` — moved to the frontend repo: `queadmin-frontend/docs/`.
- `docs/queue-dispatch-design.md` — full design, endpoints, dispatch rules, open questions.
- `docs/setup.md` — `npm run db:create` / `db:seed`.
- `Middleware/Database.config.js` — pool + `getConnection` + `ping`.
- `Utils/DatabaseTransaction.js` / `Utils/TransactionContext.js` — transaction helpers.
- `Utils/QueueSocket.js` — real-time queue push helpers.
