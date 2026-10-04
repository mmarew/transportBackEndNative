"use strict";

// driver bid
// Tables: DriverBid
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 2090-2156). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `

-- DriverBid: individual drivers bidding on a bidding-board order.
--
-- Flow (inverse of the FIFO queue: bidding is demand-pull, not FIFO-push):
--   1. A queue order lives on the open bidding board when its own
--      ShipperRequest.isBiddingApproved = TRUE (per-order, flag-only; the order keeps
--      its normal journeyStatusId — there is no special 'bidding' status).
--   2. A shipper / SuperAdmin opens the board for specific order rows (approveBidding)
--      → distance matching (findNearbyDrivers/findNearbyShippers) surfaces them to
--      eligible drivers.
--   3. Eligible drivers place a bid here (one bid per driver per order → UNIQUE below).
--   4. Shipper selects a winning driver → bidStatus = 'selected'; the existing
--      acceptDriverOffer flow finalizes the journey; others → 'not_selected'.
--
-- Kept separate from CompanyBidRequest because bidding is per-SHIPPER-REQUEST (one
-- order/slot) by INDIVIDUAL drivers, whereas company bidding is per-BATCH by a company.
CREATE TABLE IF NOT EXISTS DriverBid (
    driverBidId INT AUTO_INCREMENT PRIMARY KEY,
    driverBidUniqueId VARCHAR(36) UNIQUE NOT NULL,

    -- The queue order (one individual ShipperRequest slot) being bid on.
    shipperRequestUniqueId VARCHAR(36) NOT NULL,               -- FK → ShipperRequest
    shipperRequestBatchUniqueId VARCHAR(36) NOT NULL,          -- FK → ShipperRequestBatch (its bidding batch)

    -- Who is bidding
    driverUserUniqueId VARCHAR(36) NOT NULL,                   -- FK → Users (the driver)
    driverRequestUniqueId VARCHAR(36) NOT NULL,                -- FK → DriverRequest (driver's request for this order)

    -- Bid terms
    bidAmount DECIMAL(10,2) NOT NULL,                          -- Driver's counter price
    bidNotes TEXT NULL,                                        -- Optional message to shipper

    -- Bid lifecycle (relation between driver and shipper for this order)
    bidStatus ENUM(
        'submitted',           -- Driver placed a bid; waiting for shipper
        'selected',            -- Shipper chose this driver
        'not_selected',        -- Shipper chose another driver
        'withdrawn',           -- Driver pulled their bid before decision
        'expired'              -- Bidding closed without selection
    ) NOT NULL DEFAULT 'submitted',
    bidStatusUpdatedAt DATETIME NULL,
    bidStatusUpdatedBy VARCHAR(36) NULL,

    -- The queue order's journey status at bid time (ordinary lifecycle — no 'bidding' status)
    journeyStatusId INT NOT NULL,                              -- FK → JourneyStatus

    driverBidCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    driverBidCreatedBy VARCHAR(36) NOT NULL,                   -- FK → Users
    driverBidUpdatedAt DATETIME NULL,
    driverBidUpdatedBy VARCHAR(36) NULL,
    driverBidDeletedAt DATETIME NULL,
    driverBidDeletedBy VARCHAR(36) NULL,

    UNIQUE KEY uq_driver_order_bid (driverUserUniqueId, shipperRequestUniqueId), -- One bid per driver per order
    INDEX idx_driverBid_order (shipperRequestUniqueId),
    INDEX idx_driverBid_batch (shipperRequestBatchUniqueId),
    INDEX idx_driverBid_driver (driverUserUniqueId),
    INDEX idx_driverBid_status (bidStatus),
    FOREIGN KEY (shipperRequestUniqueId) REFERENCES ShipperRequest(shipperRequestUniqueId),
    FOREIGN KEY (shipperRequestBatchUniqueId) REFERENCES ShipperRequestBatch(batchUniqueId),
    FOREIGN KEY (driverUserUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (driverRequestUniqueId) REFERENCES DriverRequest(driverRequestUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId),
    FOREIGN KEY (driverBidCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (driverBidUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (driverBidDeletedBy) REFERENCES Users(userUniqueId)
);`;
