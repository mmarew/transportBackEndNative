# App Job Flow — Shipper Request → Journey → Delivery (± P.O.L / P.O.D / Dispute)

> Scope: the **job/order flow** only (routing, queue vs distance vs company, journey
> statuses, acceptance & cancellation, P.O.L, P.O.D, and the complaint → dispute →
> response → decision lifecycle).
> Grounded in `Services/ShipperRequest/create.service.js`, `Services/CompanyBid/*`,
> `Services/CompanyAssignment/*`, `Services/DriverQueue.service.js`,
> `Services/Journey/*`, `Services/DeliveryConfirmation.service.js`,
> `Services/UserDelinquency|CompanyDelinquency/*`, `docs/DelinquencyLifecycle.js`.

---

## 1. Job flow overview

```mermaid
flowchart TB
    classDef create fill:#e3f2fd,stroke:#1e88e5,color:#0d47a1
    classDef route fill:#fff8e1,stroke:#fbc02d,color:#7f6000
    classDef company fill:#ede7f6,stroke:#5e35b1,color:#311b92
    classDef indiv  fill:#e0f7fa,stroke:#00acc1,color:#006064
    classDef journey fill:#e8f5e9,stroke:#43a047,color:#1b5e20
    classDef term    fill:#ffebee,stroke:#e53935,color:#b71c1c

    subgraph P0 [1 · CREATE]
        E["Shipper or admin creates one batch<br/>(numberOfVehicles · vehicleType · requestMode)"]:::create
    end

    subgraph P1 [2 · ROUTING DECISION]
        R1{"vehicles > 10 ?"}:::route
        R2{"Company or<br/>individual delivery ?"}:::route
        E --> R1
        R1 -- "yes → company job<br/><small>(business rule → client picks company_target)</small>" --> P2A
        R1 -- "no → shipper chooses" --> R2
        R2 -- company --> P2A
        R2 -- individual --> P2B
    end

    subgraph P2A [3a · COMPANY JOB]
        C1["Batch requestMode = company_target<br/>NO request rows yet (deferred until bid)"]:::company
        C2["Transport companies bid on the batch"]:::company
        C3["Shipper accepts a bid — slots born at status 4<br/>acceptedByShipper (no driver yet)"]:::company
        C4["Company dispatcher assigns driver + vehicle<br/>driver notified · shipper AND company see all"]:::company
        C1 --> C2 --> C3 --> C4
    end

    subgraph P2B [3b · INDIVIDUAL JOB]
        I1["Batch requestMode = individual_target<br/>one ShipperRequest row per vehicle · status 1 waiting"]:::indiv
        I2{"Queue-enabled place ?<br/>(queueOrganizationUniqueId set)"}:::route
        I3{"Queue routing"}:::indiv
        I4{"Distance routing"}:::indiv
        I1 --> I2
        I2 -- "queue / busy place" --> I3
        I2 -- "street / no queue" --> I4
    end

    subgraph P2C [3c · TAKE FROM STREET]
        S1["Driver creates the request himself<br/>BORN at status 8 journeyStarted"]:::indiv
    end

    subgraph P3 [4 · ACCEPTANCE]
        A1["Driver accepts + quotes price<br/>status 3 acceptedByDriver"]:::journey
        A2["Shipper accepts this driver / bid<br/>status 4 acceptedByShipper"]:::journey
        A1 --> A2
    end

    subgraph P4 [5 · JOURNEY 5 → 9]
        J5["5 goToLoadingPlace"]:::journey
        J6["6 loading · P.O.L captured (→ §5)"]:::journey
        J7["7 loaded"]:::journey
        J8["8 journeyStarted"]:::journey
        J9["9 journeyCompleted · P.O.D captured (→ §6)"]:::journey
        J5 --> J6 --> J7 --> J8 --> J9
    end

    P5["Payout · complaint → dispute → decision (→ §7)"]:::term

    C4 --> A2
    I3 --> A1
    I4 --> A1
    A2 --> J5
    S1 -.->|"street jobs jump straight to 8"| J8
    J9 --> P5
```

