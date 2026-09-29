# plan.md — verified gaps and the work that follows

> **Scope:** all six front ends plus `transportBackEndNative`, checked against the schema, routes and services.
> **Method:** static read cross-checked against the code. Every finding below carries a `file:line` so it can be re-verified or fixed directly.
> **Status:** findings only. Nothing in this file has been fixed except where explicitly marked.
> **Relation to the pitch:** `Pitch/src/components/PitchDeck.jsx` claims a mechanism works. The gaps in Tier 0 and Tier 1 determine which claims are true. They are listed here so the deck and the product do not drift apart.

---

## Tier 0 — fix before anyone outside the company sees the product

These are live in production today and are visible to a paying customer.

### 0.1 Live tracking in the company console is fabricated

`transportCompany/src/components/tracking/TrackingMap.tsx:339-350`

```ts
const interval = setInterval(() => {
  setProgresses((prev) => prev.map((p, i) => {
    if (!isMoving(...)) return getStaticProgress(...);
    const { min, max } = getProgressRange(...);
    let next = p + 0.01;
    if (next >= max) next = min; // Loop back instead of stopping
    return Math.min(next, max);
  }));
}, 100);
```

A progress float is advanced by `0.01` every 100 ms and **loops back to the start when it reaches the end**. Truck markers move along real OSRM road geometry, but their position is invented. A company watching this sees a truck crawl, stop, and restart from the origin forever.

**Root cause:** there is no company-targeted GPS event to consume. `JourneyRoutePoints` is written by the driver journey services; nothing publishes a per-assigned-driver position that a company can subscribe to.

**Options**
- **(a) Ship real positions.** Add a company-facing position feed keyed on `vehicleDriverUniqueId`, sourced from the existing `JourneyRoutePoints` writes. Correct, but a real build.
- **(b) Label it honestly.** Replace the animation with the journey status actually on record — "Loading", "In transit", "At destination" — and remove the moving marker until (a) exists. No deception, no build.

> **Recommendation: (b) now, (a) next.** Option (b) removes a false claim from a customer-facing screen for the cost of a component change. (a) is the real fix but should not be attempted under pitch pressure.
>
> Note: the ministry deck deliberately excludes company tracking. This is not a pitch risk — it is a customer-trust risk that exists today.

### 0.2 Losing companies are never told they lost

The backend emits the notification. The company frontend never renders it.

- Backend: `Services/CompanyBid/bidUpdate.service.js:501` (`"Bid rejected"`), `:534` (`company_bid_rejected` as a `messageTypes` entry)
- Frontend: `rg "company_bid_rejected|bid_rejected" transportCompany/src/` → **no matches**

A company places a bid, the shipper awards someone else, and the losing company waits for a job that is never coming. It cannot re-bid, because it does not know the board closed.

**Fix:** handle the `company_bid_rejected` socket/push message in `transportCompany`, surface it, and move the bid to a terminal view.

---

## Tier 1 — on the critical path for the pilot

The deck promises these. If they are not built, the promise is wrong.

### 1.1 No wait-time aggregation exists

The timestamps are in the schema and nothing computes across them.

`Database/Database.js:2276-2279` — `DriverQueue.joinedAt` (server-stamped, the dispute truth), `requestedAt`, `agreedAt`.

Searched for `waitingTime` / `waitTime` / `avgWait` / `TIMESTAMPDIFF` across `Services/`, `Controllers/`, `Routes/` → **no matches**. There is no analytics service directory either; `Services/Admin/` holds only `activeDrivers`, `offlineDrivers`, `onlineDrivers`, `unauthorizedDrivers`.

**This blocks the entire measurement story.** The deck promises truck-hours waiting, queue depth over time, time to first offer, and no-answer rate. The raw data is there; the aggregation does not exist.

**Build:** a queue-analytics service keyed on `(queueOrganizationUniqueId, queueDate)`, with wait time derived as `requestedAt - joinedAt` and `agreedAt - joinedAt`. Expose per-site and cross-site. This is the single highest-value backend gap in the project.

### 1.2 The driver job search is not wired, so the return leg is invisible

The platform can already do this. The driver app does not ask for it.

**Server — exists.** `Services/ShipperRequest/readActive.service.js:116` `getAllActiveRequests` already accepts:
- `originPlace`, `destinationPlace` — text filters
- `driverLatitude`, `driverLongitude` — produces a haversine `distanceKm` sort from the driver's actual position to the job origin

**Client — does not use it.** `DriverLoadNow/src/constants/api.js:45-46`:

```ts
GET_ALL_ACTIVE_SHIPPING_REQUESTS:
  '/api/shippingRequest/getAllActiveRequests?requestMode=individual_target',
```

No origin, no destination, no coordinates. `useOnlineJobs.js:189-191` fetches on mount with a page number only. The `OnlineJobs` screen has **no search input at all**.

So a driver in Addis who arrived from Dire Dawa sees an unfiltered, unsorted list and cannot look for the load that takes him home.

**Build:** pass driver coordinates into the existing call, and add destination/origin filters to the `OnlineJobs` screen. The matching logic is already written and tested in production; this is UI plus a query string. Small, high value — it is the concrete form of the "empty return leg" answer on slide 4 of the deck.

### 1.3 The nine-vehicle rule is bypassable for loading-place orders

`Validations/ShipperRequest.schema.js:60-76`

```js
if (count > DOMAIN.MAX_INDIVIDUAL_TARGET_VEHICLES &&
    mode === "individual_target" &&
    !value.queueOrganizationUniqueId) {          // ← the exemption
  return helpers.message("...require company target mode...");
}
```

