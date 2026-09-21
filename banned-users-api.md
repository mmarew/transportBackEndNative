# Ban User API

`POST {{url}}/api/admin/bannedUsers`

Manually bans a user for a given role. The API creates a `BannedUsers` record and flips the user's `UserRoleStatus` for that role to status `6` (banned) in a single transaction.

> [!IMPORTANT]
> **Authentication:** The request MUST include `Authorization: Bearer <token>`.
> **Content-Type:** `application/json`

---

## Request

- **Method**: `POST`
- **Endpoint**: `{{url}}/api/admin/bannedUsers`

### Body

```json
{
  "userRoleUniqueId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "reason": "Repeated policy violations",
  "banDuration": 7
}
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `userRoleUniqueId` | UUID | ✅ | The `UserRole` row to ban. The service resolves `userUniqueId` + `roleId` from it. |
| `reason` | string | ✅ | Human-readable reason recorded on the ban. |
| `banDuration` | number | ✅ | Ban length in **days** (`banExpiresAt = now + banDuration` days). |

**Notes**

- `banDuration` is a number of *days* — the service multiplies it by `TIME.DAY_MS`. A value of `0` bans until `banExpiresAt = now` (still marked active; effectively immediate expiry).
- Legacy payload fields are also accepted (`userUniqueId`, `roleId`, `banReason`, `banDurationDays`). When `userRoleUniqueId` is present it takes precedence for resolving the target user + role.
- Bans are **per role**: the same user can hold an independent ban record for each role they have.
- `bannedBy` is set automatically from the authenticated token (`req.user.userUniqueId`) — do not send it.
- The create + role-status change run in one transaction; if either fails, the whole operation rolls back.

---

## Success Response — `200 OK`

```json
{
  "message": "User banned successfully",
  "data": null,
  "banUniqueId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "banExpiresAt": "2026-09-27T14:30:00.000Z"
}
```

- `data` is `null`; the created ban's IDs are returned at the top level.
- `banExpiresAt` is the absolute expiry datetime (`now + banDuration` days). The API returns HTTP `200`, not `201`.

### Already banned — `200 OK`

If the same user already has an **active** ban for that role (not expired), no duplicate is created; the existing ban is returned:

```json
{
  "message": "User is already banned — existing active ban returned",
  "data": null,
  "banUniqueId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

---

## Error Responses

Error body (production): `{ "status": "error", "error": "<message>" }`. In development (`NODE_ENV=development`) the body also includes the full error object and stack.

| Status | Condition |
|---|---|
| `400` | `userRoleUniqueId` or `reason` missing (schema `VALIDATION_ERROR`) — e.g. `"reason" is required` |
| `400` | `banDuration` missing — `"banDurationDays or banDuration is required"` |
| `400` | Role not found — `"Invalid userRoleUniqueId - user role not found"` |
| `400` | User not found — `"Invalid userUniqueId"` |
| `400` | Cannot derive role — `"roleId is required or must be derived from userRoleUniqueId"` |
| `401` | Missing / invalid / expired token — `"Authorization header missing"`, `"Invalid token"`, etc. |

---

## Postman Example

```
POST {{url}}/api/admin/bannedUsers
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "userRoleUniqueId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "reason": "Manual ban — repeated policy violations",
  "banDuration": 7
}
```

**Source:** `Routes/EndPoints/bannedUsers.endpoints.js`, `Routes/BannedUsers.routes.js`, `Controllers/BannedUsers.controller.js`, `Services/BannedUsers.service.js`.