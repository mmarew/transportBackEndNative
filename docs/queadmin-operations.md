# QueueOrgAdmin — Operations Guide

Role-based guide for the **Queue Org Admin** (role **11**, `queueOrgAdmin`).
The QueueOrgAdmin runs the daily dispatch queue for their queue organization
(Mojo Kaliy, National Cement, …): they register drivers into the line, cancel
them, reorder positions, and assign jobs to the front driver.

> Companion docs: [queue-dispatch-design.md](queue-dispatch-design.md)
> (design/semantics) and [queue-tables-access.md](queue-tables-access.md)
> (schema + all REST/socket endpoints). This doc is the *operator* view: what a
> QueueOrgAdmin can do and the exact calls, day in / day out.

## 1. What the QueueOrgAdmin manages

A queue org must be **approved and enabled** before the queue works. That setup
is done by a **Super Admin / Admin** (`/api/queueOrganization/:id/approve`,
`queueEnabled: true`). After that, the QueueOrgAdmin only manages the line:

| Capability | How | Endpoint |
|---|---|---|
| View the live queue | `status` | `GET /api/queue/status` |
| Register a driver into the line | `manualCheckin` | `POST /api/queue/manualCheckin` |
| Assign a job to the front driver | `dispatch` | `POST /api/queue/dispatch` |
| Cancel a driver from the line | `removeEntry` / driver `checkout` | `DELETE /api/queue/entry/:queueUniqueId` |
| Reorder positions | `overrideEntry` (audit logged) | `PATCH /api/queue/entry/:queueUniqueId/override` |
| Manage team (add/remove admins, shippers) | `addMember` | `POST /api/queueOrganization/:id/members/:userUniqueId` |
| Update org profile | `updateQueueOrganization` | `PATCH /api/queueOrganization/:id` |

## 2. Before you start (prerequisites)

1. You are a member (role **11**) of the queue org —
   `GET /api/queueOrganization/:queueOrganizationUniqueId/members`.
2. The org is `approved` and `queueEnabled = true` —
   `GET /api/queueOrganization?queueOrganizationUniqueId=<id>`.
3. Every driver you register already has a **driver account** and an **active
   vehicle-driver assignment**. Driver/vehicle registration lives in the
   existing driver-registration feature
   ([driver-registration.md](driver-registration.md)) — the queue does **not**
   create drivers, it only puts an existing `vehicleDriverUniqueId` into the
   line.

## 3. Daily queue flow

### 3.1 View today's queue

```bash
curl -G http://localhost:3000/api/queue/status \
  -H "Authorization: Bearer <queueOrgAdminToken>" \
  -d queueOrganizationUniqueId=<orgUniqueId>
```

Response groups waiting drivers by vehicle type, ordered by `queueNumber`
(1, 2, 3 …). `joinedAt` is the server-stamped check-in time — the dispute truth.

```json
{
  "message": "Query results fetched",
  "data": {
    "queueOrganizationUniqueId": "…",
    "queueDate": "2026-08-06",
    "totalWaiting": 4,
    "queues": {
      "55060ed0-…": [
        { "queueNumber": 1, "status": "waiting", "driverName": "…", "driverPhoneNumber": "…" }
      ]
    }
  }
}
```

### 3.2 Register a driver into the line

Drivers can check themselves in (`POST /api/queue/driver/checkin`), but the
QueueOrgAdmin can also put a driver in manually — e.g. a truck that arrived
physically, or the driver app is offline.

```bash
curl -X POST http://localhost:3000/api/queue/manualCheckin \
  -H "Authorization: Bearer <queueOrgAdminToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "queueOrganizationUniqueId": "<orgUniqueId>",
    "vehicleDriverUniqueId": "<vehicleDriverUniqueId>"
  }'
```

`queueNumber` is auto-assigned (next in sequence per org + day + vehicle type).
Pass `queueNumber` explicitly only when overriding a printed ticket:

```json
{ "queueOrganizationUniqueId": "…", "vehicleDriverUniqueId": "…", "queueNumber": 7 }
```

One entry per vehicle per org per day — a duplicate check-in is rejected with
`409`.

### 3.3 Assign a job to the front driver

`dispatch` offers a waiting order to the **front** waiting driver of the order's
vehicle type (lowest `queueNumber`). It marks that entry `offered`, records
`offeredAt`, links the order, and pushes a real-time offer to that driver only.

```bash
curl -X POST http://localhost:3000/api/queue/dispatch \
  -H "Authorization: Bearer <queueOrgAdminToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "queueOrganizationUniqueId": "<orgUniqueId>",
    "vehicleTypeUniqueId": "<vehicleTypeUniqueId>",
    "shipperRequestUniqueId": "<orderUniqueId>"
  }'
```

