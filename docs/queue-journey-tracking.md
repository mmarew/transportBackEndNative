# Queue Journey Tracking — "Where is my load?" for the Queue Org Admin

> Status: **DESIGN / recommendation — not yet implemented.** Related:
> [queue-dispatch-design.md](queue-dispatch-design.md),
> [queue-order-cancellation.md](queue-order-cancellation.md),
> [queue-refusal-policy.md](queue-refusal-policy.md).

## 1. Should the queue admin follow journey progress?

**Yes — but exception-driven, at milestone level. Not live GPS.**

The queue-org admin (site manager at Mojo Kaliy / National Cement) is not a
freight-logistics operator. Their real question is binary: *"did my load leave,
and will it arrive today?"* They do not need a breadcrumb replay of a truck
moving across the country. Following progress is worth it because it answers the
one thing that matters (ETA / delay / stuck load) without flooding them with data.

## 2. Current state (facts)

| What exists | What the queue admin sees |
| ----------- | ------------------------- |
| Offer → accept → load: `notifyQueueOrgAdmins` socket events (`queue_order_offered`, `queue_order_rejected`, `queue_order_assigned`) | Queue-position + dispatch events |
| `Journey` row at `startJourney` (status `journeyStarted` 5, `journeyCompleted` 6) | **Nothing** — no notification reaches the org admin |
| `JourneyRoutePoints` — GPS breadcrumbs (lat/lng/timestamp) recorded by the driver app | **Nothing** — no route-point access for org admins |
| `QueueAuditLog` | Position overrides only |

So today the admin's visibility ends at "driver assigned." From the moment the
truck leaves until it completes, the site manager is blind.

## 3. Recommended design — milestone board + exception alerts

### 3.1 Milestone board per order slot

Show each queue order as a status timeline, reusing the **existing**
`JourneyStatus` transitions — no new tracking infrastructure:

```
requested → assigned (driver accepted) → agreed (left the line)
         → journeyStarted (5)  → journeyCompleted (6)
         → cancelled (7/10/12) → rejectedByDriver (15) / noAnswerFromDriver (13)
```

The board is a read API (`queueOrganizationUniqueId` + date →
`ShipperRequest` → `JourneyDecision` → `Journey`) — a simple query over tables
that already exist.

### 3.2 Exception alerts (the core value)

Notify the org admin **only when something needs action**:

| Event | Trigger | Alert |
| ----- | ------- | ----- |
| Truck left the site | `journeyStarted` | `queue_order_journey_started` |
| Load delivered | `journeyCompleted` | `queue_order_journey_completed` |
| **Stuck / no movement** | No `JourneyRoutePoint` in N minutes (e.g. 30) while journey is active | `queue_order_delay` with last known position |
| ETA slip | ETA recomputed vs planned, slips > X% | `queue_order_delay` |
| Order cancelled mid-journey | `cancelledBy*` on an active journey | existing cancel notifications |

Rule of thumb: **no data, no alert.** A healthy on-time journey is invisible to
the admin until it completes. Alerts are the product; the board is the context.

**Success metrics:** (1) org-admin load-status questions answered without a phone
call (tracked by support-ticket/phone-call volume per queue org); (2) delay
detected within `QUEUE_DELAY_ALERT_MINUTES` of the truck stopping; (3) false
alerts < 5% (an alert that requires no action is noise).

### 3.3 ETA (phase 1 optional)

At `journeyStarted`, compute distance (pickup → destination from the order's
`latitude/longitude`) ÷ historical average speed for the route/vehicle type →
ETA. Recompute from the latest route point; alert only when the ETA slips.

## 4. Data path (no schema change needed for milestones)

```
shipperRequestUniqueId ──accept──► journeyDecisionUniqueId ──► Journey (startTime/endTime/status, journeyStartingLat/Lng)
                                                              └──► JourneyRoutePoints (live breadcrumbs for delay detection)
```

The accept decision already links the queue order to the journey — the tracking
read is a join over existing tables.

## 5. What NOT to build (scope guard)

| Idea | Verdict |
| ---- | ------- |
| Live map / breadcrumb replay for the admin dashboard | **No** — site managers don't need it; heavy |
| Per-truck GPS dashboard | **No** — out of scope; the drivers' app already has it |
| Geofencing (pickup/drop-off radius triggers) | Phase 2, only if delay alerts prove noisy |
| Admin-driven cancellation of an active journey | Already possible via existing cancel paths (see cancellation doc) |

## 6. Options

| Option | Effort | Impact | Recommendation |
| ------ | ------ | ------ | -------------- |
| A. Milestone board read API only | Low | Medium | Ship first — cheap, gives the admin the timeline |
| B. Board + exception alerts (started/completed/delay) | Medium | High | **Recommended** — this is the actual value |
| C. B + ETA | Medium-High | High | After B, if the site wants arrival estimates |
| D. Live GPS map for admins | High | Low | Skip |

## 7. Open questions

- Delay threshold: 30 min without a route point — tunable? (suggest
  `QUEUE_DELAY_ALERT_MINUTES`, default 30).
- Should the *driver* be reminded by the system when stopped too long, or is the
  org-admin alert enough? (Suggest: alert admin only, driver app already shows
  the load.)
- ETA source of truth: order's declared destination vs the driver's destination —
  confirm the order carries it (`ShipperRequest` destination fields).
