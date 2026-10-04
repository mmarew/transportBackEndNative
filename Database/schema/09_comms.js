"use strict";

// comms
// Tables: SMSSender, CancellationReasonsType
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 899-939). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `

-- Create the SMSSender table

CREATE TABLE IF NOT EXISTS SMSSender (
    SMSSenderId INT AUTO_INCREMENT PRIMARY KEY, 
    phoneNumber VARCHAR(50) NOT NULL,  -- Phone number of SMS sender
    password VARCHAR(255) NOT NULL,  -- Password of SMS sender
    SMSSenderCreatedBy VARCHAR(36) NOT NULL,  -- Who created the SMS sender
    SMSSenderUpdatedBy VARCHAR(36) NULL,  -- Who updated the SMS sender
    SMSSenderDeletedBy VARCHAR(36) NULL,  -- Who deleted the SMS sender
    SMSSenderCreatedAt DATETIME NOT NULL,  -- When the SMS sender was created
    SMSSenderUpdatedAt DATETIME NULL,  -- When the SMS sender was updated
    SMSSenderDeletedAt DATETIME NULL,  -- When the SMS sender was deleted
    FOREIGN KEY (SMSSenderCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (SMSSenderUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (SMSSenderDeletedBy) REFERENCES Users(userUniqueId)
) ;

 -- Create the CancellationReasonsType table

CREATE TABLE IF NOT EXISTS CancellationReasonsType (
    cancellationReasonsTypeId INT AUTO_INCREMENT PRIMARY KEY, 
    cancellationReasonTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for cancellation reason
    cancellationReason VARCHAR(150) NOT NULL,  -- Type of cancellation reason
    roleId int NOT NULL,  -- Who canceled (could be driver, shipper, or admin)
    -- requestMode controls which UI context this reason belongs to:
    --   'individual'  → shown only when cancelling a single driver-to-shipper request
    --   'company'     → shown only when cancelling a company freight/batch request
    --   'both'        → valid in both individual and company contexts
    requestMode ENUM('individual', 'company', 'both') NOT NULL DEFAULT 'both',
    cancellationReasonTypeCreatedBy VARCHAR(36) NOT NULL,  -- Who created the cancellation reason
    cancellationReasonTypeUpdatedBy VARCHAR(36) NULL,  -- Who updated the cancellation reason
    cancellationReasonTypeDeletedBy VARCHAR(36) NULL,  -- Who deleted the cancellation reason
    cancellationReasonTypeCreatedAt DATETIME NOT NULL,  -- When the cancellation reason was created
    cancellationReasonTypeUpdatedAt DATETIME NULL,  -- When the cancellation reason was updated
    cancellationReasonTypeDeletedAt DATETIME NULL,  -- When the cancellation reason was deleted
    FOREIGN KEY (roleId) REFERENCES Roles(roleId),
    FOREIGN KEY (cancellationReasonTypeCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (cancellationReasonTypeUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (cancellationReasonTypeDeletedBy) REFERENCES Users(userUniqueId)
) ;`;
