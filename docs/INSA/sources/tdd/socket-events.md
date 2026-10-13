# WebSocket Events (TDD / LLD)

Real-time layer: **Socket.IO v4** on the same HTTP server as the REST API
(default path `/socket.io`), configured in `Config/SocketAdapter.config.js`.

## 1. Connection

- Transports: `websocket` and `polling` (Engine.IO v3 clients allowed —
  `allowEIO3: true`).
- CORS: same origin allow-list as the REST API (`Config/AllowedOrigins.js`),
  `credentials: true`.
- **Authentication:** the client sends its JWT in the handshake
  (`socket.handshake.auth.token`); the mobile client
  (`Utils/socketService.js`) reads the token from `AsyncStorage` before
  connecting. Handshake failures / init errors are reported as
  `connect_error` and the server disconnects the socket.
- Scaling: when `UPSTASH_REDIS_URL` is configured, pub/sub clients (TLS,
  reconnect/backoff, offline queue) provide the `@socket.io/redis-adapter`
  so events reach sockets on any node; otherwise single-server mode (logged
  at boot).

Lifecycle events (client and server):

| Event | Direction | Meaning |
|---|---|---|
| `connection` | server | new socket accepted (server-side handler entry) |
| `disconnect` | both | socket closed |
| `connect_error` | server | handshake/connection failure (logged with code) |
| `error` | both | socket-level error |
| `response` | server→client | generic ack (e.g. reply to `message`) |

## 2. Client → server events

### `queue:subscribe`
Subscribe to real-time dispatch-queue updates.

```json
{ "queueOrganizationUniqueId": "<uuid>", "queueDate": "2026-10-08" }
```

- Joins room `queueOrg:<queueOrganizationUniqueId>` (all dates) and, when
  `queueDate` is given, `queueOrg:<queueOrganizationUniqueId>:<queueDate>`
  (drivers after check-in; org admins/dispatchers while managing the day).
- Ack: `queue:subscribed` with
  `{ status: "success", message: "success", data: { queueOrganizationUniqueId, queueDate } }`.
- Missing id → error frame via `sendError(..., "BAD_REQUEST", "queue")`.

### `queue:unsubscribe`
Leaves the same rooms; ack: `queue:unsubscribed`
(`{ status: "success", message: "success" }`).

### `locationUpdateToDriver`
Driver's device publishes its GPS position (server relays to the linked
shipper and persists the last location — `Utils/LastLocationStore`).

### `locationUpdateToShipper`
Shipper-side position updates; also used by the server to **replay** the last
known driver location to a newly connected shipper socket
(`WSPusher` emits with `replayed: true`).

### `message`
Generic client ping; server answers `response` with `"Message received"`
(keep-alive / connectivity check).

## 3. Server → client events

| Event | Payload (shape) | Audience |
|---|---|---|
| `queue:subscribed` / `queue:unsubscribed` | ack described above | requesting socket |
| `queue` | queue board updates (order offers, check-ins, dispatch changes) | sockets in `queueOrg:*` rooms |
| `messages` | notification envelope — **default notification channel** | shipper / driver / admin sockets (see §4) |
| `locationUpdateToDriver` | `{ lat, lng, …, replayed? }` | driver socket |
| `locationUpdateToShipper` | `{ lat, lng, … }` | shipper socket |
| `response` | ack strings | requesting socket |
| `error` frames via `sendError` | `{ message, code, context }` | requesting socket |

## 4. Notification channel (`messages`)

`Utils/Notifications.js` pushes business notifications on the `messages`
event (override with an explicit `eventName`):

- `sendSocketIONotificationToShipper` / `…ToDriver` / `…ToAdmin` look up the
  target socket in the connection store (`Utils/WsConnectionStore`) and emit;
  if no live socket exists the notification falls back to polling/FCM as
  configured.
- The payload carries one of the **78 message types** defined in
  `Utils/MessageTypes.js` — a shared catalog of `{ message, details }` strings
  used for in-app toasts, e.g.:
  `driver_accepted_shipper_request`, `driver_going_to_loading_place`,
  `driver_started_loading`, `driver_completed_loading`,
  `driver_started_journey`, `driver_completed_journey`,
  `shipper_cancelled_request`, `driver_rejected_request`,
  `driver_not_selected_in_bid`, `driver_not_answered`,
  `company_batch_available`, `company_bid_accepted`,
  `company_driver_confirmed`, `company_driver_journey_started`,
  `refund_approved_by_admin`, `create_deposit_By_driver`,
  `force_logout_phone_change`, `connection_established`.
- Clients match on the message key so copy changes server-side do not break
  UI handling (reverse index built from the catalog).

## 5. Rooms summary

| Room | Joined by | Used for |
|---|---|---|
| `queueOrg:<orgUniqueId>` | `queue:subscribe` | all queue events for the organization |
| `queueOrg:<orgUniqueId>:<date>` | `queue:subscribe` + `queueDate` | day-scoped dispatch events |

Direct (per-socket) emits cover location and notification traffic; delivery
state is tracked per user in `WsConnectionStore`, last positions in
`LastLocationStore`.

## 6. Error handling

- Server-side handler exceptions are caught per event and returned via
  `sendError(socket, error, <CODE>, <context>)`
  (`Utils/WsServerResponder.js`), never crashing the socket loop.
- Initialization failures (`WS_INIT_FAILED`) log the error and disconnect the
  client.
- Redis adapter errors (publish/subscribe) are logged with retry info; the
  server continues in degraded single-node mode rather than failing boot.