> **Reading the lanes**: §1 numbering is in the subgraph headers. Every path converges on
> driver-shipper acceptance **except** company jobs (slots are born at 4 because the shipper
> already accepted the *bid*) and street jobs (born at 8, already in transit).

> **Note on the >10 rule:** the "10+ vehicles → company" split is a **business rule on
> the client side**. In the backend the routing is driven by `requestMode`
> (`company_target` vs `individual_target`) plus optional `targetCompanyUniqueId`
> / `queueOrganizationUniqueId`; there is no hard-coded `10` in the server.

---

## 2. Entry points & routing decisions

| Scenario | requestMode | Who creates rows | Initial status | Routing |
|---|---|---|---|---|
| Shipper self-creates | `individual_target` | 1 row per vehicle | 1 `waiting` | queue (if `queueOrganizationUniqueId`) else distance |
| Admin creates for shipper | `individual_target` or `company_target` | same as shipper | 1 `waiting` | same as above |
| Company job | `company_target` | rows deferred → created on bid accept (born at 4) | 4 `acceptedByShipper` | company bids → company assigns drivers |
| Take from street | — (driver creates) | 1 row (driver) | 8 `journeyStarted` | none (already in transit) |

- **Queue routing:** order offered to the front waiting driver of its `vehicleTypeUniqueId`;
  this shipper's **reserved** drivers are offered before general drivers; drivers reserved
  for a *different* shipper are never eligible (see `Services/DriverQueue.service.js`
  `offerToDriver`).
- **Distance routing:** nearest available drivers within radius get a `JourneyDecision`
  with `decisionBy: "shipper"`.

---

## 3. Journey status 1 → 9 (`journeyStatusMap`, `Utils/ListOfSeedData.js`)

| # | Status | When |
|---|--------|------|
| 1 | `waiting` | request created, no driver yet (shipper/admin entry) |
| 2 | `requested` | offer sent to a driver (queue front or distance match) |
| 3 | `acceptedByDriver` | driver accepted + quoted price |
| 4 | `acceptedByShipper` | shipper picked this driver / accepted the company bid |
| 5 | `goToLoadingPlace` | driver on the way to load |
| 6 | `loading` | loading in progress (**P.O.L captured here**) |
| 7 | `loaded` | goods loaded |
| 8 | `journeyStarted` | in transit (also **take-from-street** starts here) |
| 9 | `journeyCompleted` | delivered (**P.O.D against this**); auto-POD source if `isPodRequired=false` |

Active statuses (not yet terminal): 1–8. Any status after acceptance (3) knows the driver;
**acceptance happens twice** — driver accepts an offer (→3), then shipper accepts the
driver or bid (→4). Company-bid slots are born at 4 and get a driver only when the
company assigns one.

---

## 4. Acceptance & cancellation — who can do what

| Actor | Action | Result |
|---|---|---|
| Driver | accepts an offer / quotes price | `3 acceptedByDriver` |
| Shipper | accepts a driver or a company bid | `4 acceptedByShipper` |
| Company | assigns a driver to an accepted slot | slot moves 4 → 5 → … (driver notified) |
| Driver | rejects offer **before** accepting | `18 rejectedByDriver` (queue: refusal penalty + order advances) |
| Driver | cancels **after** accepting | `12 cancelledByDriver` (queue: entry closed, refusal point, order advances) |
| Shipper | rejects the driver's price/offer | `11 rejectedByShipper` (queue: order advances to next driver) |
| Shipper | cancels the whole job | `10 cancelledByShipper` (partial → `20 partiallyCancelled`) |
| Company | cancels a bid (esp. after shipper accepted) | bid `cancelled_by_company` → slots back to `1 waiting`; commission-evasion check auto-fires |
| Admin / SuperAdmin | cancels, force-completes | `13 cancelledByAdmin` / `14 completedByAdmin` |
| System | timeout / no answer / auto-cancel | `16 noAnswerFromDriver` (auto-advance), `15 cancelledBySystem` |
| QueueOrgAdmin | manual dispatch, remove/reorder entry, cancel an offered order | queue-entry ops; order re-offered / advances |

