# Dynamics Transport Commission - Company Profile and Product Specification

> **Audience:** Frontend designers, UI/UX teams, marketing copy writers, investors, partners.
> **Purpose:** Everything needed to design the public-facing company profile website, mobile on-boarding screens, help pages, legal/policy pages, and to understand the business and product.

---

## Executive Summary

Dynamics Transport Commission (DTC) is a **Freight Transportation Marketplace Platform** — similar in concept to Uber Freight — that connects **shippers** (shippers) who need to transport goods with **truck drivers** who have available vehicles. The platform operates as a digital logistics marketplace facilitating the entire journey from request creation to delivery completion across **Ethiopia** and **Djibouti**. Revenue comes from **commission on completed journeys** and **driver subscription plans** (ETB). The system supports **online bidding**, **take-from-street** pickups, and **call center** booking.

---

## 1. Company Overview

**Company Name:** Dynamics Transport Commission (DTC)

**Tagline:** Move goods. Move fast. Move smart.

**What We Are:**
Dynamics Transport Commission is a technology-driven freight and cargo logistics platform operating across Ethiopia and Djibouti. We connect shippers (businesses and individuals who need to move goods) with verified truck drivers and fleet owners through a transparent, competitive bidding system. Think Uber for freight, Convoy-style load matching, and fleet management combined.

**Mission:**
To digitize and modernize cargo transportation in the Horn of Africa, making it safer, more affordable, and more transparent for every participant in the supply chain.

**Vision:**
To become the leading logistics technology platform across East Africa, enabling any shipper to move any load to any destination with full visibility, fair pricing, and guaranteed security.

### Business Model

**Core Value Proposition**

| For Shippers                                                                    | For Drivers                                                   | For Platform                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Easy access to verified drivers with appropriate vehicles for their cargo needs | Steady stream of transportation jobs and income opportunities | Commission-based revenue from completed journeys plus subscription revenue from drivers |

**Target Market**

- **Primary users:** Shippers (businesses and individuals), truck drivers, vehicle owners.
- **Geographic focus:** Ethiopia and Djibouti (ETB, Addis Ababa–Djibouti corridor, urban and inter-city freight).

---

## 2. Service Coverage

### Countries of Operation

| Country  | Key Corridors                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------- |
| Ethiopia | Addis Ababa, Dire Dawa, Mekelle, Hawassa, Bahir Dar, Adama, Jimma, and all inter-city freight routes |
| Djibouti | Djibouti City, Ali Sabieh, and the Djibouti-Ethiopia trade corridor                                  |

### Coverage Highlights

- All major trade corridors between Ethiopian industrial zones
- The Addis Ababa to Djibouti Port highway (the busiest freight route in the Horn of Africa)
- Urban last-mile delivery within Addis Ababa
- Cross-border freight between Ethiopia and Djibouti

---

## 3. How It Works - Three Ways to Ship

### 3.1 Online Bid Matching (App-Based)

The primary service flow. A shipper posts a load, nearby drivers bid on it, and the shipper selects the best offer.

**Step-by-step:**

1. **Shipper Posts a Request** - Opens the DTC app or calls the call center. Enters pickup location, destination, vehicle type needed, item description, quantity (in quintals), preferred shipping/delivery dates, and a budget (optional). The request enters "Waiting" status.

2. **System Matches Nearby Drivers** - The platform automatically finds verified drivers within approximately 1 km radius whose registered vehicle type matches the request. Matched drivers are notified instantly via push notification.

3. **Drivers Place Bids** - Each matched driver reviews the load details and submits a bid (their proposed shipping cost). The shipper sees all incoming bids in real time.

4. **Shipper Selects a Driver** - The shipper compares bids, driver ratings, and vehicle details. Selects one driver. The others are notified they were not selected.

5. **Journey Starts** - The selected driver confirms, picks up the cargo, and taps "Start Journey." Live GPS tracking begins. The shipper can follow the truck in real time.

6. **Journey Completes** - Driver arrives at destination and taps "Complete Journey." The shipper confirms delivery. Payment is processed, commission is calculated, and both parties can rate each other.