`DOMAIN.MAX_INDIVIDUAL_TARGET_VEHICLES = 9` (`Utils/Constants.js:37`).

Any request carrying a `queueOrganizationUniqueId` skips the cap entirely. The comment explains the intent — queue orders are FIFO-offered to individual front drivers, so N rows do not imply N simultaneous bidders — but the effect is that a loading place can post a 40-vehicle order to individual drivers.

**Why this matters now:** the deck's slide 5 states the rule as absolute, and the minister may read the schema. The stated product rule is that a loading place also switches to companies at ten or more vehicles. Either the deck needs qualifying, or the exemption should be closed.

**Decision needed:** close the exemption, or scope it explicitly (for example, cap it rather than removing it, and document why).

---

## Tier 2 — already documented in full, not repeated here

These have complete write-ups. Fix from the source documents, not this file.

- **Loading-place console** — 13 findings: `queadmin-frontend/docs/queue-admin-gap-analysis.md`
  Includes: role 12 (QueueDispatcher) is blocked by the frontend guard while role 11 is allowed, against a stale doc; bidding endpoints are never wired to UI; a `PATCH` route with no handler.
- **Company console** — 18 findings: `transportCompany/docs/transport-company-gap-analysis.md`
  Includes the dead `PATCH`, the missing bid-loss handling from 0.2, and the tracking issue from 0.1 in full.

---

## Tier 3 — hygiene, not blocking

### 3.1 `transportAdmin`
- Five delinquency views are built but not routed: `Pages/Users/ViewUserDelinquencies.jsx`, `ViewUserDelinquencyResponses.jsx`, `ViewUserAdminDecisions.jsx`, `ViewUserPendingDelinquencies.jsx`, `Pages/Companies/ViewCompanyDelinquencies.jsx`. Only the company equivalents are reachable.
- `ProtectedRoute.jsx:25` redirects to `/unauthorized`, which is not in `RouteConfig.js` → a 404. The `permission` prop is never set on any route, so the path is currently dead, but the redirect is a latent bug.
- No client-side capability difference between role 3 and role 6. The only difference is a checkbox at login (`Pages/Auth/Login.jsx:25`). Any escalation control is backend-side only, which is correct but means the UI cannot express it.
- `.env` on disk contains `ADMIN_OTP` and `ADMIN_PHONE`. Gitignored, but should not sit in a repo directory.
- Playwright E2E (`E2ETests/tests/`, 5 suites) asserts headings render and dropdowns toggle. No write-path coverage, so the destructive admin paths are untested.
- No analytics or export surface — the dashboard derives counts from `pagination.totalItems` on `limit=1` calls. Works, but there is no reporting page and no CSV export.

### 3.2 Pitch
- `pitch.html` and `docs/pitch.html` are stale standalone copies of the old investor deck. Not built, not served, not referenced by `vite.config.js`. They still contain `0% Load Theft`, `95% On-time Delivery`, a pull-quote formatted as a customer interview, and three different TAM figures. Marked in `Pitch/docs/README.md`; delete or archive them so they cannot be sent by accident.
- ESLint config omits the React plugin, so every JSX-used import reports as unused. Pre-existing: 33 errors before the deck rewrite, 19 after. Cosmetic, but it means lint output is currently noise.

### 3.3 Test depth
- `DriverLoadNow` — 24 Maestro flows. `shipperLoadNow` — 9. The shipper app is the thin one, and it is the app the 40-container question is really about.
- No integration or E2E coverage of the queue dispatch path (`DriverQueue/*`) found in any repo.

---

## Also missing, and named in the deck

### No container entity

Cargo is modelled as `shippableItemQtyInQuintal` (weight) and `numberOfVehicles` (count). A search for `containerNumber`, `container_number`, `emptyContainer` across the backend returns nothing.

Consequence: the deck's "40 containers" is expressible only as a vehicle count or a tonnage. Tracking *where a specific container physically is* is not possible with the current schema. If container-level visibility is ever asked for — and at a port it is a reasonable question — that is a schema addition, not a screen.

### No backhaul / return-leg matching

No `backhaul`, `deadhead`, `returnLeg`, `returnTrip` anywhere in the backend.

This is a deliberate consequence of 1.2, not a separate absence: the return leg is served by the ordinary job board being filtered by destination. The dedicated feature does not exist and should not be claimed. See `Pitch` slide 4, which marks it Built (server) / To be wired (app) for exactly this reason.

---

## Recommended order

| # | Item | Why it is here |
|---|---|---|
| 1 | 1.3 Decide the queue cap exemption | Smallest change, and the deck currently overstates the rule. Decide before the meeting, not after. |
| 2 | 1.2 Wire the driver job search | Server is already built. Closes the return-leg story end to end and is the highest value per hour of driver-side work. |
| 3 | 0.1 Replace the fabricated tracking animation | Removes a false claim from a customer-facing screen. Do option (b), not (a). |
| 4 | 0.2 Deliver bid-loss notifications | Real customers are currently left waiting on a job that is gone. |
| 5 | 1.1 Build queue analytics | The measurement story depends on it. Start it early — it is the longest lead item on the list. |

Items 1 and 2 are cheap and change what the deck can honestly claim. Items 3 and 4 are customer-trust fixes that exist regardless of the pitch. Item 1 is the long pole and should start before the meeting, because the pilot cannot produce numbers without it.