### 4.1 Acceptance & cancellation map

```mermaid
stateDiagram-v2
    [*] --> W: request created (status 1)
    W --> R: offer sent to driver (2)
    R --> DA: driver accepts + quotes price (3)
    R --> RD: driver refuses (18) · queue advances
    R --> NA: no answer / timeout (16) · auto-forward
    R --> SR: shipper rejects offer(s) (11)
    DA --> SA: shipper accepts driver / bid (4)
    DA --> DC: driver cancels after accepting (12)
    DA --> SR: shipper rejects this driver (11)
    SA --> GL: 5 goToLoadingPlace
    SA --> SC: shipper cancels whole job (10)
    GL --> LD: 6 loading · P.O.L captured
    LD --> LDD: 7 loaded
    LDD --> JS: 8 journeyStarted
    JS --> JC: 9 journeyCompleted · P.O.D
    JS --> AC: admin cancels (13)
    JS --> ACF: admin force-completes (14)
    [*] --> JS: take-from-street born here (8)

    RD --> [*]
    NA --> [*]
    SR --> [*]
    DC --> [*]
    SC --> [*]
    AC --> [*]
    ACF --> [*]
    JC --> [*]
```

> Statuses that end at `[*]` are terminal. Every cancel passes
> `assertIndividualCancellationReason` and records **who + why**. **Company** and
> **QueueOrgAdmin** act on objects the status map doesn't see directly — company wins a
> bid (slots), queue admin dispatches/removes queue entries — but each trigger ends here:
> company cancelling a won bid (esp. after shipper accepted) → commission-evasion check;
> queue admin removals/reorders are audit-logged and orders re-offer/advance per §4.

---

## 5. P.O.L — Proof of Loading

```mermaid
flowchart LR
    L1["Driver reaches status 6 loading"] --> L2["Driver uploads proofOfLoading photos<br/>(up to 10, multipart upload)"]
    L2 --> L3["Photos merged into Journey.journeyProofOfLoading<br/>(JSON, append/merge, de-dup)"]
    L3 --> L4["Status 7 loaded in place; evidence kept for the whole job"]
```

- Upload field: `proofOfLoading` (file array), captured in the driver-request/journey
  update flow (`Services/DriverRequest/journeyManagement.service.js` →
  `mergeProofOfLoading`, `Driver.controller.js:262`).
- P.O.L is **evidence captured at loading**; it has no standalone dispute state machine.
  A loading dispute (quantity/condition at load) is pursued through the same complaint →
  dispute → admin-decision lifecycle as P.O.D (§7), and the P.O.L photos are evidence in
  that case.

---

## 6. P.O.D — Proof of Delivery (`Services/DeliveryConfirmation.service.js`)

### 6.1 State machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: driver submits / shipper self-confirms
    PENDING --> CONFIRMED: settle (shipper or admin)<br/>evidence + signature + GPS + OTP + SHA-256 hash
    PENDING --> DISPUTED: shipper complaint / admin delinquency
    DISPUTED --> CONFIRMED: ADMIN-ONLY re-settle<br/>roleId 3/6 · new hash, previous preserved
    CONFIRMED --> CONFIRMED: admin amendment (new hash)<br/>driver late evidence: photos/notes appended only
    CONFIRMED --> [*]