**Status Flow:** Waiting (1) > Requested (2) > Accepted by Driver (3) > Accepted by Shipper (4) > Journey Started (5) > Journey Completed (6)

**Request details (shipper can specify):** Cargo (item name, quantity in quintals), pickup and delivery locations, vehicle type, shipping/delivery dates, proposed shipping cost (optional). Shippers can request **multiple vehicles in one batch** (batch request).

### Journey Status Lifecycle (All 15 States)

The platform manages 15 distinct journey states:

**Active states (1–6):**

1. **Waiting** — Shipper created request; waiting for driver match.
2. **Requested** — Request sent to driver(s); driver has not yet responded.
3. **Accepted by Driver** — Driver accepted and submitted bid.
4. **Accepted by Passenger** — Shipper selected this driver.
5. **Journey Started** — Driver started the trip; GPS tracking active.
6. **Journey Completed** — Delivery done; payment and rating follow.

**Terminal states (7–15):**

7. Cancelled by Passenger
8. Rejected by Passenger (one driver’s offer rejected)
9. Cancelled by Driver
10. Cancelled by Admin
11. Completed by Admin (manual completion)
12. Cancelled by System (e.g. timeout)
13. No Answer from Driver (reassign to another driver)
14. Not Selected in Bid (driver bid but shipper chose another)
15. Rejected by Driver (driver declined before accepting)

### 3.2 Take From Street (On-The-Spot Pickup)

For drivers who find a shipper on the road without the app.

- Driver meets a shipper in person (at a loading zone, marketplace, etc.)
- Driver opens the app and enters the shipper's phone number, cargo details, pickup and destination locations
- The system instantly creates accounts for both parties, starts the journey, and begins GPS tracking
- The shipper receives an SMS with the driver's name, vehicle info, and a link to track the cargo
- Journey starts immediately (no bidding phase)

**Use case:** Street-side freight pickups, market-to-warehouse transport, walk-in customers at loading docks.

### 3.3 Call Center (Operator-Assisted Booking)

For shippers who prefer phone-based booking or do not have the app.

- Shipper calls the DTC call center hotline
- An operator collects all shipment details (origin, destination, item, quantity, vehicle type)
- The operator creates the request in the system on behalf of the shipper
- The request enters the same bid-matching flow as app-based requests
- The shipper receives SMS updates on driver assignment and journey progress

### 3.4 Journey Status Lifecycle

The platform manages **15 distinct journey states**:

**Active states (1–6):**

| ID  | Status                | Description                                                  |
| --- | --------------------- | ------------------------------------------------------------ |
| 1   | Waiting               | Shipper created request; waiting for driver match.           |
| 2   | Requested             | Request sent to driver(s); driver has not yet accepted.      |
| 3   | Accepted by Driver    | Driver accepted and submitted bid; shipper has not selected. |
| 4   | Accepted by Passenger | Shipper selected this driver; journey can start.             |
| 5   | Journey Started       | Driver started the trip; GPS tracking active.                |
| 6   | Journey Completed     | Delivery completed; payment and rating follow.               |

**Terminal states (7–15):**

| ID  | Status                 | Description                                   |
| --- | ---------------------- | --------------------------------------------- |
| 7   | Cancelled by Passenger | Shipper cancelled the request.                |
| 8   | Rejected by Passenger  | Shipper rejected this driver's bid.           |
| 9   | Cancelled by Driver    | Driver withdrew after accepting.              |
| 10  | Cancelled by Admin     | Admin cancelled (e.g. fraud, safety).         |
| 11  | Completed by Admin     | Admin marked journey completed manually.      |
| 12  | Cancelled by System    | System auto-cancelled (e.g. timeout).         |
| 13  | No Answer from Driver  | Driver did not respond; request reassigned.   |
| 14  | Not Selected in Bid    | Driver bid but shipper chose another driver.  |
| 15  | Rejected by Driver     | Driver declined the request before accepting. |

---

## 4. User Roles

