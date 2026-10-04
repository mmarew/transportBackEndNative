"use strict";

// roles permissions
// Tables: UserRole, Statuses, UserRoleStatusCurrent, UserRoleStatusHistory
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 230-304). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `

 
-- Create the UserRole Table

CREATE TABLE IF NOT EXISTS UserRole (
    userRoleId INT AUTO_INCREMENT PRIMARY KEY,
    userRoleUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for user-role link
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users
    roleId INT NOT NULL,  -- Foreign key to Roles
    userRoleCreatedBy VARCHAR(36) NOT NULL,  -- Who created the user role
    userRoleUpdatedBy VARCHAR(36) NULL,  -- Who updated the user role
    userRoleDeletedBy VARCHAR(36) NULL,  -- Who deleted the user role
    userRoleCreatedAt DATETIME NOT NULL,  -- When the user role was created
    userRoleDeletedAt DATETIME NULL , -- When the user role was deleted
    INDEX idx_userRole_userUniqueId (userUniqueId),
    INDEX idx_userRole_roleId (roleId),
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),  -- Link to Users
    FOREIGN KEY (roleId) REFERENCES Roles(roleId)  -- Link to Roles
)  ; 

-- Create the Statuses Table

CREATE TABLE IF NOT EXISTS Statuses (
    statusId INT AUTO_INCREMENT PRIMARY KEY,
    statusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the status
    statusName VARCHAR(150) UNIQUE NOT NULL,  -- Name of the status
    statusDescription VARCHAR(255) NULL,  -- Description of the status
    statusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the status
    statusUpdatedBy VARCHAR(36) NULL,  -- Who updated the status
    statusUpdatedAt DATETIME NULL,  -- When the status was updated
    statusDeletedBy VARCHAR(36) NULL,  -- Who deleted the status
    statusDeletedAt DATETIME NULL,  -- When the status was deleted
    statusCreatedAt DATETIME NOT NULL,  -- When the status was created
     FOREIGN KEY (statusCreatedBy) REFERENCES Users(userUniqueId)  -- Foreign key to Users
)  ;

-- Table to hold the current status of each user-role combination

CREATE TABLE IF NOT EXISTS UserRoleStatusCurrent (
    userRoleStatusId INT AUTO_INCREMENT PRIMARY KEY,
    userRoleStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for user-role-status link
    statusId INT NOT NULL,  -- Foreign key to Statuses
    userRoleId INT NOT NULL,  -- Foreign key to UserRole
    userRoleStatusDescription TEXT NULL,  -- Description of the current role status
    userRoleStatusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the current status
    userRoleStatusCreatedAt DATETIME NOT NULL,  -- When the current status was created  
    userRoleStatusCurrentVersion int not null default 1  ,
    foreign key (statusId) references Statuses(statusId),
    foreign key (userRoleId) references UserRole(userRoleId),
    foreign key (userRoleStatusCreatedBy) references Users(userUniqueId),
        -- Add indexes for frequently queried columns
    INDEX idx_userRoleStatusCurrent_userRoleId (userRoleId),
    INDEX idx_userRoleStatusCurrent_statusId (statusId),
    INDEX idx_userRoleStatusCurrent_userRoleStatusCreatedBy (userRoleStatusCreatedBy)
)  ;

-- Table to hold the history of all user-role statuses, including updates and deletions

CREATE TABLE IF NOT EXISTS UserRoleStatusHistory (
userRoleStatusHistoryId INT AUTO_INCREMENT PRIMARY KEY,
    userRoleStatusId int not null, -- Foreign key to UserRoleStatusCurrent
    userRoleStatusUniqueId VARCHAR(36)  NOT NULL,  -- UUID for user-role-status link (copied from current table)
    statusId INT NOT NULL,  -- Foreign key to Statuses
    userRoleId INT NOT NULL,  -- Foreign key to UserRole
    userRoleStatusDescription TEXT NULL,  -- Description of the role status (copied from current table)
    userRoleStatusCreatedBy VARCHAR(36) NOT NULL,  -- Who created the status (copied from current table)
    userRoleStatusCreatedAt DATETIME NOT NULL,  -- When the status was created (copied from current table)
    userRoleStatusUpdatedBy VARCHAR(36) NULL,  -- Who updated the status
    userRoleStatusUpdatedAt DATETIME NULL,  -- When the status was updated
    userRoleStatusDeletedBy VARCHAR(36) NULL,  -- Who deleted the status
    userRoleStatusDeletedAt DATETIME NULL, -- When the status was deleted
    userRoleStatusCurrentVersion int not null default 1,
    INDEX (userRoleId),  -- Index for faster lookups on user roles
    INDEX (statusId)  -- Index for faster lookups on status
)  ;`;
