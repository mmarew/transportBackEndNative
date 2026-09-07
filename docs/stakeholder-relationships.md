# Stakeholder Relationships — Who Talks to Whom

> The institutional view of the platform: actors, their relationships, and the
> platform as the coordination + evidence layer. Complements `docs/app-flow-job.md`
> (which shows the *job flow*; this shows the *relationships*).
> Roles from `Utils/ListOfSeedData.js`: shipper 1 · driver 2 · admin 3 · vehicle
> owner 4 · system 5 · superAdmin 6 · companyAdmin 7 · company(org) 8 ·
> vehicle(org) 9 · dispatcher 10 · queueOrgAdmin 11.

---

## 1. Stakeholder relationship map

```mermaid
flowchart TB
    PL["PLATFORM — coordination & evidence layer<br/>routing · queue order (server-stamped) · decisions<br/>P.O.L / P.O.D. · dispute ledger · audit trail"]

    SH["SHIPPERS<br/>individual · factory · importer/exporter<br/>trading company · govt agency · broker/agent"]
    CO["TRANSPORT COMPANIES<br/>company admin + dispatcher"]
    DR["INDIVIDUAL DRIVERS<br/>verified: national ID · license · insurance"] 
    VO["VEHICLE OWNERS<br/>own trucks · assign drivers"]
    IN["BUSY LOADING PLACES<br/>factory / port / customs / warehouse<br/>+ Queue Org Admin"]
    DE["DELIVERY SIDE<br/>receiver · warehouse staff ·<br/>shipper delegate at destination"]
    AD["PLATFORM ADMIN / SUPERADMIN<br/>dispute arbiter · bans · Ministry interface"]
    GO["MINISTRY OF TRANSPORT (external)<br/>oversight · licensing · pilot partner"]

    PL --- SH
    PL --- CO
    PL --- DR
    PL --- VO
    PL --- IN
    PL --- DE
    PL --- AD

    SH <-->|"request → bid → accept<br/>price + history on platform"| CO
    SH <-->|"offer → driver accepts + quotes<br/>shipper accepts / rejects (p2p match)"| DR
    CO <-->|"dispatcher assigns driver + vehicle<br/>to each accepted slot"| DR
    VO -->|"truck ownership + assignment<br/>(one owner, many trucks,<br/>driver may drive others' trucks)"| DR
    VO -->|"fleet supply for company jobs"| CO

    DR -->|"checks in → server-stamped queueNumber"| IN
    IN -->|"FIFO dispatch offer (reserved drivers first)<br/>position changes, offers, rejects"| DR
    SH -->|"reserves own fleet · sees queue"| IN

    DR -->|"delivers → signed P.O.D.<br/>receiver + OTP + GPS + photos"| DE
    SH -->|"complaint (auto-disputes P.O.D.)"| AD
    AD -->|"delinquency → response →<br/>EXONERATED/UPHELD/REDUCED/DISMISSED<br/>→ graduated ban"| DR
    AD -->|"same dispute lifecycle"| CO

    GO -.->|"document verification:<br/>license · librea (registration) · insurance"| DR
    GO -.->|"pilot MOA · introductions<br/>oversight · access to aggregate data"| AD
```

---

## 2. What each stakeholder gets (and owes)

| Stakeholder | The platform gives them | What the system expects back |
|---|---|---|
| **Shipper** | verified driver pool, protected reserved fleet, live status, tamper-evident P.O.L/P.O.D., dispute record | truthful job specs, honoring accepted drivers/bids |
| **Individual driver** | visible position, no all-day blind waiting, fair FIFO + reservation priority, proof of delivery | ID/license/insurance verified, honor offers or take a refusal point |
| **Transport company (+dispatcher)** | company bidding, slot assignment from fleet, end-to-end visibility for large jobs | deliver what it bids; cancelling after acceptance triggers commission-evasion flag |
| **Vehicle owner** | register many trucks, assign different drivers, corporate fleet supply | valid vehicle docs (librea, insurance) |
| **Queue org / loading place + admin** | digital audited queue replacing paper, server-stamped "dispute truth", override audit log | impartial check-in/check-out and position rulings |
| **Receiver / delivery side** | their signature + OTP + GPS becomes legal-grade proof | confirm via the P.O.D. record |
| **Admin / SuperAdmin** | dispute arbitration with clear outcomes and auto-ban | fair decisions; the Ministry's technical counterpart |
| **Ministry** | oversight seat, data access, a controlled pilot on real corridors | introductions/MOA for Phase 1 — low risk for them |

---

## 3. The one-line institutional read

> The platform is a **trust layer** between shippers, drivers, transport companies,
> loading-place administrators, and delivery receivers — the Ministry's natural
> position is **strategic overseer of the pilot**, not operator of the app.