| Role                | Description                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shipper (Passenger) | A business or individual who needs goods transported. Creates shipping requests, reviews driver bids, selects drivers, tracks journeys, and rates service.                 |
| Driver              | A verified truck driver who registers availability, receives shipping requests, places bids, picks up cargo, and completes deliveries. Must maintain a valid subscription. |
| Vehicle Owner       | The person or company that owns the truck. Can assign vehicles to drivers. A driver may also be the vehicle owner.                                                         |
| Admin               | DTC operations staff. Manages users, reviews documents, resolves disputes, handles cancellations, and monitors platform activity.                                          |
| Super Admin         | Full system access. Manages admins, configures pricing, commission rates, subscription plans, and platform settings.                                                       |

---

## 5. Vehicle Fleet

DTC supports multiple truck types to match every cargo need:

| Vehicle Type | Carrying Capacity (Quintals) | Best For                                  |
| ------------ | ---------------------------- | ----------------------------------------- |
| Isuzu NPR    | 50                           | Small loads, urban delivery, short-haul   |
| Isuzu FSR    | 100                          | Medium loads, regional transport          |
| Sino Truck   | 150                          | Heavy loads, inter-city freight           |
| Euro Tracker | 430                          | Maximum capacity, long-haul, cross-border |

Each vehicle on the platform has:

- A verified license plate
- An assigned vehicle type with known carrying capacity
- An active/inactive status managed by the admin
- Ownership records linking the vehicle to its owner
- A driver assignment linking the vehicle to an active driver

**Vehicle status tracking:** Active/Inactive, driver assignment, ownership verification, registration and insurance status (where required).

---

## 6. Registration and Onboarding

### For Shippers (Passengers)

1. Download the DTC app
2. Register with phone number
3. Verify via OTP (sent by SMS)
4. Create profile (basic information)
5. Optional: upload profile photo and national ID; add balance to account for payments
6. Start posting shipment requests immediately

### For Drivers

1. Download the DTC app
2. Register with phone number, full name, and email
3. Verify via OTP
4. Upload required documents:
   - Driver's License (with expiration date and file number) - mandatory
   - Vehicle Registration / Librea (with file number) - mandatory
   - Profile Photo - mandatory
   - Insurance Document - optional
   - Tax Identification Number - optional
   - Delegation of Vehicle Use - optional
   - National ID - optional
5. Register a vehicle (license plate, color, vehicle type)
6. Wait for admin to review and approve documents
7. Subscribe to a plan (free trial available for new drivers)
8. Start receiving shipment requests

### Driver Account Statuses

| Status                            | Meaning                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| Active                            | All documents approved, vehicle registered, subscription active. Can receive requests. |
| Inactive - Vehicle Not Registered | Must register a vehicle first.                                                         |
| Inactive - Documents Missing      | Must upload all required documents.                                                    |
| Inactive - Documents Rejected     | One or more documents were rejected by admin. Must re-upload.                          |
| Inactive - Documents Pending      | Documents uploaded but awaiting admin review.                                          |
| Inactive - Banned                 | Account suspended by admin due to policy violation.                                    |
| Inactive - No Subscription        | Must purchase or renew a subscription plan.                                            |
| Account Deleted                   | Account permanently deactivated.                                                       |

---

## 7. Pricing and Payment

### How Pricing Works

- Shipper sets a budget (optional) when posting a shipment request.
- Drivers bid competitively with their proposed shipping cost.
- The shipper selects the best offer. There is no fixed price; it is a free-market bid.
- Tariff rates (standing rate, journey rate, timing rate) are configured per vehicle type as reference guidelines.

### Payment Methods

| Method                  | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| Cash on Delivery        | Shipper pays the driver directly upon delivery.       |
| Bank Transfer           | Payment via bank (CBE, Dashen, etc.).                 |
| Telebirr / Mobile Money | Mobile payment through Telebirr or similar providers. |

### Revenue Model

**Primary revenue — Commission**

- Platform charges a commission (e.g. 10–15%) on each completed transportation job.
- Commission rate is configurable by admin (percentage of shipping cost).
- **Example:** Shipping cost 45,000 ETB → Commission 10% = 4,500 ETB → Driver receives 40,500 ETB; platform revenue 4,500 ETB.

**Secondary revenue**

- **Subscription fees** from drivers (see Section 8).
- **Premium features** (e.g. priority matching, analytics, premium support) as offered.

### Commission

