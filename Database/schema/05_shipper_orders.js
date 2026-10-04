"use strict";

// shipper orders
// Tables: ShipperRequest, ShipperRequestBatch
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 447-594). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `

-- Create the ShipperRequest table

CREATE TABLE IF NOT EXISTS ShipperRequest (
    shipperRequestId INT AUTO_INCREMENT PRIMARY KEY,
    shipperRequestUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the shipper request

    userUniqueId VARCHAR(36) NOT NULL,                     -- Foreign key to Users
    shipperRequestBatchUniqueId VARCHAR(36) NOT NULL,  -- Batch ID for grouping requests
    vehicleTypeUniqueId VARCHAR(36) NOT NULL,              -- Foreign key to VehicleType
    journeyStatusId INT NOT NULL,                          -- Foreign key to JourneyStatus

    -- Request mode: controls whether this is open to individual drivers, or targeted at a
    -- specific company. Bidding-board visibility is NOT a mode — it is a per-order
    -- flag (ShipperRequest.isBiddingApproved) that tells the matchers whether a
    -- queue order is open to distance matching. See the isBiddingApproved column below.
    --   'individual_target' — open to all individual drivers (distance or queue FIFO dispatch)
    --   'company_target'    — targeted to a transport company (fleet bid flow)
    requestMode ENUM('individual_target', 'company_target') NOT NULL DEFAULT 'individual_target',
    -- Only set when requestMode = 'company_target'; the specific company the shipper is targeting
    targetCompanyUniqueId VARCHAR(36) NULL DEFAULT NULL,
    -- Queue dispatch: set on the ShipperRequestBatch (see its CREATE below); queue
    -- dispatch replaces distance-based auto-match with front-of-queue offering.
    -- ShipperRequest rows inherit queueOrganizationUniqueId via the batch join — the
    -- legacy per-row column was dropped in the batch-canonical migration.

    originLatitude DECIMAL(10, 8) NOT NULL,                -- Latitude of origin
    originLongitude DECIMAL(11, 8) NOT NULL,               -- Longitude of origin
    originPlace VARCHAR(255) NOT NULL,                     -- Origin place

    destinationLatitude DECIMAL(10, 8) DEFAULT 0.0,        -- Latitude of destination
    destinationLongitude DECIMAL(11, 8) DEFAULT 0.0,       -- Longitude of destination
    destinationPlace VARCHAR(255) DEFAULT '',              -- Destination place

    shipperRequestCreatedAt   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Time of the request
    
    -- requestTime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Time of the request

    shippableItemName VARCHAR(100) DEFAULT NULL,           -- Name of the item to ship
    shippableItemQtyInQuintal DECIMAL(15,2) DEFAULT NULL,   -- Quantity in quintals
    shippingDate DATETIME DEFAULT NULL,                        -- Date of shipping
    deliveryDate DATETIME DEFAULT NULL,                        -- Date of delivery
    shippingCost DECIMAL(10,2) DEFAULT NULL,               -- Cost of the shipment
    -- Receipt-based POD flag. When FALSE, completeJourney auto-creates a
    -- CONFIRMED DeliveryConfirmation (source='AUTO_NO_POD') — no photos or
    -- signatures needed. When TRUE (default), the driver must submit receipt
    -- photos (POST /receipt) or the shipper must submit formal POD.
    -- Copied from ShipperRequestBatch.isPodRequired at order creation time.
    isPodRequired BOOLEAN NOT NULL DEFAULT TRUE,
    isCompletionSeen BOOLEAN DEFAULT FALSE,               -- if it is completed and seen by shipper 

    -- Bidding-board gate (PER-ORDER, sole bidding signal — no mode, no special status).
    -- Each ShipperRequest is independently opened to the bidding board. TRUE (via
    -- approveBidding) => the order is distance-matchable (findNearbyDrivers/Shippers)
    -- and skipped by FIFO; FALSE (default) => normal order flow. Orders in the same
    -- batch can diverge (e.g. 3 hired via FIFO at status 3+, 4 opened to bidding).
    isBiddingApproved BOOLEAN NOT NULL DEFAULT FALSE,

    shipperRequestCreatedBy VARCHAR(36) NOT NULL,          -- Who created the request an admin  from call center, shipper himself or driver take from street
    shipperRequestCreatedByRoleId INT NOT NULL,          -- roleId of the creator when it create this request
    shipperRequestUpdatedBy VARCHAR(36) NULL,  -- Who updated the shipper request
    shipperRequestDeletedBy VARCHAR(36) NULL,  -- Who deleted the shipper request
    shipperRequestUpdatedAt DATETIME NULL,  -- When the shipper request was updated
    shipperRequestDeletedAt DATETIME NULL,  -- When the shipper request was deleted

    foreign key (shipperRequestCreatedByRoleId) references Roles(roleId),
    foreign key (shipperRequestCreatedBy) references Users(userUniqueId),
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleTypes(vehicleTypeUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId),
    FOREIGN KEY (shipperRequestUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (shipperRequestDeletedBy) REFERENCES Users(userUniqueId),
    -- NOTE: FK to TransportCompany(companyUniqueId) is defined after that table is created below
    -- INDEX added after company tables: idx_shipperRequest_targetCompany (targetCompanyUniqueId)
    INDEX idx_sr_bidding_approved (isBiddingApproved)
);

-- ShipperRequestBatch: A metadata table that summarizes a group of requests.
-- Junior Note: Performance Optimization!
-- Instead of grouping 1000s of individual requests on every discovery call, 
-- we query this single "Header" table. This turns an O(N*M) operation into O(N).
CREATE TABLE IF NOT EXISTS ShipperRequestBatch (
    batchId INT AUTO_INCREMENT PRIMARY KEY,
    batchUniqueId VARCHAR(36) UNIQUE NOT NULL,             -- The common ID for all requests in this batch
    shipperUserUniqueId VARCHAR(36) NOT NULL,              -- FK → Users
    vehicleTypeUniqueId VARCHAR(36) NOT NULL,              -- FK → VehicleTypes
    totalVehicles INT NOT NULL DEFAULT 1,                  -- Total number of vehicles requested

    --   'individual_target' — open to all individual drivers (distance or queue FIFO dispatch)
    --   'company_target'    — targeted to a transport company (fleet bid flow)
    requestMode ENUM('individual_target', 'company_target') NOT NULL DEFAULT 'individual_target',
    targetCompanyUniqueId VARCHAR(36) NULL DEFAULT NULL,   -- FK → TransportCompany (null if open)
    -- CANONICAL queue affiliation. Lives ONLY here (NOT on ShipperRequest — DRY):
    -- rows inherit it via batch join (srb.batchUniqueId = sr.shipperRequestBatchUniqueId).
    -- Required because company_target batches defer ShipperRequest rows to bid
    -- acceptance, so only the batch header can represent the queue.
    queueOrganizationUniqueId VARCHAR(36) NULL DEFAULT NULL, -- FK → QueueOrganization (null if not a queue order)

    -- NOTE: The bidding-board gate (isBiddingApproved) lives PER-ORDER on
    -- ShipperRequest (not here), because orders within one batch can diverge —
    -- e.g. some hired via FIFO while others are opened to bidding.

    -- Descriptive metadata for the "Bid Board"
    originLatitude DECIMAL(10, 8) NULL,                    -- Needed for lazy sr creation at bid approval
    originLongitude DECIMAL(11, 8) NULL,
    originPlace VARCHAR(255) NOT NULL,
    destinationLatitude DECIMAL(10, 8) NULL,
    destinationLongitude DECIMAL(11, 8) NULL,
    destinationPlace VARCHAR(255) NOT NULL,
    shippableItemName VARCHAR(100) NULL,
    shippableItemQtyInQuintal DECIMAL(15,2) NULL,
    shippingDate DATETIME NULL,
    deliveryDate DATETIME NULL,
    shippingCost DECIMAL(10,2) NULL,
    -- Receipt-based POD flag (batch header). Copied to each ShipperRequest
    -- at creation time. When FALSE, completeJourney auto-confirms with
    -- source='AUTO_NO_POD'. When TRUE (default), driver submits receipt photos
    -- or shipper submits formal POD. Set at batch creation, immutable after.
    isPodRequired BOOLEAN NOT NULL DEFAULT TRUE,

    -- Audit: who created this batch (shipper, admin, company admin, or queue staff).
    -- Stored at creation time from shipperRequestCreatedBy / shipperRequestCreatedByRoleId.
    -- These are AUDIT mextadata only — access scoping for queue staff is by org
    -- membership (QueueOrganizationMembership), NOT by this column.
    batchCreatedBy VARCHAR(36) NULL DEFAULT NULL,          -- FK → Users (userUniqueId of the creator)
    batchCreatedByRoleId INT NULL DEFAULT NULL,            -- FK → Roles (creator's roleId: 1=shipper, 3=admin, 7=companyAdmin, 11=queueOrgAdmin, 12=queueDispatcher)

    journeyStatusId INT NOT NULL DEFAULT 1,                -- FK → JourneyStatus
    batchCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    batchUpdatedAt DATETIME NULL,
    batchDeletedAt DATETIME NULL,

    INDEX idx_batch_target (targetCompanyUniqueId),
    INDEX idx_batch_status (journeyStatusId),
    INDEX idx_batch_mode (requestMode),
    INDEX idx_batch_queue_org (queueOrganizationUniqueId),
    INDEX idx_batch_created_by (batchCreatedBy),
    FOREIGN KEY (shipperUserUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleTypes(vehicleTypeUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId),
    FOREIGN KEY (batchCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (batchCreatedByRoleId) REFERENCES Roles(roleId)
    -- NOTE: queueOrganizationUniqueId FK deliberately NOT declared inline here —
    -- QueueOrganization is created LATER in this schema (slice 20_queue), so an inline
    -- FK would fail a fresh run with ER_FK_CANNOT_OPEN_PARENT (1824). The FK is
    -- added idempotently AFTER the schema by ensureQueueOrgReferences()
    -- (Services/Database/tableManage.service.js) once QueueOrganization exists.
);`;
