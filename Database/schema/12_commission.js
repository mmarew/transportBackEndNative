"use strict";

// commission
// Tables: CommissionRates, CommissionStatus, Commission
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 1074-1132). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `
 -- Create the CommissionRates table

 CREATE TABLE IF NOT EXISTS CommissionRates (
    commissionRateId INT AUTO_INCREMENT PRIMARY KEY,
    commissionRateUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for commission
    commissionRate DECIMAL(5, 2) NOT NULL,  -- Commission rate as a percentage (e.g., 10 for 10%)
    commissionRateEffectiveDate DATE NOT NULL,            -- The date from which this rate is effective
    commissionRateExpirationDate DATE NOT NULL,            -- The date after which this rate is no longer effective
    commissionRateCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    commissionRateUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    commissionRateDeletedAt DATETIME NULL,
    commissionRateCreatedBy VARCHAR(36) NOT NULL,  -- Who created the commission rate
    commissionRateUpdatedBy VARCHAR(36) NULL,  -- Who updated the commission rate
    commissionRateDeletedBy VARCHAR(36) NULL, -- Who deleted the commission rate
    FOREIGN KEY (commissionRateCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (commissionRateUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (commissionRateDeletedBy) REFERENCES Users(userUniqueId)
 );

 -- Create the CommissionStatus table
 CREATE TABLE IF NOT EXISTS CommissionStatus (
    commissionStatusId INT AUTO_INCREMENT PRIMARY KEY,
    commissionStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for commission status
    statusName VARCHAR(50) UNIQUE NOT NULL,  -- PAID, PENDING, REQUESTED, FREE, CANCELED
    description VARCHAR(255) NULL,
    effectiveFrom DATETIME NULL,
    effectiveTo DATETIME NULL,
    commissionStatusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the commission status
    commissionStatusUpdatedBy VARCHAR(36) NULL,  -- Who updated the commission status
    commissionStatusCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    commissionStatusUpdatedAt DATETIME NULL,  -- When the commission status was updated
    commissionStatusDeletedAt DATETIME NULL,
    commissionStatusDeletedBy VARCHAR(36) NULL,
    FOREIGN KEY (commissionStatusCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (commissionStatusUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (commissionStatusDeletedBy) REFERENCES Users(userUniqueId)
 );

-- commission table for every payment load now, when shipper pay to driver some amount must be taken as commission based on commission rate

    CREATE TABLE IF NOT EXISTS Commission (
    commissionId INT AUTO_INCREMENT PRIMARY KEY,
    commissionUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for commission
   paymentUniqueId varchar(36) NULL,  -- Optional foreign key to Payments if payment exists
   journeyDecisionUniqueId varchar(36) NOT NULL,  -- Foreign key to JourneyDecisions
    commissionRateUniqueId varchar(36) NOT NULL,  -- Foreign key to CommissionRates
    commissionAmount DECIMAL(10, 2) NOT NULL,  -- Commission amount
    commissionStatusUniqueId VARCHAR(36) NOT NULL, -- Foreign key to CommissionStatus
    commissionCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    commissionUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    commissionDeletedAt DATETIME NULL,
    commissionCreatedBy VARCHAR(36) NOT NULL,  -- Who created the commission
    commissionUpdatedBy VARCHAR(36) NULL,  -- Who updated the commission
    commissionDeletedBy VARCHAR(36) NULL, -- Who deleted the commission
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (paymentUniqueId) REFERENCES JourneyPayments(paymentUniqueId),
    FOREIGN KEY (commissionRateUniqueId) REFERENCES CommissionRates(commissionRateUniqueId),
    FOREIGN KEY (commissionStatusUniqueId) REFERENCES CommissionStatus(commissionStatusUniqueId)
);`;