- DTC earns a commission on each completed journey.
- The commission rate is a percentage of the shipping cost, configured by the admin.
- Commission is automatically calculated when a journey is completed.
- Commission statuses: Pending, Paid, Requested, Free, Canceled.

### Financial Operations — User Balance System

**Deposits:** Shippers and drivers can deposit funds (bank transfer, Telebirr, mobile money, admin-approved deposits, inter-user transfers, bonus credits). Processing fees may apply (e.g. 10 ETB bank, 5 ETB mobile money — configurable).

**Payments:** Automatic deduction for completed journeys, subscription renewal, commission deductions, refund processing.

**Deposit sources:** Direct driver deposits, inter-user transfers, admin deposits, bonus credits.

### Driver Wallet and Balance

Drivers maintain a wallet balance on the platform:

- **Deposits:** Drivers deposit funds via bank transfer, Telebirr, or bonus credits.
- **Deductions:** Subscription fees and commissions are deducted from the balance.
- **Transfers:** Balance can be transferred between drivers (e.g., fleet scenarios).
- **Refunds:** Admin can issue refunds to a driver's or shipper's wallet.
- **Balance History:** Every transaction (deposit, commission, subscription, transfer, refund) is logged with timestamps.

---

## 8. Subscription Plans

Drivers must hold an active subscription to receive shipment requests.

| Plan Type  | Duration | Price (ETB)   | Description                                                               |
| ---------- | -------- | ------------- | ------------------------------------------------------------------------- |
| Free Trial | 1 month  | 700 ETB value | Available once per driver. Lets new drivers experience the platform free. |
| Monthly    | 30 days  | 700 ETB       | Standard monthly plan.                                                    |
| Quarterly  | 90 days  | 1,800 ETB     | 3-month plan.                                                             |
| Annual     | 365 days | 6,000 ETB     | 12-month plan.                                                            |

- Exact pricing is set by admin and can change over time (effective-from / effective-to date per pricing tier).
- When a subscription expires, the driver's status changes to "Inactive - No Subscription" and they cannot receive new requests until they renew.

---

## 9. Safety and Security

### Driver Verification

Every driver on the platform is verified through:

- Government-issued Driver's License with expiration tracking
- Vehicle Registration (Librea) proving legal vehicle ownership or delegation
- Profile Photo for identity confirmation
- National ID (optional but recommended)
- All documents are reviewed and approved or rejected by DTC admin staff before the driver can go active

### Cargo Tracking

- Real-time GPS tracking from journey start to completion
- Route points are recorded continuously during every journey
- Shippers can see driver location on a live map at all times

### Accountability System

- **Ratings:** After every journey, both shipper and driver can rate each other (1-5 stars) with optional comments.
- **Delinquency Tracking:** The platform tracks driver and shipper violations (late arrival, rude behavior, cancellations, etc.) with severity levels (Low, Medium, High, Critical) and point-based scoring.
- **Automatic Banning:** Users who accumulate too many delinquency points are automatically banned for a configurable duration (7, 30, 90+ days).
- **Admin Override:** Admins can manually ban or unban users and resolve disputes.

### Cancellation Policy

Either party can cancel a request, but cancellations are tracked and penalized:

- **Shipper cancels:** All matched drivers are notified; the request is removed.
- **Driver cancels:** Only that driver's participation is withdrawn; the shipper can select another driver.
- **Admin cancels:** Administrative intervention (e.g., fraud, safety concern).
- **System cancels:** Automatic cancellation due to timeout or rule violation.
- **No Answer from Driver:** If a matched driver does not respond in time, the system automatically reassigns the request to another driver.

Every cancellation requires selecting a reason from a predefined list, and all cancellations are logged for audit.

---

## 10. Notifications

The platform sends real-time notifications at every key moment:

