"use strict";

// company core
// Tables: TransportCompany, CompanyBan, CompanyRoles, CompanyMembership, CompanyVehicle
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 1526-1708). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `
 

-- ============================================================
-- COMPANY TRANSPORT SCHEMA
-- Added to support Ethiopian freight transport companies that
-- own fleets (100-500+ vehicles) bidding on bulk shipper requests.
-- ============================================================


-- TransportCompany: Core entity representing a registered freight company.
-- A company may have hundreds of vehicles and can bid on shipper requests
-- as an organisation rather than as individual drivers.

CREATE TABLE IF NOT EXISTS TransportCompany (
    companyId INT AUTO_INCREMENT PRIMARY KEY,
    companyUniqueId VARCHAR(36) UNIQUE NOT NULL,           -- UUID
    companyName VARCHAR(255) NOT NULL,                     -- Official registered company name
    companyRegistrationNumber VARCHAR(100) UNIQUE NULL,    -- Ethiopian trade/transport license number
    companyPhone VARCHAR(20) NULL,                         -- Company contact phone
    companyEmail VARCHAR(255) NULL,                        -- Company contact email
    companyAddress VARCHAR(500) NULL,                      -- Physical address
    approvalStatus ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
    approvalReason VARCHAR(500) NULL,                      -- Admin note when approving or rejecting
    approvedBy VARCHAR(36) NULL,                           -- Admin who approved/rejected
    approvedAt DATETIME NULL,
    companyCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    companyCreatedBy VARCHAR(36) NOT NULL,
    companyUpdatedAt DATETIME NULL,
    companyUpdatedBy VARCHAR(36) NULL,
    companyDeletedAt DATETIME NULL,
    companyDeletedBy VARCHAR(36) NULL,
    isDeleted BOOLEAN NOT NULL DEFAULT FALSE,
    INDEX idx_company_approvalStatus (approvalStatus),
    INDEX idx_company_isDeleted (isDeleted),
    FOREIGN KEY (companyCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyDeletedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (approvedBy) REFERENCES Users(userUniqueId)
);

-- CompanyBan: active suspensions for transport companies.
-- A ban records expiry, reason, and who triggered it.
-- For auto-bans (accumulated points), all contributing delinquencies
-- are linked via CompanyBanDelinquency junction table.

-- CompanyBan: records a ban issued against a transport company.
--
-- Ban path (single):
--   Delinquency → (optional company response) → AdminDecisionOnDelinquency
--   → UPHELD → checkAndApplyAutomaticCompanyBan (graduated threshold check)
--
-- The graduated system sums all active delinquency points in a 30-day window:
--   15+ pts → 3-day ban (MEDIUM)
--   30+ pts → 7-day ban (HIGH)
--   60+ pts → 90-day ban (CRITICAL)
--   90+ pts → 365-day ban (PERMANENT)
--   Below 15 → no ban issued (warning only)
--
-- CompanyBanDelinquency records WHICH delinquencies contributed to the ban.
CREATE TABLE IF NOT EXISTS CompanyBan (

    companyBanId       INT AUTO_INCREMENT PRIMARY KEY,
    companyBanUniqueId VARCHAR(36) UNIQUE NOT NULL,

    companyUniqueId    VARCHAR(36) NOT NULL,  -- FK → TransportCompany
    bannedBy           VARCHAR(36) NOT NULL DEFAULT 'system',
    banReason          TEXT NOT NULL,
    banDurationDays    INT NOT NULL,
    banAt              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    banExpiresAt       DATETIME NOT NULL,
    isActive           BOOLEAN NOT NULL DEFAULT TRUE,

    -- Identifies whether the ban was triggered automatically (point threshold)
    -- or manually by an admin decision after a dispute.
    banSource ENUM('auto_threshold', 'admin_decision') NOT NULL DEFAULT 'auto_threshold',

    -- Set only when banSource = 'admin_decision'.
    -- Links to the AdminDecisionOnDelinquency record that triggered this ban.
    -- NULL when banSource = 'auto_threshold'.
    adminDecisionOnDelinquencyUniqueId VARCHAR(36) NULL,

    INDEX idx_company_ban_company (companyUniqueId, isActive),
    INDEX idx_company_ban_expires (banExpiresAt, isActive),
    FOREIGN KEY (companyUniqueId) REFERENCES TransportCompany(companyUniqueId),
    FOREIGN KEY (bannedBy) REFERENCES Users(userUniqueId)
    -- Note: FK to AdminDecisionOnDelinquency is NOT declared here because
    -- AdminDecisionOnDelinquency is defined AFTER CompanyBan in this file.
    -- Referential integrity for adminDecisionOnDelinquencyUniqueId is enforced
    -- at the application layer (service validates before insert).
);


-- CompanyDelinquency: audit trail of rule violations by transport companies.
-- Mirrors UserDelinquency but uses companyUniqueId since companies are not users.



-- CompanyBanDelinquency is defined at the end of the schema (after CompanyDelinquency is created).





CREATE TABLE IF NOT EXISTS CompanyRoles (
    companyRoleId INT AUTO_INCREMENT PRIMARY KEY,
    companyRoleUniqueId VARCHAR(36) UNIQUE NOT NULL,
    companyRoleName VARCHAR(50) UNIQUE NOT NULL, -- 'owner', 'manager', 'dispatcher', 'driver'
    companyRoleDescription TEXT,
    companyRoleCreatedBy VARCHAR(36) NOT NULL,
    companyRoleUpdatedBy VARCHAR(36) NULL,
    companyRoleDeletedBy VARCHAR(36) NULL,
    companyRoleCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    companyRoleUpdatedAt DATETIME NULL,
    companyRoleDeletedAt DATETIME NULL,
    FOREIGN KEY (companyRoleCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyRoleUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyRoleDeletedBy) REFERENCES Users(userUniqueId)
);


-- CompanyMembership: Links individual users (owner, manager, dispatcher, driver)
-- to a TransportCompany. A driver can belong to a company AND still take
-- individual shipper requests — membership does NOT lock the driver.
-- One user can have one active membership per company.

CREATE TABLE IF NOT EXISTS CompanyMembership (
    membershipId INT AUTO_INCREMENT PRIMARY KEY,
    membershipUniqueId VARCHAR(36) UNIQUE NOT NULL,
    companyUniqueId VARCHAR(36) NOT NULL,                  -- FK → TransportCompany
    userUniqueId VARCHAR(36) NOT NULL,                     -- FK → Users
    companyRoleUniqueId VARCHAR(36) NOT NULL,             -- FK → CompanyRoles
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    membershipStartDate DATETIME NOT NULL,
    membershipEndDate DATETIME NULL,
    membershipCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    membershipCreatedBy VARCHAR(36) NOT NULL,
    membershipUpdatedAt DATETIME NULL,
    membershipUpdatedBy VARCHAR(36) NULL,
    membershipDeletedAt DATETIME NULL,
    membershipDeletedBy VARCHAR(36) NULL,
    UNIQUE KEY uq_company_user (companyUniqueId, userUniqueId),  -- One active membership per user per company
    INDEX idx_membership_companyUniqueId (companyUniqueId),
    INDEX idx_membership_userUniqueId (userUniqueId),
    INDEX idx_membership_role (companyRoleUniqueId),
    FOREIGN KEY (companyUniqueId) REFERENCES TransportCompany(companyUniqueId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyRoleUniqueId) REFERENCES CompanyRoles(companyRoleUniqueId),
    FOREIGN KEY (membershipCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (membershipUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (membershipDeletedBy) REFERENCES Users(userUniqueId)
);


-- CompanyVehicle: Assigns vehicles to a company fleet.
-- Separate from VehicleOwnership (which links vehicles to individual users).
-- A vehicle may be owned by an individual user AND assigned to a company.

CREATE TABLE IF NOT EXISTS CompanyVehicle (
    companyVehicleId INT AUTO_INCREMENT PRIMARY KEY,
    companyVehicleUniqueId VARCHAR(36) UNIQUE NOT NULL,
    companyUniqueId VARCHAR(36) NOT NULL,                  -- FK → TransportCompany
    vehicleUniqueId VARCHAR(36) NOT NULL,                  -- FK → Vehicle
    assignmentStatus ENUM('active','inactive') NOT NULL DEFAULT 'active',
    assignmentStartDate DATETIME NOT NULL,
    assignmentEndDate DATETIME NULL,

    companyVehicleCreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    companyVehicleCreatedBy VARCHAR(36) NOT NULL,
    companyVehicleUpdatedAt DATETIME NULL,
    companyVehicleUpdatedBy VARCHAR(36) NULL,
    companyVehicleDeletedAt DATETIME NULL,
    companyVehicleDeletedBy VARCHAR(36) NULL,

    UNIQUE KEY uq_company_vehicle (companyUniqueId, vehicleUniqueId),  -- One vehicle per company at a time
    INDEX idx_companyVehicle_company (companyUniqueId),
    INDEX idx_companyVehicle_vehicle (vehicleUniqueId),
    INDEX idx_companyVehicle_status (assignmentStatus),
    FOREIGN KEY (companyUniqueId) REFERENCES TransportCompany(companyUniqueId),
    FOREIGN KEY (vehicleUniqueId) REFERENCES Vehicle(vehicleUniqueId),
    FOREIGN KEY (companyVehicleCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyVehicleUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (companyVehicleDeletedBy) REFERENCES Users(userUniqueId)
);`;