If no one is waiting in that vehicle type, the call fails with `404 No waiting
driver in this vehicle type's queue`. Auto-offer when a queue-enabled org places
an order (`handleQueueDispatch`) is pending — for now the QueueOrgAdmin triggers
dispatch manually.

### 3.4 Cancel a driver from the line

Two ways, both end the entry with `status = 'removed'`:

- **Driver self-cancel** — `DELETE /api/queue/driver/checkout` (driver's own token).
- **QueueOrgAdmin cancel** — removes any entry, logged in `QueueAuditLog`:

```bash
curl -X DELETE http://localhost:3000/api/queue/entry/<queueUniqueId> \
  -H "Authorization: Bearer <queueOrgAdminToken>"
```

The admin cancel is **audit-logged** (`action: 'remove'`). Drivers are expected
to self-checkout; the admin cancel is for no-shows, duplicate entries, or
removing an entry the admin put in manually.

### 3.5 Reorder positions (supervisor override)

Swap/fix positions, e.g. a driver that physically arrived first but checked in
late. Every override writes a `beforeValue → afterValue` pair plus an optional
`reason` to `QueueAuditLog` (`action: 'override'`).

```bash
curl -X PATCH http://localhost:3000/api/queue/entry/<queueUniqueId>/override \
  -H "Authorization: Bearer <queueOrgAdminToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "queueNumber": 2,
    "reason": "Driver physically present since 6am, app login failed"
  }'
```

### 3.6 Manage the team

Add another QueueOrgAdmin (`roleId: 11`) or a shipper (`roleId: 1`) to the org:

```bash
curl -X POST http://localhost:3000/api/queueOrganization/<orgUniqueId>/members/<userUniqueId> \
  -H "Authorization: Bearer <queueOrgAdminToken>" \
  -H "Content-Type: application/json" \
  -d '{ "roleId": 11 }'
```

`GET /api/queueOrganization/<orgUniqueId>/members` lists current members.

## 4. Real-time updates (socket.io)

The QueueOrgAdmin's dashboard does **not** poll. Subscribe once, receive every
change live on the `queue` event:

```js
import { io } from "socket.io-client";
const socket = io(API_URL, {
  auth: { user: "queueOrgAdmin", phoneNumber, token: `Bearer ${token}` },
});
socket.emit("queue:subscribe", { queueOrganizationUniqueId: "<orgUniqueId>" });
socket.on("queue", (msg) => {
  const { data, messageTypes } = JSON.parse(msg);
  console.log("queue changed", messageTypes, data); // check-in / offered / removed / loaded
});
```

Events: `queue:subscribe` / `queue:unsubscribe` (client → server),
`queue` (server → client). Full table in
[queue-tables-access.md §5](queue-tables-access.md#5-rest--socket-api-implemented).

## 5. Audit trail

Every override, admin cancel, manual check-in, and dispatch is written to
`QueueAuditLog` with actor + timestamp + optional reason:

| `action` | When |
|---|---|
| `override` | position reorder (§3.5) |
| `remove` | admin cancel (§3.4) |
| `manual_checkin` | admin registered a driver (§3.2) |
| `dispatch` | job offered to front driver (§3.3) |

Query it per org/day:

```sql
SELECT action, beforeValue, afterValue, reason, performedBy, performedAt
FROM QueueAuditLog
WHERE queueOrganizationUniqueId = '<orgUniqueId>' AND queueDate = '2026-08-06'
ORDER BY performedAt;
```

## 6. Security notes

- `manualCheckin`, `override`, `remove`, `dispatch`, `addMember` all require the
  `verifyIfUserIsQueueOrgAdmin` guard (role 11, or Admin/SuperAdmin).
- `approve` / `delete` of the org itself are **Super Admin / Admin only** — a
  QueueOrgAdmin cannot approve or delete their own org.
- Every mutating action is tied to `req.user` (the actor) and stamped in the
  audit log — position disputes trace back to who changed what.

## 7. Common errors

| Error | Meaning / fix |
|---|---|
| `403 Queue organization is not enabled for dispatch` | Org not `approved` / `queueEnabled=false` — ask an Admin to enable it |
| `409 Driver is already in the queue for this day` | One entry per vehicle/day; the driver is already in line |
| `404 Active vehicle-driver assignment not found` | `vehicleDriverUniqueId` has no active assignment — register driver/vehicle first (§2.3) |
| `404 No waiting driver in this vehicle type's queue` | Nothing waiting for that type — cannot dispatch |
| `404 Queue entry not found` | Bad `queueUniqueId` |
