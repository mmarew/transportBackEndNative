# Dynamics Freight Connector — Company Bidding & Assignment Flow

This document is prepared to guide developers on the design system, state management, UI views, and API integrations of the end-to-end company bidding and fleet vehicle assignment workflow in the Dynamics Freight Connector app.

---

## 1. Overview & State Management

The main entry point for the bidding feature is the **Bidding** tab inside the company dashboard, powered by **`BiddingView.tsx`**.

### State Management (Redux)
The application leverages Redux Toolkit (`bidsSlice.ts` and `fleetSlice.ts`) to manage state transitions:
* **Initialization:** On load, the view dispatches `fetchAvailableBids` and `fetchSubmittedBids` to populate state from the backend API.
* **Filtering:** Automatically filters out available requests (batches) for which the company has already submitted a bid, ensuring dispatchers only see open opportunities.
* **Optimistic Updates:** Local state is immediately updated upon bid submission (`addSubmittedBid`) and truck assignment (`markVehiclesActive`).

---

## 2. Bidding Flow Architecture

```
  [1. VIEW AVAILABLE LOADS]
             │
             ▼
      [2. PLACE BID]
             │
             ▼
     [3. SUCCESS SCREEN]
             │
             ├─► [Shipper NOT Accepted (Pending)] ─► Bypassed in dev / Disabled in prod
             │
             └─► [Shipper Accepted] 
                       │
                       ▼
             [4. VEHICLE ASSIGNMENT] (Manual / Auto-Assign)
                       │
                       ▼
             [5. SUCCESS & TRACK] ─► Opens tracking modal instantly
```

---

## 3. The Bidding & Assignment Process

The bidding process is implemented as a multi-step workflow inside the **`CreateBid.tsx`** modal.

### Step 1: Detail View
* **UI Features:** Renders pickup/drop-off route using an interactive OpenStreetMap iframe map centered on Addis Ababa, showing distance, cargo details, and expiration date.
* **Action:** Clicking **"Analyze & Create Bid"** advances the user to Step 2.

---

### Step 2: Custom Bid Form
* **UI Features:** Multi-input form allowing dispatchers to break down costs dynamically (Base cost per truck, Distance adjustment, Fuel cost, Demand surge).
* **Dynamic Calculation:** As the user inputs these values, the **Total Price** updates in real-time.
* **Action:** Clicking **"Submit Offer"** triggers the following API call:

**`POST /api/company/bids`**

**Payload Example:**
```json
{
  "shipperRequestBatchId": "ef5bc758-b85f-4de6-a750-855c79643794",
  "companyUniqueId": "e2332bce-0cc4-4be0-9d5d-3c1a60d23aa7",
  "proposedCostPerVehicle": 14500,
  "numberOfVehiclesOffered": 2,
  "vehicleTypeUniqueId": "flatbed-heavy-unique",
  "bidNotes": "Expedited delivery guarantee."
}
```

---

### Step 3: Success Screen (Shipper Acceptance Gatekeeper)
* **UI Features:** Congratulatory view showing successful submission details.
* **Shipper Acceptance Rule:**
  * **Accepted:** If the shipper has accepted the bid, the user is authorized to proceed to vehicle assignment by clicking **"Proceed to Assignment"**.
  * **Not Accepted (Pending):** Legally, vehicle assignment is restricted. The dispatcher cannot assign drivers until acceptance is processed.
  * > ⚠️ **Testing Bypass:** During local testing, if the API catches a `"pending shipper acceptance"` response, the frontend intercepts the error and simulates an automatic bypass toast, allowing developers to proceed to assignment for test verification.

---

### Step 4: Assign Trucks & Drivers
* **UI Features:** Fetches real-time company fleet (`getFleet`) and members (`getMembers`). Renders a circular assignment gauge representing *Trucks Selected / Required*.
* **Actions:**
  * **Manual Selection:** Selecting individual vehicles with checkboxes from the fleet status table.
  * **Auto-Assignment:** Clicking **"Auto-Assignment"** to automatically map and fill all required slots.
* **Endpoints & Payloads:**

**`GET /api/company/fleet?companyUniqueId=:companyUniqueId`**

**Response Example:**
```json
{
  "message": "success",
  "data": [
    {
      "companyVehicleUniqueId": "vh-76c2459b-18a0-4b21-8b22",
      "vehicleUniqueId": "v-98b7c6d5",
      "licensePlate": "ET-3-A12345",
      "vehicleTypeName": "Flatbed Heavy",
      "assignmentStatus": "Available",
      "color": "Blue",
      "carryingCapacity": "20 Tons"
    }
  ]
}
```

---

**`POST /api/company/assignments/auto`**

**Payload Example:**
```json
{
  "companyBidRequestUniqueId": "69fde2c8-c841-49a8-9be5-01b4925f7e81"
}
```

**Response Example:**
```json
{
  "message": "success",
  "data": "All slots in this batch are already assigned."
}
```

---

### Step 5: Assignment Success & Tracking
* **UI Features:** Final success layout showing successfully assigned metrics.
* **Action:** Clicking **"Track Your Assignment"** closes the flow and immediately launches the **Tracking Modal** to monitor live transit coordinates, status, and driver updates.

---

## 4. Post-Bid Actions

Once a bid proposal is submitted, it can be managed dynamically using the following endpoints:

### Edit Bid Proposal
Updates the proposed cost or the quantity of vehicles offered.

**`PATCH /api/company/bids/:bidId`**

**Payload Example:**
```json
{
  "proposedCostPerVehicle": 13800,
  "numberOfVehiclesOffered": 3
}
```

**Response Example:**
```json
{
  "message": "success",
  "data": {
    "companyBidRequestUniqueId": "69fde2c8-c841-49a8-9be5-01b4925f7e81",
    "proposedCostPerVehicle": 13800,
    "numberOfVehiclesOffered": 3,
    "bidStatus": "pending"
  }
}
```

---

### Cancel Bid Proposal
Withdraws/deletes the bid, releasing any held fleet reservations.

**`DELETE /api/company/bids/:bidId`**

**Response Example:**
```json
{
  "message": "success",
  "data": "Bid cancelled successfully."
}
```

---

> 💡 **Tip:** Always use real-time dispatch events to trigger immediate socket-based updates on vehicle assignments to keep the Dispatcher dashboard current.

