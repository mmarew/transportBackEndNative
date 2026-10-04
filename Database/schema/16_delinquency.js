"use strict";

// delinquency
// Tables: DelinquencyTypes, UserDelinquency, UserDelinquencyResponse, AdminDecisionOnUserDelinquency, BannedUsers, BannedUserDelinquency
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 1393-1525). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `
 
-- DelinquencyTypes table  is used to define delinquency type definitions with point values
CREATE TABLE IF NOT EXISTS DelinquencyTypes (
    delinquencyTypeId INT AUTO_INCREMENT PRIMARY KEY,
    delinquencyTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,
    delinquencyTypeName VARCHAR(50) NOT NULL UNIQUE,  -- e.g., 'late_arrival', 'rude_behavior'
    delinquencyTypeDescription TEXT NOT NULL,
    defaultPoints INT NOT NULL DEFAULT 1,
    defaultSeverity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    applicableRoles VARCHAR(36) NOT NULL,  -- Which roles this applies to roleUniqueId
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    delinquencyTypeCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delinquencyTypeCreatedBy VARCHAR(36) NOT NULL,
    delinquencyTypeUpdatedAt DATETIME NULL,
    delinquencyTypeUpdatedBy VARCHAR(36) NULL,
    delinquencyTypeDeletedAt DATETIME NULL,
    delinquencyTypeDeletedBy VARCHAR(36) NULL,
    -- foreign key to role
    FOREIGN KEY (applicableRoles) REFERENCES Roles(roleUniqueId),
    FOREIGN KEY (delinquencyTypeCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (delinquencyTypeUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (delinquencyTypeDeletedBy) REFERENCES Users(userUniqueId)
);

-- User Delinquency table — tracks delinquency for specific user-role combinations.
-- Lifecycle mirrors CompanyDelinquency:
--   1. Delinquency created → user notified, responseDeadline set
--   2. User MAY submit a defense (UserDelinquencyResponse)
--   3. Admin issues a ruling (AdminDecisionOnUserDelinquency)
--   4. UPHELD → graduated auto-ban check via BannedUsers


CREATE TABLE IF NOT EXISTS UserDelinquency (

    userDelinquencyId INT AUTO_INCREMENT PRIMARY KEY,
    userDelinquencyUniqueId VARCHAR(36) UNIQUE NOT NULL,

    userUniqueId VARCHAR(36) NOT NULL,
    roleId INT NOT NULL,
    delinquencyTypeUniqueId VARCHAR(36) NOT NULL,
    delinquencyDescription TEXT NOT NULL,
    delinquencySeverity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    delinquencyPoints INT NOT NULL DEFAULT 1,
    delinquencyCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delinquencyUpdatedAt DATETIME NULL DEFAULT NULL,
    delinquencyCreatedBy VARCHAR(36) NOT NULL DEFAULT 'system',
    journeyDecisionUniqueId VARCHAR(36) NULL,
    responseDeadline DATETIME NULL,                     -- Auto-set: CRITICAL=1d, HIGH=3d, MEDIUM=5d, LOW=7d
    delinquencyDeletedAt DATETIME NULL,                 -- Soft-delete (EXONERATED)
    delinquencyDeletedBy VARCHAR(36) NULL,
    isDelinquencySeenByAdmin TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (roleId) REFERENCES Roles(roleId),
    FOREIGN KEY (delinquencyCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (delinquencyTypeUniqueId) REFERENCES DelinquencyTypes(delinquencyTypeUniqueId),
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (delinquencyDeletedBy) REFERENCES Users(userUniqueId),
    INDEX idx_userrole_severity (userUniqueId, roleId, delinquencySeverity),
    INDEX idx_created_severity (delinquencyCreatedAt, delinquencySeverity)
);

-- UserDelinquencyResponse: user's formal defense against a delinquency accusation.
-- One response per delinquency. Late responses are flagged.
CREATE TABLE IF NOT EXISTS UserDelinquencyResponse (
    userDelinquencyResponseId INT AUTO_INCREMENT PRIMARY KEY,
    userDelinquencyResponseUniqueId VARCHAR(36) UNIQUE NOT NULL,
    userDelinquencyUniqueId VARCHAR(36) NOT NULL,
    userDelinquencyResponse TEXT NOT NULL,
    isLateResponse BOOLEAN NOT NULL DEFAULT FALSE,
    userDelinquencyResponseCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    userDelinquencyResponseDeletedAt DATETIME NULL,
    userDelinquencyResponseDeletedBy varchar(36) default null,

    userDelinquencyResponseCreatedBy VARCHAR(36) NOT NULL,

     userDelinquencyResponseUpdatedAt varchar(36) default null,
         userDelinquencyResponseUpdatedBy varchar(36) default null,

    FOREIGN KEY (userDelinquencyUniqueId) REFERENCES UserDelinquency(userDelinquencyUniqueId),
    FOREIGN KEY (userDelinquencyResponseCreatedBy) REFERENCES Users(userUniqueId),
    INDEX idx_user_delinquency_response (userDelinquencyUniqueId)
);

-- AdminDecisionOnUserDelinquency: admin's formal ruling on a user dispute.
-- Outcomes: EXONERATED (cleared), UPHELD (ban check), REDUCED (lower pts), DISMISSED (no action)
CREATE TABLE IF NOT EXISTS AdminDecisionOnUserDelinquency (
    adminDecisionOnUserDelinquencyId INT AUTO_INCREMENT PRIMARY KEY,
    adminDecisionOnUserDelinquencyUniqueId VARCHAR(36) UNIQUE NOT NULL,
    userDelinquencyUniqueId VARCHAR(36) NOT NULL,
    userDelinquencyResponseUniqueId VARCHAR(36) NULL,
    decisionOutcome ENUM('EXONERATED','UPHELD','REDUCED','DISMISSED') NOT NULL,
    adminDecisionText TEXT NOT NULL,
    delinquencyPointsAfter INT NULL,
    adminDecisionOnUserDelinquencyCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    adminDecisionOnUserDelinquencyCreatedBy VARCHAR(36) NOT NULL,
    adminDecisionOnUserDelinquencyDeletedAt DATETIME NULL,
    FOREIGN KEY (userDelinquencyUniqueId) REFERENCES UserDelinquency(userDelinquencyUniqueId),
    FOREIGN KEY (userDelinquencyResponseUniqueId) REFERENCES UserDelinquencyResponse(userDelinquencyResponseUniqueId),
    FOREIGN KEY (adminDecisionOnUserDelinquencyCreatedBy) REFERENCES Users(userUniqueId),
    INDEX idx_admin_decision_user_del (userDelinquencyUniqueId)
);

-- Banned Users table — graduated ban system matching CompanyBan.
-- Ban path: Delinquency → Response(optional) → AdminDecision(UPHELD) → auto-ban check
CREATE TABLE IF NOT EXISTS BannedUsers (
    banId INT AUTO_INCREMENT PRIMARY KEY,
    banUniqueId VARCHAR(36) UNIQUE NOT NULL,
    userUniqueId VARCHAR(36) NOT NULL,
    roleId INT NOT NULL,
    banAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    bannedBy VARCHAR(36) NOT NULL DEFAULT 'system',
    banReason TEXT NOT NULL,
    banDurationDays INT NOT NULL,
    banExpiresAt DATETIME NOT NULL,
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (roleId) REFERENCES Roles(roleId),
    INDEX idx_ban_expires (banExpiresAt, isActive),
    INDEX idx_ban_user_role (userUniqueId, roleId)
);

-- BannedUserDelinquency: junction linking one ban to ALL contributing delinquencies.
CREATE TABLE IF NOT EXISTS BannedUserDelinquency (
    bannedUserDelinquencyId INT AUTO_INCREMENT PRIMARY KEY,
    bannedUserDelinquencyUniqueId VARCHAR(36) UNIQUE NOT NULL,
    banUniqueId VARCHAR(36) NOT NULL,
    userDelinquencyUniqueId VARCHAR(36) NOT NULL,
    pointsAtTime INT NOT NULL DEFAULT 0,
    FOREIGN KEY (banUniqueId) REFERENCES BannedUsers(banUniqueId),
    FOREIGN KEY (userDelinquencyUniqueId) REFERENCES UserDelinquency(userDelinquencyUniqueId),
    INDEX idx_ban_delinquency (banUniqueId, userDelinquencyUniqueId)
);`;