| Event                         | Recipient          | Channel               |
| ----------------------------- | ------------------ | --------------------- |
| Driver matched with shipment  | Shipper and Driver | Push (FCM), WebSocket |
| Driver places a bid           | Shipper            | Push, WebSocket       |
| Shipper selects a driver      | Driver             | Push, WebSocket       |
| Journey started               | Shipper            | Push, WebSocket       |
| Journey completed             | Shipper and Driver | Push, WebSocket       |
| Request cancelled             | Affected party     | Push, WebSocket       |
| Driver not responding         | Shipper            | Push, WebSocket       |
| Driver rejected by shipper    | Driver             | Push, WebSocket       |
| OTP for login/registration    | User               | SMS                   |
| Take-from-street confirmation | Shipper            | SMS                   |
| Document approved/rejected    | Driver             | Push                  |

---

## 11. Terms of Service

### 11.1 Acceptance

By registering for or using the Dynamics Transport Commission platform ("DTC"), you agree to these Terms of Service. If you do not agree, do not use the platform.

### 11.2 Eligibility

- Shippers: Any individual or business entity with a valid phone number.
- Drivers: Must be 18 years or older, hold a valid driver's license, and complete the verification process.
- Vehicle Owners: Must provide proof of vehicle registration.

### 11.3 Account Responsibilities

- You are responsible for maintaining the confidentiality of your account credentials.
- You must provide accurate, current information during registration.
- You must not share your account with others.
- DTC reserves the right to suspend or terminate accounts that violate these terms.

### 11.4 Service Usage

- Shippers agree to provide accurate cargo descriptions, pickup/destination locations, and shipment details.
- Drivers agree to maintain valid documents, keep vehicles in safe operating condition, and follow all applicable traffic and transportation laws.
- Users agree not to engage in fraudulent pricing, bid manipulation, or deceptive practices.
- DTC is a platform connecting shippers and drivers; DTC is not a carrier and does not assume liability for cargo.

### 11.5 Payments and Fees

- Shipping costs are determined by the competitive bid process between shipper and driver.
- DTC charges a commission on completed journeys as a platform fee.
- Drivers must maintain an active subscription to access the platform.
- All financial transactions are logged and auditable.

### 11.6 Cancellations

- Either party may cancel a request before the journey starts.
- Cancellations are logged and may result in delinquency points.
- Excessive cancellations may result in temporary or permanent account suspension.

### 11.7 Disputes

- Disputes between shippers and drivers should be reported through the app or call center.
- DTC admin will review evidence and make a resolution within a reasonable timeframe.
- DTC's decision on disputes is final within the platform.

### 11.8 Limitation of Liability

- DTC provides the technology platform only. Actual transportation is performed by independent drivers.
- DTC is not liable for cargo damage, theft, or loss during transport unless directly caused by DTC negligence.
- Users are encouraged to obtain their own cargo insurance.

### 11.9 Modifications

- DTC may update these terms at any time. Users will be notified of material changes.
- Continued use after changes constitutes acceptance.

---

## 12. Privacy Policy

### 12.1 Information We Collect

- **Account Information:** Phone number, full name, email address.
- **Identity Documents:** Driver's license, national ID, profile photo, vehicle registration (for drivers).
- **Location Data:** GPS coordinates during active journeys for real-time tracking.
- **Transaction Data:** Payment amounts, commission records, deposit history, subscription records.
- **Device Information:** Device type, operating system, app version, FCM token for push notifications.

### 12.2 How We Use Your Information

- To verify driver identity and vehicle registration.
- To match shippers with appropriate drivers based on location and vehicle type.
- To provide real-time GPS tracking during active journeys.
- To process payments, commissions, and subscriptions.
- To send notifications about journey status, bids, and account updates.
- To enforce platform policies (delinquency tracking, banning).
- To improve our service and resolve disputes.

### 12.3 Information Sharing

- We share shipper details with matched drivers (and vice versa) only during an active journey.
- We do not sell personal data to third parties.
- We may share data with law enforcement when required by applicable law.
- We may share aggregated, anonymized data for analytics and service improvement.

### 12.4 Data Security

- All passwords and OTPs are hashed using industry-standard encryption (bcrypt).
- API communication is secured via token-based authentication (JWT).
- Database access is restricted and audited.
- Document uploads are stored on secure FTP servers.

### 12.5 Data Retention

- Active account data is retained as long as the account is active.
- Deleted accounts are soft-deleted and data is retained for audit purposes per applicable regulations.
- Journey history and financial records are retained for regulatory compliance.

### 12.6 Your Rights

