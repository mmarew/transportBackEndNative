"use strict";

// ratings profile
// Tables: Ratings, UserProfileHistory
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 839-898). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `

-- Create the Ratings table, record every journey rating via journeyDecisionUniqueId

CREATE TABLE IF NOT EXISTS Ratings (
    ratingId INT AUTO_INCREMENT PRIMARY KEY,
    journeyDecisionUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- Foreign key to JourneyDecisions
    ratedBy VARCHAR(36) NOT NULL,  -- Foreign key to Users (who gave the rating)
    rating INT NOT NULL,  -- Rating score
    comment TEXT NULL,  -- Rating comment
    ratingCreatedBy VARCHAR(36) NOT NULL,  -- Who created the rating
    ratingUpdatedBy VARCHAR(36) NULL,  -- Who updated the rating
    ratingDeletedBy VARCHAR(36) NULL,  -- Who deleted the rating
    ratingCreatedAt DATETIME NOT NULL,  -- When the rating was created
    ratingUpdatedAt DATETIME NULL,  -- When the rating was updated
    ratingDeletedAt DATETIME NULL,  -- When the rating was deleted
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (ratedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (ratingCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (ratingUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (ratingDeletedBy) REFERENCES Users(userUniqueId)
) ;

-- CompanyRating is defined at the end of the schema (after CompanyBidRequest is created).


-- CompanyProfileHistory is defined at the end of the schema (after TransportCompany is created).


-- UserProfileHistory: Append-only audit log for user profile & status changes.
-- Same pattern as CompanyHistory — one row per field per event.
-- Clearly named to separate from job/journey history.
-- fieldName examples:
--   'fullName', 'phoneNumber', 'email'  → source: profile_update
--   'userStatus', 'roleStatus'          → source: status_change (future use)
--   'ban'                               → source: ban (referenceUniqueId = userDelinquencyUniqueId)
CREATE TABLE IF NOT EXISTS UserProfileHistory (
    historyId INT AUTO_INCREMENT PRIMARY KEY,
    historyUniqueId VARCHAR(36) UNIQUE NOT NULL,
    userUniqueId VARCHAR(36) NOT NULL,                  -- FK → Users
    changedBy VARCHAR(36) NOT NULL,                     -- FK → Users (who made the change)
    changedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fieldName VARCHAR(100) NOT NULL,                    -- which field changed
    oldValue TEXT NULL,                                 -- value before the change
    newValue TEXT NULL,                                 -- value after the change
    reason TEXT NULL,
    source ENUM(
        'registration',    -- user first created
        'profile_update',  -- fullName / phone / email change
        'status_change',   -- admin changed user or role status
        'ban',             -- compliance ban (referenceUniqueId = userDelinquencyUniqueId)
        'unban',           -- admin lifted ban
        'manual'           -- direct admin override
    ) NOT NULL,
    referenceUniqueId VARCHAR(36) NULL,
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (changedBy) REFERENCES Users(userUniqueId),
    INDEX idx_uph_user (userUniqueId),
    INDEX idx_uph_field (fieldName),
    INDEX idx_uph_changed_at (changedAt)
) ;`;