```

- **One record per journey** (`UNIQUE journeyUniqueId`); created via
  `POST /api/deliveryConfirmations` (photo required at create).
- **Sources** (`deliveryConfirmationSource`): `FORMAL_POD` (driver upload), `RECEIPT_AUTO`
  (receipt photos), `SHIPPER_DIRECT` (shipper self-declares), `AUTO_NO_POD`
  (auto-confirmed when `isPodRequired=false`), `DELINQUENCY_DISPUTE` (created DISPUTED from
  a complaint when the driver never submitted).
- **Settle (`PENDING → CONFIRMED`):** delivered quantity, condition
  (`GOOD|DAMAGED|PARTIAL`), receiver signature, GPS, notes; OTP verification
  (`request-sign-otp` → bcrypt check, attempt cap, expiry 410); a **tamper-evident
  SHA-256 hash** is written once.
- **Immutability:** signed fields (quantity, condition, signature, statement, GPS) are
  never overwritten. Driver **late evidence** on an already-CONFIRMED record appends
  photos/notes only. Any amendment creates a new hash while the previous hash is kept.
  Admins can verify integrity via `GET /:id/verify-hash`.
- **Dispute (`PENDING → DISPUTED`):** triggered automatically when a shipper complaint /
  delinquency targets the journey (below).

---

## 7. Complaint → Dispute → Response → Decision

The generic delinquency lifecycle (identical for drivers/users and companies;
`docs/DelinquencyLifecycle.js`, `UserDelinquency/create.service.js`).

```mermaid
flowchart TD
    C1["Who triggers:<br/>1. Shipper files a complaint on a delivery/journey<br/>2. Admin/System files an accusation (company or driver)"] --> C2
    C2["Delinquency created<br/>linked POD (if any) auto-DISPUTED<br/>or new DISPUTED DC if the driver never submitted<br/>responseDeadline set by severity:<br/>CRITICAL 1d · HIGH 3d · MEDIUM 5d · LOW 7d"] --> C3
    C3["Accused party notified (FCM)<br/>may submit ONE written 'dispute response'"]
    C3 --> C4{"Accused responds?"}
    C4 -- "yes, before deadline" --> C5["responseStatus=RESPONDED · on time"]
    C4 -- "yes, after deadline" --> C6["RESPONDED · flagged isLateResponse=true"]
    C4 -- "no (optional)" --> C7["still AWAITING_RESPONSE<br/>admin may decide without it"]
    C6 --> ADM
    C5 --> ADM
    C7 --> ADM
    ADM["Admin / SuperAdmin issues decision<br/>(new written appeal after a decision →<br/>post-decision response re-notifies admin to re-review)"]

    ADM --> OUT1["EXONERATED<br/>delinquency soft-deleted (audit kept)"]
    ADM --> OUT2["UPHELD<br/>graduated auto-ban check<br/>points ≥ threshold → ban (severity × duration)"]
    ADM --> OUT3["REDUCED<br/>delinquency points lowered"]
    ADM --> OUT4["DISMISSED<br/>case closed, no action"]
```

| Step | Who | Deadline | Side effects |
|---|---|---|---|
| 1·Delinquency created | Shipper / Admin / System | `responseDeadline` 1–7 days by severity | linked POD → `DISPUTED`; accused notified; **no auto-ban at creation** |
| 2·Check pending | accused party | — | sees `responseDeadline`, `isOverdue`, `responseStatus` |
| 3·Dispute response | accused driver / company (one per delinquency, optional) | before deadline or flagged `LATE`; allowed **post-decision** too | post-decision → admin pushed to re-review |
| 4·Admin decision | Admin / SuperAdmin | waits for deadline (not enforced) | `EXONERATED`/`UPHELD`/`REDUCED`/`DISMISSED` |
| 5·Auto side-effects | System | — | UPHELD → graduated auto-ban check; REDUCED → lower points |

**P.O.D tie-in:** disputing a delinquency auto-flips the linked DeliveryConfirmation to
`DISPUTED`; only an admin (roleId 3/6) can re-settle it back to `CONFIRMED` (new hash,
previous hash preserved) — the shipper sees the dispute on the POD record.

---

## 8. End-to-end picture (job flow → journey → delivery → dispute)

```mermaid
flowchart LR
    JOB["1–2–3–4 job flow<br/>(§1)"] --> JOUR["5–6–7–8–9 journey<br/>(§3)"]
    JOUR --> POL["P.O.L @ loading (6)<br/>(§5)"]
    JOUR --> POD["P.O.D @ complete (9)<br/>PENDING → CONFIRMED / DISPUTED<br/>(§6)"]
    POD --> DIS["complaint → delinquency →<br/>dispute response → admin decision<br/>(§7)"]
    DIS -. UPHELD .-> BAN["graduated auto-ban / penalty"]
    DIS -. re-settle .-> POD
```