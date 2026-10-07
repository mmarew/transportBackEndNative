"use strict";

// company bidding
// Tables: CompanyBidRequest, CompanyBidVehicleAssignment, CompanyCommission, CompanyDelinquency, CompanyDelinquencyResponse, AdminDecisionOnDelinquency, CompanyBanDelinquency, CompanyProfileHistory, CompanyRating
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 1709-2089). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `


-- CompanyBidRequest: A company's bid on a shipper's batch request.
-- When requestMode = 'company_target', only the targeted company can see and bid.
-- No partial bids: numberOfVehiclesOffered MUST equal the shipper's batch size.
-- One company submits one bid per batch (UNIQUE on companyUniqueId + shipperRequestBatchUniqueId).
-- Commission for company bids is tracked in CompanyCommission (not the per-journey Commission table).

CREATE TABLE IF NOT EXISTS CompanyBidRequest (
    companyBidRequestId INT AUTO_INCREMENT PRIMARY KEY,
    companyBidRequestUniqueId VARCHAR(36) UNIQUE NOT NULL,

    -- The shipper's batch being bid on (links to ShipperRequest.shipperRequestBatchUniqueId)
    shipperRequestBatchUniqueId VARCHAR(36) NOT NULL,

    -- Who is bidding
    companyUniqueId VARCHAR(36) NOT NULL,                  -- FK → TransportCompany
    bidSubmittedByUserUniqueId VARCHAR(36) NOT NULL,       -- Manager or dispatcher who submitted

    -- Bid terms — must match full batch (no partial bids)
    numberOfVehiclesOffered INT NOT NULL,                  -- Must equal shipper's numberOfVehicles
    vehicleTypeUniqueId VARCHAR(36) NOT NULL,              -- Type of vehicles being offered
    proposedCostPerVehicle DECIMAL(10,2) NULL,             -- Negotiated price per vehicle
    proposedTotalCost DECIMAL(10,2) NULL,                  -- Total cost for all vehicles
    proposedShippingDate DATETIME NULL,
    proposedDeliveryDate DATETIME NULL,
    bidNotes TEXT NULL,                                    -- Optional message from company to shipper

    -- Bid lifecycle status which is relation between company and shipper
    bidStatus ENUM(
        'submitted',           -- Company submitted; waiting for shipper
        'accepted_by_shipper', -- Shipper accepted; dispatcher must now assign vehicles
        'rejected_by_shipper', -- Shipper rejected this bid
        'cancelled_by_company',-- Company withdrew before shipper decided
        'expired',             -- Bid expired without action
        'completed'            -- Every slot in the batch has been delivered
    ) NOT NULL DEFAULT 'submitted',
    bidStatusUpdatedAt DATETIME NULL,
    bidStatusUpdatedBy VARCHAR(36) NULL,

    -- Cancellation acknowledgement (mirrors DriverRequest.isCancellationByShipperSeenByDriver)
    -- NULL  = no cancellation occurred
    -- 'not seen by company yet' = batch was cancelled; company has not acknowledged
    -- 'seen by company'         = company tapped/polled and acknowledged the cancellation
    isCancellationSeenByCompany ENUM('not seen by company yet', 'seen by company') NULL DEFAULT NULL,

    -- Journey linkage
    journeyStatusId INT NOT NULL,                          -- FK → JourneyStatus (starts at 'waiting')

    companyBidRequestCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    companyBidRequestCreatedBy VARCHAR(36) NOT NULL,
    companyBidRequestUpdatedAt DATETIME NULL,
    companyBidRequestUpdatedBy VARCHAR(36) NULL,
    companyBidRequestDeletedAt DATETIME NULL,
    companyBidRequestDeletedBy VARCHAR(36) NULL,

    UNIQUE KEY uq_company_batch_bid (companyUniqueId, shipperRequestBatchUniqueId),  -- One bid per company per batch
    INDEX idx_companyBid_batchId (shipperRequestBatchUniqueId),
    INDEX idx_companyBid_company (companyUniqueId),
    INDEX idx_companyBid_status (bidStatus),
    FOREIGN KEY (companyUniqueId) REFERENCES TransportCompany(companyUniqueId),
    FOREIGN KEY (bidSubmittedByUserUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (vehicleTypeUniqueId) REFERENCES VehicleTypes(vehicleTypeUniqueId),
    FOREIGN KEY (journeyStatusId) REFERENCES JourneyStatus(journeyStatusId),
    FOREIGN KEY (companyBidRequestCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyBidRequestUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyBidRequestDeletedBy) REFERENCES Users(userUniqueId)
);


-- CompanyBidVehicleAssignment: After shipper accepts a company bid, the dispatcher
-- assigns specific vehicles and their drivers — one row per ShipperRequest slot.
-- Each row maps: one ShipperRequest row ↔ one Vehicle ↔ one Driver.
--
-- DriverRequest creation sequence (IMPORTANT):
--   JourneyDecisions.driverRequestId is NOT NULL, so a DriverRequest record MUST exist
--   before a JourneyDecision can be created. In the company flow this works as follows:
--
--   Step 1 — Dispatcher assigns driver:
--     → System auto-creates a DriverRequest row on behalf of the assigned driver
--       (origin/status copied from the linked ShipperRequest; journeyStatusId = acceptedByDriver)
--     → driverRequestUniqueId is stored in this table immediately
--
--   Step 2 — Driver confirms assignment (assignmentStatus → confirmed_by_driver):
--     → System creates JourneyDecision using shipperRequestId + driverRequestId
--     → journeyDecisionUniqueId is then stored in this table
--
--   Step 3 — Driver leaves the job (rejects, cancels post-confirm, or is recalled):
--     → The old assignment row goes terminal (rejected_by_driver / cancelled_by_driver
--       / cancelled_by_company) and the DriverRequest keeps its old JourneyDecision
--       as history — JourneyDecisions.driverRequestId is UNIQUE, so the old
--       driverRequestUniqueId can never hold a second decision (a fresh DriverRequest
--       is inserted instead: Services/CompanyAssignment/assignmentHelper/driver-request.service.js,
--       driverRequestMustStartFresh).
--     → Dispatchers replace a LIVE row atomically via
--       POST /api/company/assignments/:assignmentUniqueId/replace:
--       old row → cancelled_by_company, new row → 'reassigned',
--       replaced driver freed, old truck pulled to inactive in the same transaction.
--     → A pulled truck re-enters the pool only through the manual
--       PATCH /api/company/fleet/:companyVehicleUniqueId (assignmentStatus: active).

CREATE TABLE IF NOT EXISTS CompanyBidVehicleAssignment (
    assignmentId INT AUTO_INCREMENT PRIMARY KEY,
    assignmentUniqueId VARCHAR(36) UNIQUE NOT NULL,

    -- Links back to the company bid and the specific ShipperRequest slot
    companyBidRequestUniqueId VARCHAR(36) NOT NULL,        -- FK → CompanyBidRequest
    shipperRequestUniqueId VARCHAR(36) NOT NULL,         -- FK → ShipperRequest (one row in the batch)

    -- The assigned vehicle and driver
    vehicleUniqueId VARCHAR(36) NOT NULL,                  -- FK → Vehicle
    driverUserUniqueId VARCHAR(36) NOT NULL,               -- FK → Users (driver must be a company member)

    -- Auto-created by the system when a driver is assigned (Step 1 above).
    -- Stored here so JourneyDecisions can be created using it (Step 2 above).
    -- NULL only briefly before the DriverRequest insert completes (same transaction).
    driverRequestUniqueId VARCHAR(36) NULL,                -- FK → DriverRequest

    -- Assignment lifecycle
    assignmentStatus ENUM(
        'assigned',            -- Dispatcher assigned; DriverRequest created; waiting for driver to confirm
        'confirmed_by_driver', -- Driver confirmed; JourneyDecision advanced to status 4
        'going_to_loading',    -- Driver heading to the loading point (PATCH /assignments/:id/status)
        'journey_started',     -- Cargo loaded, driver en route (PATCH /assignments/:id/status)
        'rejected_by_driver',  -- Driver refused BEFORE confirming; dispatcher must reassign
        'cancelled_by_driver', -- Driver cancelled AFTER confirming (mid-job cancellation)
        'reassigned',          -- Replacement row after a rejection
        'cancelled_by_company',  -- Dispatcher/company cancelled the assignment
        'cancelled_by_shipper',  -- Shipper cancelled the request
        'completed'            -- Journey completed successfully
    ) NOT NULL DEFAULT 'assigned',

    -- Populated in Step 2 after driver confirms
    journeyDecisionUniqueId VARCHAR(36) NULL,              -- FK → JourneyDecisions

    assignmentCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assignmentCreatedBy VARCHAR(36) NOT NULL,
    assignmentUpdatedAt DATETIME NULL,
    assignmentUpdatedBy VARCHAR(36) NULL,
    assignmentDeletedAt DATETIME NULL,
    assignmentDeletedBy VARCHAR(36) NULL,

    INDEX idx_assignment_bid (companyBidRequestUniqueId),
    INDEX idx_assignment_driver (driverUserUniqueId),
    INDEX idx_assignment_vehicle (vehicleUniqueId),
    INDEX idx_assignment_status (assignmentStatus),
    FOREIGN KEY (companyBidRequestUniqueId) REFERENCES CompanyBidRequest(companyBidRequestUniqueId),
    FOREIGN KEY (shipperRequestUniqueId) REFERENCES ShipperRequest(shipperRequestUniqueId),
    FOREIGN KEY (vehicleUniqueId) REFERENCES Vehicle(vehicleUniqueId),
    FOREIGN KEY (driverUserUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (driverRequestUniqueId) REFERENCES DriverRequest(driverRequestUniqueId),
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (assignmentCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (assignmentUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (assignmentDeletedBy) REFERENCES Users(userUniqueId)
);


-- CompanyCommission: Commission charged to a TransportCompany per accepted bid.
-- This is SEPARATE from the per-journey Commission table (which tracks individual driver commissions).
-- Company commission is calculated at the bid level, not per individual journey.
-- Applies when bidStatus = 'accepted_by_shipper' in CompanyBidRequest.

CREATE TABLE IF NOT EXISTS CompanyCommission (
    companyCommissionId INT AUTO_INCREMENT PRIMARY KEY,
    companyCommissionUniqueId VARCHAR(36) UNIQUE NOT NULL,

    companyBidRequestUniqueId VARCHAR(36) NOT NULL,        -- FK → CompanyBidRequest (one commission per bid)
    companyUniqueId VARCHAR(36) NOT NULL,                  -- FK → TransportCompany (denormalized for easy query)
    commissionRateUniqueId VARCHAR(36) NOT NULL,           -- FK → CommissionRates (rate used at time of bid)

    -- Calculated amounts
    baseTotalCost DECIMAL(10,2) NOT NULL,                  -- proposedTotalCost from the winning bid
    commissionRate DECIMAL(5,2) NOT NULL,                  -- Rate snapshot (in %) at time of calculation
    commissionAmount DECIMAL(10,2) NOT NULL,               -- baseTotalCost * commissionRate / 100

    -- Payment status (reuses CommissionStatus table for consistency)
    commissionStatusUniqueId VARCHAR(36) NOT NULL,         -- FK → CommissionStatus

    -- Optional: reference to a company-level payment if paid via the system
    paymentReference VARCHAR(255) NULL,                    -- External payment ref (bank transfer, Telebirr, etc.)
    paidAt DATETIME NULL,                                  -- When commission was paid
    paidBy VARCHAR(36) NULL,                               -- Admin who confirmed payment

    companyCommissionCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    companyCommissionCreatedBy VARCHAR(36) NOT NULL,
    companyCommissionUpdatedAt DATETIME NULL,
    companyCommissionUpdatedBy VARCHAR(36) NULL,
    companyCommissionDeletedAt DATETIME NULL,
    companyCommissionDeletedBy VARCHAR(36) NULL,

    UNIQUE KEY uq_company_commission_bid (companyBidRequestUniqueId),  -- One commission record per bid
    INDEX idx_companyCommission_company (companyUniqueId),
    INDEX idx_companyCommission_status (commissionStatusUniqueId),
    FOREIGN KEY (companyBidRequestUniqueId) REFERENCES CompanyBidRequest(companyBidRequestUniqueId),
    FOREIGN KEY (companyUniqueId) REFERENCES TransportCompany(companyUniqueId),
    FOREIGN KEY (commissionRateUniqueId) REFERENCES CommissionRates(commissionRateUniqueId),
    FOREIGN KEY (commissionStatusUniqueId) REFERENCES CommissionStatus(commissionStatusUniqueId),
    FOREIGN KEY (paidBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyCommissionCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyCommissionUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyCommissionDeletedBy) REFERENCES Users(userUniqueId)
);


-- CompanyDelinquency: audit trail of rule violations by transport companies.
-- Mirrors UserDelinquency but uses companyUniqueId since companies are not users.
-- Placed at end of schema because it references CompanyBidRequest (created above).

CREATE TABLE IF NOT EXISTS CompanyDelinquency ( 

    companyDelinquencyId INT AUTO_INCREMENT PRIMARY KEY,
    companyDelinquencyUniqueId VARCHAR(36) UNIQUE NOT NULL,

    companyUniqueId VARCHAR(36) NOT NULL,                   -- FK → TransportCompany
    delinquencyTypeUniqueId VARCHAR(36) NOT NULL,           -- FK → DelinquencyTypes
    delinquencyDescription TEXT NOT NULL,
    delinquencySeverity ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',

    delinquencyPoints INT NOT NULL DEFAULT 1,
    journeyDecisionUniqueId VARCHAR(36) NULL,               -- Optional: identifies the specific DRIVER's journey leg within a bid
    companyBidRequestUniqueId VARCHAR(36) NULL,             -- Optional: links to the entire freight bid/contract
    delinquencyCreatedBy VARCHAR(36) NOT NULL,              -- Admin or 'system' UUID
    delinquencyCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responseDeadline DATETIME NULL,                         -- Auto-set based on severity: CRITICAL=1d, HIGH=3d, MEDIUM=5d, LOW=7d
    delinquencyDeletedAt DATETIME NULL,                     -- Soft-delete timestamp (set on EXONERATED)
    delinquencyDeletedBy VARCHAR(36) NULL,                  -- Admin who cleared the delinquency

    INDEX idx_company_delinquency_company (companyUniqueId),
    INDEX idx_company_delinquency_type (delinquencyTypeUniqueId),
    FOREIGN KEY (companyUniqueId) REFERENCES TransportCompany(companyUniqueId),
    FOREIGN KEY (delinquencyTypeUniqueId) REFERENCES DelinquencyTypes(delinquencyTypeUniqueId),
    FOREIGN KEY (delinquencyCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (delinquencyDeletedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyBidRequestUniqueId) REFERENCES CompanyBidRequest(companyBidRequestUniqueId)
);


-- CompanyDelinquencyResponse: a company's formal defense against a delinquency accusation.
--
-- LIFECYCLE:
--   1. A delinquency record is created against a company (CompanyDelinquency).
--   2. The company MAY submit a written response to dispute the accusation.
--      Submitting a response is optional — the admin can still issue a ruling
--      even if the company does not respond.
--   3. The admin reviews the delinquency (and the response, if one exists)
--      and issues a formal decision via AdminDecisionOnDelinquency.
--      Possible outcomes: EXONERATED, UPHELD, REDUCED, or DISMISSED.
--   4. If the company fails to respond, the admin may proceed to ban
--      or apply other penalties at their discretion.

CREATE TABLE IF NOT EXISTS CompanyDelinquencyResponse ( 

    companyDelinquencyResponseId INT AUTO_INCREMENT PRIMARY KEY,
    companyDelinquencyResponseUniqueId VARCHAR(36) UNIQUE NOT NULL,

    companyDelinquencyUniqueId VARCHAR(36) NOT NULL,
    companyDelinquencyResponse TEXT NOT NULL,
    isLateResponse BOOLEAN NOT NULL DEFAULT FALSE,          -- TRUE if submitted after the responseDeadline

    companyDelinquencyResponseCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    companyDelinquencyResponseUpdatedAt DATETIME NULL,
    companyDelinquencyResponseDeletedAt DATETIME NULL,
    
    companyDelinquencyResponseCreatedBy VARCHAR(36) NOT NULL,
    companyDelinquencyResponseUpdatedBy VARCHAR(36) NULL,
    companyDelinquencyResponseDeletedBy VARCHAR(36) NULL,

    FOREIGN KEY (companyDelinquencyUniqueId) REFERENCES CompanyDelinquency(companyDelinquencyUniqueId),
    FOREIGN KEY (companyDelinquencyResponseCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyDelinquencyResponseUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyDelinquencyResponseDeletedBy) REFERENCES Users(userUniqueId),
    INDEX idx_company_delinquency_response_company (companyDelinquencyUniqueId)
);   



-- AdminDecisionOnDelinquency: admin's formal ruling on a company delinquency dispute.
-- Created after the company submits a CompanyDelinquencyResponse (or admin acts without one).
-- decisionOutcome determines what happens to the delinquency record:
--   EXONERATED → company is cleared; accusation was wrong, delinquency removed
--   UPHELD     → accusation stands; defense failed, ban may be issued
--   REDUCED    → partial mitigation; admin reduces the delinquency points
--   DISMISSED  → case closed; no further action needed


CREATE TABLE IF NOT EXISTS AdminDecisionOnDelinquency (

    adminDecisionOnDelinquencyId        INT AUTO_INCREMENT PRIMARY KEY,
    adminDecisionOnDelinquencyUniqueId  VARCHAR(36) UNIQUE NOT NULL,

    companyDelinquencyUniqueId          VARCHAR(36) NOT NULL,   -- FK → CompanyDelinquency (required)
    companyDelinquencyResponseUniqueId  VARCHAR(36) NULL,       -- FK → CompanyDelinquencyResponse (NULL if admin decides without a response)

    decisionOutcome ENUM('EXONERATED','UPHELD','REDUCED','DISMISSED') NOT NULL,
    adminDecisionText TEXT NOT NULL,         -- written reason / notes from admin
    delinquencyPointsAfter INT NULL,         -- only set when decisionOutcome = 'REDUCED'

    adminDecisionOnDelinquencyCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    adminDecisionOnDelinquencyUpdatedAt DATETIME NULL,
    adminDecisionOnDelinquencyDeletedAt DATETIME NULL,
    adminDecisionOnDelinquencyCreatedBy VARCHAR(36) NOT NULL,   -- FK → Users (admin)
    adminDecisionOnDelinquencyUpdatedBy VARCHAR(36) NULL,
    adminDecisionOnDelinquencyDeletedBy VARCHAR(36) NULL,

    FOREIGN KEY (companyDelinquencyUniqueId)         REFERENCES CompanyDelinquency(companyDelinquencyUniqueId),
    FOREIGN KEY (companyDelinquencyResponseUniqueId) REFERENCES CompanyDelinquencyResponse(companyDelinquencyResponseUniqueId),
    FOREIGN KEY (adminDecisionOnDelinquencyCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (adminDecisionOnDelinquencyUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (adminDecisionOnDelinquencyDeletedBy) REFERENCES Users(userUniqueId),
    INDEX idx_admin_decision_delinquency (companyDelinquencyUniqueId),
    INDEX idx_admin_decision_response (companyDelinquencyResponseUniqueId)
);


-- CompanyBanDelinquency: junction table linking a single ban to ALL delinquencies
-- that contributed to its issuance.
--
-- PURPOSE:
--   A company may commit more than one delinquency within the same period.
--   The accumulated sum of delinquency points across those records is what
--   triggers the ban. This table preserves the reference from the ban back
--   to every delinquency that contributed, along with each delinquency's
--   point value at the time the ban was issued (pointsAtTime).

CREATE TABLE IF NOT EXISTS CompanyBanDelinquency (
    CompanyBanDelinquencyId INT AUTO_INCREMENT PRIMARY KEY,
    CompanyBanDelinquencyUniqueId VARCHAR(36) UNIQUE NOT NULL,
    companyBanUniqueId VARCHAR(36) NOT NULL,                -- FK → CompanyBan
    companyDelinquencyUniqueId VARCHAR(36) NOT NULL,        -- FK → CompanyDelinquency
    pointsAtTime INT NOT NULL,
    UNIQUE KEY uq_ban_delinquency (companyBanUniqueId, companyDelinquencyUniqueId),
    FOREIGN KEY (companyBanUniqueId) REFERENCES CompanyBan(companyBanUniqueId),
    FOREIGN KEY (companyDelinquencyUniqueId) REFERENCES CompanyDelinquency(companyDelinquencyUniqueId),
    INDEX idx_cbd_ban (companyBanUniqueId),
    INDEX idx_cbd_delinquency (companyDelinquencyUniqueId)
);


-- CompanyProfileHistory: append-only audit log for company profile & status changes.
-- Placed at end of schema because it references TransportCompany (created above).
CREATE TABLE IF NOT EXISTS CompanyProfileHistory (
    historyId INT AUTO_INCREMENT PRIMARY KEY,
    historyUniqueId VARCHAR(36) UNIQUE NOT NULL,
    companyUniqueId VARCHAR(36) NOT NULL,
    changedBy VARCHAR(36) NOT NULL,
    changedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fieldName VARCHAR(100) NOT NULL,
    oldValue TEXT NULL,
    newValue TEXT NULL,
    reason TEXT NULL,
    source ENUM(
        'registration',
        'document_approval',
        'ban',
        'unban',
        'profile_update',
        'manual'
    ) NOT NULL,
    referenceUniqueId VARCHAR(36) NULL,
    FOREIGN KEY (companyUniqueId) REFERENCES TransportCompany(companyUniqueId),
    INDEX idx_cph2_company (companyUniqueId),
    INDEX idx_cph2_field (fieldName),
    INDEX idx_cph2_changed_at (changedAt)
);


-- CompanyRating: Shipper rates a Transport Company after a completed freight job.
-- Placed at end of schema because it references CompanyBidRequest (created above).
CREATE TABLE IF NOT EXISTS CompanyRating (
    companyRatingId INT AUTO_INCREMENT PRIMARY KEY,
    companyRatingUniqueId VARCHAR(36) UNIQUE NOT NULL,
    companyBidRequestUniqueId VARCHAR(36) UNIQUE NOT NULL,
    companyUniqueId VARCHAR(36) NOT NULL,
    ratedByUserUniqueId VARCHAR(36) NOT NULL,
    rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NULL,
    companyRatingCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    companyRatingUpdatedAt DATETIME NULL,
    companyRatingDeletedAt DATETIME NULL,
    companyRatingCreatedBy VARCHAR(36) NOT NULL,
    companyRatingUpdatedBy VARCHAR(36) NULL,
    companyRatingDeletedBy VARCHAR(36) NULL,
    FOREIGN KEY (companyBidRequestUniqueId) REFERENCES CompanyBidRequest(companyBidRequestUniqueId),
    FOREIGN KEY (companyUniqueId) REFERENCES TransportCompany(companyUniqueId),
    FOREIGN KEY (ratedByUserUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyRatingCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyRatingUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyRatingDeletedBy) REFERENCES Users(userUniqueId),
    INDEX idx_company_rating_company (companyUniqueId),
    INDEX idx_company_rating_job (companyBidRequestUniqueId)
);`;
