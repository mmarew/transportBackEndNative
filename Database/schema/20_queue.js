"use strict";

// queue
// Tables: QueueOrganization, QueueOrganizationMembership, DriverQueue, QueueAuditLog
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 2157-2332). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `

-- QueueOrganization: a client that needs fixed-price freight and hosts a virtual
-- dispatch queue (e.g. Mojo Kaliy customs, Diredawa customs, National Cement).
-- A queue only exists for a registered queue organization (record must exist first).
-- latitude/longitude is the site reference / order pickup point, NOT a check-in gate.

CREATE TABLE IF NOT EXISTS QueueOrganization (
    queueOrganizationId INT AUTO_INCREMENT PRIMARY KEY,
    queueOrganizationUniqueId VARCHAR(36) UNIQUE NOT NULL,       -- UUID
    queueOrganizationName VARCHAR(255) NOT NULL,                 -- "Mojo Kaliy", "National Cement", ...
    queueOrganizationType ENUM('customs','factory','cement','depot','mine','farm','port','other') NOT NULL,
    queueOrganizationPhone VARCHAR(20) NULL,
    queueOrganizationAddress VARCHAR(500) NULL,
    latitude DECIMAL(10, 8) NULL,                                -- site reference / order pickup point (NOT a check-in gate)
    longitude DECIMAL(11, 8) NULL,
    -- max distance (km) a driver can be from the org's lat/lng to check in.
    -- NOT NULL, default 15 km. A value of 0 (or missing coords) disables the check.
    -- Validated by Haversine formula in validateCheckinDistance(). Manual admin
    -- checkins (manualCheckin) skip this distance check.
    checkinRadiusKm INT NOT NULL DEFAULT 15,
    approvalStatus ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
    approvalReason VARCHAR(500) NULL,                            -- Admin note when approving or rejecting
    queueEnabled BOOLEAN NOT NULL DEFAULT FALSE,                 -- opts into queue dispatch
    approvedBy VARCHAR(36) NULL,                                 -- Admin who approved/rejected
    approvedAt DATETIME NULL,
    queueOrganizationCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    queueOrganizationCreatedBy VARCHAR(36) NOT NULL,
    queueOrganizationUpdatedAt DATETIME NULL,
    queueOrganizationUpdatedBy VARCHAR(36) NULL,
    queueOrganizationDeletedAt DATETIME NULL,
    queueOrganizationDeletedBy VARCHAR(36) NULL,
    isDeleted BOOLEAN NOT NULL DEFAULT FALSE,
    INDEX idx_queueOrg_type (queueOrganizationType),
    INDEX idx_queueOrg_approvalStatus (approvalStatus),
    INDEX idx_queueOrg_isDeleted (isDeleted),
    FOREIGN KEY (queueOrganizationCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (queueOrganizationUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (queueOrganizationDeletedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (approvedBy) REFERENCES Users(userUniqueId)
);

-- ShipperRequestBatch.queueOrganizationUniqueId — canonical queue ref (DRY), defined in
-- the ShipperRequestBatch CREATE TABLE above (fresh databases get it there). ShipperRequest
-- rows inherit it via LEFT JOIN on batchUniqueId. The INDEX + FK are NOT declared here
-- because: (a) QueueOrganization is created AFTER ShipperRequestBatch in this file,
-- and (b) an ALTER here breaks re-running the schema on an existing database
-- (ER_KEY_COLUMN_DOES_NOT_EXITS / duplicate index+FK). They are added idempotently
-- by ensureQueueOrgReferences() in Services/Database/tableManage.service.js, which
-- runs after this schema inside createTable() and checks information_schema.
-- The legacy per-row ShipperRequest.queueOrganizationUniqueId column is intentionally
-- dropped (see Task 1 migration); ensureQueueOrgReferences() drops it defensively.

-- QueueOrganizationMembership: Links users (QueueOrgAdmin role 11, QueueDispatcher role 12)
-- to a QueueOrganization, mirroring TransportCompany/CompanyMembership.
-- One user can have one active membership per queue organization.

CREATE TABLE IF NOT EXISTS QueueOrganizationMembership (
    queueOrganizationMembershipId INT AUTO_INCREMENT PRIMARY KEY,
    queueOrganizationMembershipUniqueId VARCHAR(36) UNIQUE NOT NULL,
    queueOrganizationUniqueId VARCHAR(36) NOT NULL,             -- FK → QueueOrganization
    userUniqueId VARCHAR(36) NOT NULL,                          -- FK → Users (QueueOrgAdmin / QueueDispatcher of the org)
    roleId INT NOT NULL,                                        -- FK → Roles (11 = queueOrgAdmin, 12 = queueDispatcher)
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    membershipStartDate DATETIME NOT NULL,
    membershipEndDate DATETIME NULL,
    membershipCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    membershipCreatedBy VARCHAR(36) NOT NULL,
    membershipUpdatedAt DATETIME NULL,
    membershipUpdatedBy VARCHAR(36) NULL,
    membershipDeletedAt DATETIME NULL,
    membershipDeletedBy VARCHAR(36) NULL,
    UNIQUE KEY uq_queueOrg_user (queueOrganizationUniqueId, userUniqueId),  -- One active membership per user per queue org
    INDEX idx_queueOrgMembership_org (queueOrganizationUniqueId),
    INDEX idx_queueOrgMembership_user (userUniqueId),
    INDEX idx_queueOrgMembership_role (roleId),
    FOREIGN KEY (queueOrganizationUniqueId) REFERENCES QueueOrganization(queueOrganizationUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (roleId) REFERENCES Roles(roleId),
    FOREIGN KEY (membershipCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (membershipUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (membershipDeletedBy) REFERENCES Users(userUniqueId)
);

-- DriverQueue: the virtual waiting line for a queue organization's drivers.
-- queueNumber is issued per (queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId)
-- and (with joinedAt) is the server-stamped dispatch order / dispute truth.
-- Driver/vehicle type are NOT stored here: driver via VehicleDriver.driverUserUniqueId,
-- type via VehicleDriver.vehicleUniqueId → Vehicle.vehicleTypeUniqueId.
-- shipperRequestUniqueId links the order assigned to this entry (same record type
-- as takeFromStreet / call-in orders, continuing the JourneyDecision → Journey lifecycle).
--
-- NOTE on re-check-in: each re-check-in SOFT-DELETES the previous entry for the same
-- (vehicle, org, day) and inserts a BRAND-NEW row with a fresh queueUniqueId + fresh
-- queueNumber (back of line). There is intentionally NO unique key on
-- (vehicleDriverUniqueId, queueOrganizationUniqueId, queueDate) — multiple rows per
-- vehicle/org/day are allowed so that every check-in produces new, unique data. The
-- "current" entry is always the one with queueDeletedAt IS NULL; superseded rows are
-- retained as history (status holds the terminal journeyStatusMap id; audit via
-- DriverQueueHistory keyed by queueUniqueId).

CREATE TABLE IF NOT EXISTS DriverQueue (
    queueId INT AUTO_INCREMENT PRIMARY KEY,
    queueUniqueId VARCHAR(36) UNIQUE NOT NULL,
    queueOrganizationUniqueId VARCHAR(36) NOT NULL,             -- FK → QueueOrganization
    queueDate DATE NOT NULL,                                    -- daily reset
    queueNumber INT NOT NULL,                                   -- 1,2,3… per (org, date, vehicleTypeUniqueId)
    queueRefusalCount INT NOT NULL DEFAULT 0,                   -- consecutive front-position refusals today; at QUEUE_REFUSAL_LIMIT → move to back
    vehicleDriverUniqueId VARCHAR(36) NOT NULL,                 -- FK → VehicleDriver (truck+driver unit in line)
    shipperRequestUniqueId VARCHAR(36) NULL,                    -- FK → ShipperRequest (order assigned to this entry)
    -- FK → Users: shipper phone target. When set, this queue position is
    -- reserved exclusively for orders from this shipper. Set by driver check-in
    -- (shipperPhoneNumber param) or admin manual check-in. Cleared when the
    -- driver checks out or is removed. Prevents dispatch of orders from other
    -- shippers while the driver is in the queue. Tracked in DriverQueueHistory.

    targetedShipperUserUUID VARCHAR(36) NULL DEFAULT NULL,
    
    -- Driver's GPS coordinates at check-in time. Used for proximity audit when
    -- checkinRadiusKm is set on the queue organization. Not updated after
    -- check-in — serves as the "where was the driver when they checked in" record.
    driverLatitude DECIMAL(10, 8) NULL,
    driverLongitude DECIMAL(11, 8) NULL,
    joinedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,       -- server-stamped check-in; dispute truth
    status INT NOT NULL DEFAULT 1, -- journeyStatusMap id (1=waiting, 2=requested, 3=acceptedByDriver, 5/6/7 loading stages, 8=journeyStarted, 9=journeyCompleted, 10=cancelledByShipper, 12=cancelledByDriver, 13=cancelledByAdmin, 16=noAnswerFromDriver, 18=rejectedByDriver)
    requestedAt DATETIME NULL,
    agreedAt DATETIME NULL,
    -- Yard entrance number, write-once when the entry flips to AGREED (driver
    -- accepted the order): ONE continuous sequence 1,2,3… per (org, date) —
    -- the first shipper's trucks take 1,2,3, the next shipper's continue
    -- 4,5,6,7. The shipper of the lowest live number is the serving shipper;
    -- their trucks enter in number order. Read THIS column directly — no
    -- per-read recomputation/filtering. NULL while only waiting/reserved.
    loadingOrderNumber INT NULL DEFAULT NULL,
    queueCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    queueCreatedBy VARCHAR(36) NOT NULL,
    queueUpdatedAt DATETIME NULL,
    queueUpdatedBy VARCHAR(36) NULL,
    queueDeletedAt DATETIME NULL,
    queueDeletedBy VARCHAR(36) NULL,
    INDEX idx_queue_org_date_number (queueOrganizationUniqueId, queueDate, queueNumber),
    INDEX idx_queue_vehicle_org_date (vehicleDriverUniqueId, queueOrganizationUniqueId, queueDate),
    INDEX idx_queue_status (status),
    INDEX idx_queue_vehicle (vehicleDriverUniqueId),
    INDEX idx_queue_shipperRequest (shipperRequestUniqueId),
    INDEX idx_queue_targeted_shipper (targetedShipperUserUUID),
    INDEX idx_queue_loading_order (queueOrganizationUniqueId, queueDate, loadingOrderNumber),
    FOREIGN KEY (queueOrganizationUniqueId) REFERENCES QueueOrganization(queueOrganizationUniqueId),
    FOREIGN KEY (vehicleDriverUniqueId) REFERENCES VehicleDriver(vehicleDriverUniqueId),
    FOREIGN KEY (shipperRequestUniqueId) REFERENCES ShipperRequest(shipperRequestUniqueId),
    FOREIGN KEY (targetedShipperUserUUID) REFERENCES Users(userUniqueId),
    FOREIGN KEY (queueCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (queueUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (queueDeletedBy) REFERENCES Users(userUniqueId)
);

-- QueueAuditLog: immutable audit trail for queue supervisor overrides and removals.
-- Every reorder/removal/forced checkout is logged with actor + reason so position
-- disputes can be traced back to who changed what and when.

CREATE TABLE IF NOT EXISTS QueueAuditLog (
    queueAuditId INT AUTO_INCREMENT PRIMARY KEY,
    queueAuditUniqueId VARCHAR(36) UNIQUE NOT NULL,
    queueOrganizationUniqueId VARCHAR(36) NOT NULL,             -- FK → QueueOrganization
    queueDate DATE NOT NULL,                                    -- which day's queue was changed
    queueUniqueId VARCHAR(36) NULL,                             -- FK → DriverQueue (entry affected)
    action ENUM('override','remove','manual_checkin','dispatch') NOT NULL,
    beforeValue VARCHAR(500) NULL,                              -- JSON snapshot before the change
    afterValue VARCHAR(500) NULL,                               -- JSON snapshot after the change
    reason VARCHAR(500) NULL,                                   -- supervisor note
    performedBy VARCHAR(36) NOT NULL,                           -- FK → Users (who did it)
    performedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_queueAudit_org_date (queueOrganizationUniqueId, queueDate),
    INDEX idx_queueAudit_entry (queueUniqueId),
    FOREIGN KEY (queueOrganizationUniqueId) REFERENCES QueueOrganization(queueOrganizationUniqueId),
    FOREIGN KEY (performedBy) REFERENCES Users(userUniqueId)
);`;