- You may request access to your personal data.
- You may request correction of inaccurate data.
- You may request account deletion (subject to pending transactions and regulatory requirements).

---

## 13. Contact Information

### Customer Support

- **Call Center:** Available during business hours for booking assistance, journey inquiries, and dispute resolution.
- **In-App Support:** Contact us directly through the DTC mobile app.
- **Email:** support@dynamicstransport.com

### Head Office

- **Location:** Addis Ababa, Ethiopia
- **Regional Office:** Djibouti City, Djibouti

### Business Inquiries

- **Fleet Partnerships:** For companies with multiple vehicles wanting to join the platform.
- **Corporate Accounts:** For businesses with regular shipping needs.
- **Email:** business@dynamicstransport.com

---

## 14. Designer Reference - Key Pages and Screens

This section lists all pages the frontend designer should create for the company profile website.

### Public Website Pages

| Page             | Content                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home / Landing   | Hero section with tagline, "How It Works" summary (3 steps), vehicle fleet showcase, coverage map (Ethiopia + Djibouti), CTA buttons ("Ship Now" / "Drive With Us") |
| About Us         | Company story, mission, vision, team, coverage area details                                                                                                         |
| How It Works     | Three tabs: "Online Bidding", "Take From Street", "Call Center" with step-by-step flow diagrams                                                                     |
| Services         | Vehicle types with carrying capacities, supported cargo types, cross-border capability                                                                              |
| For Shippers     | Benefits, how to register, how to post a request, how bidding works, payment options                                                                                |
| For Drivers      | Benefits, how to register, required documents checklist, subscription plans, earnings info                                                                          |
| Fleet Partners   | Information for vehicle owners and fleet companies wanting to onboard multiple trucks                                                                               |
| Pricing          | Explanation of bid-based pricing, commission structure, subscription plans, payment methods                                                                         |
| Safety and Trust | Driver verification process, GPS tracking, ratings system, delinquency/ban system                                                                                   |
| Terms of Service | Full legal text (Section 11 above)                                                                                                                                  |
| Privacy Policy   | Full legal text (Section 12 above)                                                                                                                                  |
| Contact Us       | Call center number, email addresses, office locations (Addis Ababa, Djibouti), contact form, map                                                                    |
| FAQ              | Common questions about registration, pricing, tracking, cancellations, subscriptions                                                                                |
| Download App     | Links to App Store / Google Play with screenshots                                                                                                                   |

### Design Notes

- **Brand tone:** Professional, trustworthy, modern, African-forward.
- **Color palette:** Suggest bold primary (brand color), clean white backgrounds, accent colors for CTAs.
- **Typography:** Clean sans-serif for body, bold headers.
- **Imagery:** Ethiopian and Djibouti landscapes, trucks on highways, loading zones, people using phones.
- **Icons:** Use distinct icons for each vehicle type (Isuzu NPR, Isuzu FSR, Sino Truck, Euro Tracker).
- **Map:** Interactive or static map showing Ethiopia and Djibouti with route lines.
- **Mobile-first:** The primary user base accesses via mobile. Design responsive.

---

## 15. Administrative Capabilities

### Super Admin

- Create and manage admin accounts
- Install and configure system-wide settings (pricing, commission, subscription plans)
- Manage user roles and permissions
- Override account restrictions (ban/unban, refunds)
- Security and policy management
- Financial oversight and reporting
- Emergency operations and system-wide overrides

### Regular Admin

- User management and search (shippers, drivers, vehicle owners)
- Driver authorization and document approval/rejection
- Journey monitoring and manual completion/cancellation
- Deposit approval and balance adjustments
- System statistics and dashboards
- Role assignment within admin team

---

## 16. Technology Infrastructure

- **Real-time:** WebSocket communication (Socket.IO), Redis adapter for scalable messaging; live updates for drivers and shippers (bids, journey status, GPS).
- **Security:** JWT authentication, role-based access control (RBAC), rate limiting, input sanitization, XSS protection, Helmet security headers; Firebase Admin for push (FCM).
- **Scalability:** PM2 cluster mode, Redis caching, database connection pooling, compression middleware; load-balancing ready.

---

