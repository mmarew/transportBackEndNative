"use strict";

const driverQueueHistoryDdl = require("./00_driver_queue_history");

// delivery
// Tables: DeliveryConfirmations, DeliveryConfirmationPhotos
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 2333-2436). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
//
// The original literal interpolated ${driverQueueHistoryDdl} at this point, so
// this slice requires that module to keep the composed SQL identical.
module.exports = `

-- DriverQueueHistory: immutable SNAPSHOT audit trail for DriverQueue. Each row
-- stores the FULL DriverQueue entry as it was BEFORE one mutation — a literal
-- mirror of every DriverQueue column (equal column number) — plus a
-- historyEvent naming the mutation and audit provenance (performedBy/At).
-- Reconstruct any transition by diffing a snapshot with the next one (or with
-- the live DriverQueue row for the newest event). INSERT events store the
-- just-created row (there is no prior state). See driverQueueHistoryDdl.

${driverQueueHistoryDdl}

-- DeliveryConfirmations: confirms that goods were actually delivered once a
-- journey is completed. One confirmation per journey (UNIQUE on journeyUniqueId).
-- Lifecycle: PENDING (receiver submitted) → CONFIRMED (accepted) | DISPUTED.
-- The receiverUserUniqueId is the party who received the goods;
-- confirmedByUserUniqueId is whoever settled the confirmation (driver/admin/company), and stays NULL while the confirmation is still PENDING.

CREATE TABLE IF NOT EXISTS DeliveryConfirmations (
    deliveryConfirmationId INT AUTO_INCREMENT PRIMARY KEY,
    deliveryConfirmationUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the confirmation

    journeyUniqueId VARCHAR(36) NOT NULL,                      -- FK → Journey (completed journey)
    receiverUserUniqueId VARCHAR(36) NOT NULL,                 -- FK → Users (who received the goods)
    confirmedByUserUniqueId VARCHAR(36) NULL,                  -- FK → Users (who settled it; NULL while PENDING)

    deliveryConfirmationStatus ENUM('PENDING','CONFIRMED','DISPUTED') NOT NULL DEFAULT 'PENDING',
    -- How this confirmation was created:
    --   FORMAL_POD    — traditional driver-uploaded proof with signatures
    --   RECEIPT_AUTO  — driver submitted receipt photos, auto-confirmed immediately
    --   SHIPPER_DIRECT — shipper self-confirmed (Tier B signature, no driver evidence)
    --   AUTO_NO_POD   — auto-confirmed on journey completion (isPodRequired=false)

    deliveryConfirmationSource ENUM('FORMAL_POD','RECEIPT_AUTO','SHIPPER_DIRECT','AUTO_NO_POD','DELINQUENCY_DISPUTE') NOT NULL DEFAULT 'FORMAL_POD',
    deliveryConfirmationDeliveredQuantity DECIMAL(14, 3) NULL, -- Delivered quantity
    deliveryConfirmationQuantityUnit VARCHAR(30) NULL,         -- e.g. 'quintal', 'kg', 'piece'

    deliveryConfirmationCondition ENUM('GOOD','DAMAGED','PARTIAL') NOT NULL DEFAULT 'GOOD',
    deliveryConfirmationDriverSignature TEXT NULL,            -- Tier A: on-road driver signature (file path / URL)
    deliveryConfirmationShipperSignature TEXT NULL,            -- the person who recived goods from driver at destination
    deliveryConfirmationNotes TEXT NULL,                       -- Free-text notes

    deliveryConfirmationLatitude DECIMAL(10, 8) NULL,          -- GPS of the confirmation point
    deliveryConfirmationLongitude DECIMAL(11, 8) NULL,

    deliveryConfirmationSignatureHash VARCHAR(64) NULL,        -- SHA-256, computed ONCE at settle, never recomputed in place
    deliveryConfirmationPreviousHash VARCHAR(64) NULL,         -- prior hash, moved here on admin amendment (audit)
    deliveryConfirmationStatement TEXT NULL,                   -- declaration text displayed at signing time

    deliveryConfirmationSubmittedAt DATETIME NULL,             -- When the receiver submitted
    deliveryConfirmationDriverSignedAt DATETIME NULL,         -- When the on-road driver signature was captured
    deliveryConfirmationConfirmedAt DATETIME NULL,             -- When the confirmation was settled
    deliveryConfirmationShipperSignedAt DATETIME NULL,         -- = deliveryConfirmationConfirmedAt for Tier B

    deliveryConfirmationOtpHash VARCHAR(100) NULL,             -- Tier A: bcrypt hash of the OTP (NOT plain SHA-256 — 6-digit codes are brute-forceable)
    deliveryConfirmationOtpExpiresAt DATETIME NULL,            -- Tier A: short expiry (5–10 min)
    deliveryConfirmationOtpAttempts INT NOT NULL DEFAULT 0,    -- Tier A: max 3–5 attempts, then invalidate
    deliveryConfirmationOtpVerifiedAt DATETIME NULL,           -- Tier A: set when the OTP was verified
    deliveryConfirmationOtpRequestCount INT NOT NULL DEFAULT 0,-- Tier A: requests in the current hourly window
    deliveryConfirmationOtpWindowStartAt DATETIME NULL,        -- Tier A: start of the hourly request window

    deliveryConfirmationCreatedBy VARCHAR(36) NOT NULL,        -- FK → Users (who created the record)
    deliveryConfirmationUpdatedBy VARCHAR(36) NULL,            -- FK → Users
    deliveryConfirmationDeletedBy VARCHAR(36) NULL,            -- FK → Users
    deliveryConfirmationCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deliveryConfirmationUpdatedAt DATETIME NULL,
    deliveryConfirmationDeletedAt DATETIME NULL,

    -- Per-journey uniqueness must be LIVE-ONLY: a soft-deleted confirmation
    -- (deletedAt set) yields NULL here so the journey can receive a fresh one,
    -- while a live confirmation (deletedAt NULL) stays unique per journey.
    liveJourneyKey VARCHAR(36)
        GENERATED ALWAYS AS (IF(deliveryConfirmationDeletedAt IS NULL, journeyUniqueId, NULL)) STORED,

    UNIQUE KEY uq_deliveryConfirmation_live_journey (liveJourneyKey),
    -- Plain (non-unique) index backing the journeyUniqueId FK so the live-only
    -- key above is not tied to the foreign key and can be freely managed.
    INDEX idx_deliveryConfirmation_journey (journeyUniqueId),
    INDEX idx_deliveryConfirmation_receiver (receiverUserUniqueId),
    INDEX idx_deliveryConfirmation_status (deliveryConfirmationStatus),
    FOREIGN KEY (journeyUniqueId) REFERENCES Journey(journeyUniqueId),
    FOREIGN KEY (receiverUserUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (confirmedByUserUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (deliveryConfirmationCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (deliveryConfirmationUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (deliveryConfirmationDeletedBy) REFERENCES Users(userUniqueId)
);

-- DeliveryConfirmationPhotos: the proof-of-delivery photo set for a confirmation.
-- The parent DeliveryConfirmations.deliveryConfirmationPhotoUrl stores the FIRST
-- photo (primary/cover) for backward compatibility; this table holds the full set.
-- Photos are evidence: rows are append-only in normal operation (soft delete only).


CREATE TABLE IF NOT EXISTS DeliveryConfirmationPhotos (
    deliveryConfirmationPhotoId INT AUTO_INCREMENT PRIMARY KEY,
    deliveryConfirmationPhotoUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID
    deliveryConfirmationUniqueId VARCHAR(36) NOT NULL,               -- FK → DeliveryConfirmations
    deliveryConfirmationPhotoUrl VARCHAR(500) NOT NULL,              -- relative /uploads/... path
    deliveryConfirmationPhotoCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deliveryConfirmationPhotoDeletedBy VARCHAR(36) NULL,             -- FK → Users
    deliveryConfirmationPhotoDeletedAt DATETIME NULL,
    INDEX idx_dcPhoto_confirmation (deliveryConfirmationUniqueId),
    FOREIGN KEY (deliveryConfirmationUniqueId) REFERENCES DeliveryConfirmations(deliveryConfirmationUniqueId)
);`;
