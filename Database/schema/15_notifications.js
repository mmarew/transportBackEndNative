"use strict";

// notifications
// Tables: JourneyNotifications
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 1364-1392). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `

-- create  JourneyNotifications table which is used as  
CREATE TABLE IF NOT EXISTS JourneyNotifications (
    journeyNotificationId INT AUTO_INCREMENT PRIMARY KEY,  -- Primary key
    journeyNotificationUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for notification
    journeyUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Journey (UUID)
    journeyStatusUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to JourneyStatus (UUID)
    message VARCHAR(255) NULL,  -- Optional message for notification
    isSeen TINYINT(1) DEFAULT 0,  -- 0 = Unseen, 1 = Seen
    journeyNotificationCreatedBy VARCHAR(36) NOT NULL,  -- Who created the notification
    journeyNotificationUpdatedBy VARCHAR(36) NULL,  -- Who updated the notification
    journeyNotificationDeletedBy VARCHAR(36) NULL,  -- Who deleted the notification
    journeyNotificationCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- Created time
    journeyNotificationUpdatedAt DATETIME NULL DEFAULT NULL,  -- Updated time (optional)
    journeyNotificationDeletedAt DATETIME NULL,  -- When the notification was deleted
    
    -- Foreign key to Journey table
    FOREIGN KEY (journeyUniqueId) REFERENCES Journey(journeyUniqueId),
    
    -- Foreign key to JourneyStatus table
    FOREIGN KEY (journeyStatusUniqueId) REFERENCES JourneyStatus(journeyStatusUniqueId),
    
    FOREIGN KEY (journeyNotificationCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyNotificationUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyNotificationDeletedBy) REFERENCES Users(userUniqueId),

    -- Unique constraint to avoid duplicate journey-status notifications
    UNIQUE (journeyUniqueId, journeyStatusUniqueId)
);`;
