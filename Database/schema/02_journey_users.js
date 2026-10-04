"use strict";

// journey users
// Tables: JourneyStatus, UsersHistory, usersCredential, DeviceTokens
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 142-229). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `

 -- Create the JourneyStatus table

CREATE TABLE IF NOT EXISTS JourneyStatus (
    journeyStatusId INT AUTO_INCREMENT PRIMARY KEY,
    journeyStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for journey status
    journeyStatusName VARCHAR(50) NOT NULL,  -- Name of the journey status
    journeyStatusDescription VARCHAR(2255) NULL,  -- Description of the journey status
    journeyStatusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the journey status
    journeyStatusUpdatedBy VARCHAR(36) NULL,  -- Who updated the journey status
    journeyStatusDeletedBy VARCHAR(36) NULL,  -- Who deleted the journey status
    journeyStatusCreatedAt DATETIME NOT NULL,  -- When the journey status was created
    journeyStatusUpdatedAt DATETIME NULL,  -- When the journey status was updated
    journeyStatusDeletedAt DATETIME NULL,  -- When the journey status was deleted
    FOREIGN KEY (journeyStatusCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyStatusDeletedBy) REFERENCES Users(userUniqueId)
) ;


 -- Create the UsersHistory Table

CREATE TABLE IF NOT EXISTS UsersHistory (
    userHistoryId INT AUTO_INCREMENT PRIMARY KEY,
    userUniqueId VARCHAR(36) NOT NULL,  -- UUID of the user, foreign key to Users table
    fullName VARCHAR(255) NOT NULL,  -- Full name of the user
    phoneNumber VARCHAR(20) NOT NULL,  -- Phone number of the user
    email VARCHAR(255) NOT NULL,  -- Email of the user
    actionType ENUM('UPDATED', 'DELETED') NOT NULL,  -- Action that triggered this record
    actionBy VARCHAR(36) NULL,  -- User who triggered the update/delete action
    actionAt DATETIME NOT NULL,  -- When the action was taken
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId)  -- Reference to Users table
)  ;

-- Create the UsersCredential Table

CREATE TABLE IF NOT EXISTS usersCredential (
    credentialId INT AUTO_INCREMENT PRIMARY KEY,
    credentialUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for credentials
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    -- Hybrid Verification Logic Overview:
    -- 1. Unverified: Phone gets phoneVerificationOTP (SMS), Email gets emailVerificationToken (Link).
    -- 2. Verified: Both get the same emailVerificationOTP/phoneVerificationOTP (Unified OTP mode).
    sharedOTP VARCHAR(255) NOT NULL,              -- Legacy fallback (usually stores hashed phoneVerificationOTP)
    phoneVerificationOTP VARCHAR(255) NULL,             -- Hashed 6-digit code sent via SMS
    emailVerificationOTP VARCHAR(255) NULL,             -- Hashed 6-digit code sent via Email (Unified mode only)
    otpPlain VARCHAR(255) NULL,                  -- Plaintext OTP (dev-only, for getOTP dev endpoint)
    emailVerificationToken VARCHAR(255) NULL,      -- Secret UUID for the "Click to Verify" email link
    emailVerificationExpiresAt DATETIME NULL,      -- Link expiration time (standard 2 hours)
    hashedPassword VARCHAR(255) NOT NULL,   -- Storeshashed OTP (used for the initial login/verification)
    usersCredentialCreatedBy VARCHAR(36) NULL,  -- Who created the credential (nullable for initial seeding)
    usersCredentialUpdatedBy VARCHAR(36) NULL,  -- Who updated the credential
    usersCredentialDeletedBy VARCHAR(36) NULL,  -- Who deleted the credential
    usersCredentialCreatedAt DATETIME NOT NULL,  -- When the credential was created
    usersCredentialUpdatedAt DATETIME NULL,  -- When the credential was updated
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (usersCredentialCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (usersCredentialUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (usersCredentialDeletedBy) REFERENCES Users(userUniqueId)
) ;

-- Create the DeviceTokens table (stores FCM/device tokens per device)

CREATE TABLE IF NOT EXISTS DeviceTokens (
    deviceTokenId INT AUTO_INCREMENT PRIMARY KEY,
    deviceTokenUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the device token record
    userUniqueId VARCHAR(36) NULL,                    -- Foreign key to Users (nullable for pre-login)
    roleId INT NOT NULL,                              -- Foreign key to Roles, users can have multiple roles, so we use roleId to identify the role
    token VARCHAR(255) NOT NULL,                      -- Raw FCM token
    platform ENUM('ios','android','web') NULL,        -- Device platform
    appVersion VARCHAR(32) NULL,                      -- App version on device
    locale VARCHAR(16) NULL,                          -- e.g., en-US
    lastSeenAt DATETIME NULL,                         -- Last time this token was seen/used
    revokedAt DATETIME NULL,                          -- If set, token is no longer active
    deviceTokenCreatedBy VARCHAR(36) NULL,            -- Who created the device token
    deviceTokenUpdatedBy VARCHAR(36) NULL,            -- Who updated the device token
    deviceTokenDeletedBy VARCHAR(36) NULL,            -- Who deleted the device token
    deviceTokenCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,     -- Created time
    deviceTokenUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Updated time
    deviceTokenDeletedAt DATETIME NULL,               -- When the device token was deleted
    UNIQUE (token),
    INDEX idx_deviceTokens_userUniqueId (userUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (roleId) REFERENCES Roles(roleId),
    FOREIGN KEY (deviceTokenCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (deviceTokenUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (deviceTokenDeletedBy) REFERENCES Users(userUniqueId)
) ;`;