## 17. Key Performance Indicators (KPIs)

**Business metrics:** Total active drivers and shippers; completed journeys per day/month; average journey value; commission revenue; subscription revenue; driver utilization rate; shipper retention rate.

**Operational metrics:** Average matching time; journey completion rate; cancellation rate; document approval time; driver onboarding time; platform uptime.

---

## 18. Competitive Advantages

1. **Automated matching** — Intelligent driver–shipper matching by location and vehicle type.
2. **Bidding system** — Competitive pricing through driver bids; shipper chooses best offer.
3. **Real-time tracking** — GPS-based journey monitoring and transparency.
4. **Verification** — Multi-layer driver and vehicle verification and document checks.
5. **Flexible subscriptions** — Multiple subscription tiers (trial, monthly, quarterly, annual).
6. **User balance system** — Simplified payments, deposits, and refunds.
7. **Batch requests** — Shippers can request multiple vehicles in one batch.

---

## 19. Business Challenges & Solutions

| Challenge        | Solution                                                             |
| ---------------- | -------------------------------------------------------------------- |
| Driver supply    | Free trial, competitive commission rates, steady job flow            |
| Trust and safety | Document verification, ratings, admin oversight, GPS tracking        |
| Payment security | Balance-based system, admin approval for deposits, refund management |
| Market liquidity | Automated matching, bidding, support for multiple vehicle types      |

---

## 20. Growth Opportunities

- **Geographic expansion** — Additional cities and regions in Ethiopia and Djibouti.
- **Vehicle types** — More specialized vehicle types and capacity tiers.
- **B2B partnerships** — Corporate contracts with logistics companies and large shippers.
- **Insurance** — Cargo or liability insurance products.
- **Financing** — Driver vehicle financing or working-capital programs.
- **Analytics** — Premium analytics and reporting for frequent shippers.
- **API integration** — Third-party logistics and ERP integration.

---

## 21. Regulatory Compliance

- Driver license verification and expiration monitoring
- Vehicle registration (Librea) validation
- Tax ID tracking where required
- Insurance requirement enforcement
- Document expiration alerts and audit trail for transactions

---

## 22. Target Customer Segments

**Shippers:** Small businesses with regular transport needs; agricultural producers; construction and materials; retail and distribution; individual movers.

**Drivers:** Independent truck owners; fleet operators; part-time drivers; professional logistics drivers.

---

## 23. Success Factors

1. **Network effect** — More drivers attract more shippers and vice versa.
2. **Trust** — Robust verification and ratings build confidence.
3. **Efficiency** — Fast matching reduces wait times.
4. **Fair pricing** — Bidding ensures competitive rates.
5. **Reliability** — Real-time tracking and clear status updates.
6. **Support** — Admin oversight and dispute resolution.

---

## 24. Glossary

| Term             | Definition                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Shipper          | The person or business sending cargo (also called "shipper" in the system)                   |
| Driver           | The truck driver who transports the cargo                                                    |
| Vehicle Owner    | The person or entity that owns the truck                                                     |
| Bid              | The driver's proposed cost for transporting a specific load                                  |
| Journey          | A single cargo transport trip from pickup to delivery                                        |
| Journey Decision | The system record linking a shipper's request to a driver's acceptance                       |
| Take From Street | A pickup mode where the driver registers a street-side shipper directly                      |
| Tariff Rate      | Reference pricing per vehicle type (standing, journey, timing rates)                         |
| Commission       | DTC's percentage-based fee on each completed journey                                         |
| Subscription     | A time-based plan that drivers must maintain to access the platform                          |
| Delinquency      | A recorded violation (late arrival, cancellation, misbehavior) with severity and point value |
| OTP              | One-Time Password sent via SMS for account verification                                      |
| Quintal          | A unit of weight equal to 100 kg, commonly used in Ethiopian trade                           |

---

**Platform type:** Two-sided marketplace (freight / logistics)  
**Business model:** Commission + subscription  
**Technology:** Node.js, Express, MySQL, Redis, Socket.IO  
**Document version:** 1.0.0  
**Author:** Marew Masresha Abate

Document generated from the Dynamics Transport Commission platform codebase.  
Last updated: February 2026
