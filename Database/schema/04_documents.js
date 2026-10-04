"use strict";

// documents
// Tables: DocumentTypes, DocumentTypesHistory, RoleDocumentRequirements, AttachedDocuments, AttachedDocumentsHistory
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 305-446). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `

-- Create the DocumentTypes Table
-- if driver attach required documents like driving license ,uploadedDocumentName is used in file input field of front end and in backend to receive file name and same to others also. That is why we used uploadedDocument. It is a standard to transfer files from front end to backend using unique name. 
CREATE TABLE IF NOT EXISTS DocumentTypes (
    documentTypeId INT AUTO_INCREMENT PRIMARY KEY,
    documentTypeUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the document type list
    documentTypeName VARCHAR(50) UNIQUE NOT NULL,  -- Name of the document type (e.g., "ID", "License", "Plate")
    uploadedDocumentName  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input field of front end 
    uploadedDocumentTypeId  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input field of front end
    uploadedDocumentDescription  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input field of front end
    uploadedDocumentExpirationDate  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input field of front end
    uploadedDocumentFileNumber  VARCHAR(50) UNIQUE NOT NULL, -- it is used in file input field of front end to store file number
    documentTypeDescription  TEXT(2000)    not NULL ,  -- Optional description of the document type
    documentTypeCreatedBy VARCHAR(36) NOT NULL,  -- Who created the document type
    documentTypeCreatedAt DATETIME NOT NULL,  -- When the document type was created
    documentTypeUpdatedBy VARCHAR(36) NULL,
    documentTypeUpdatedAt DATETIME NULL,
    documentTypeDeletedBy VARCHAR(36) NULL,
    documentTypeDeletedAt DATETIME NULL,
    isDocumentTypeDeleted BOOLEAN NOT NULL DEFAULT FALSE,
    documentTypeCurrentVersion int not null default 1,
    INDEX idx_createdByUserId (documentTypeCreatedBy),  -- Index for fast lookups
    FOREIGN KEY (documentTypeCreatedBy) REFERENCES Users(userUniqueId)  -- Link to the Users table
)  ;

-- Create the DocumentTypesHistory Table 

CREATE TABLE IF NOT EXISTS DocumentTypesHistory (
    documentTypeHistoryId INT AUTO_INCREMENT PRIMARY KEY,
    documentTypeId INT NOT NULL,  -- Reference to the original DocumentTypes
    documentTypeUniqueId VARCHAR(36) NOT NULL,  -- UUID
    documentTypeName VARCHAR(255) NOT NULL,
    documentTypeDescription VARCHAR(255) NULL,
    documentTypeCreatedBy VARCHAR(36) NOT NULL,
    changeType ENUM('UPDATE', 'DELETE') NOT NULL,  -- Whether it was an update or delete
    documentTypeUpdatedBy VARCHAR(36) NULL,
    documentTypeDeletedBy VARCHAR(36) NULL,
    documentTypeCreatedAt DATETIME NOT NULL,
    changedByUserId VARCHAR(36) NOT NULL,  -- The user who made the change
    documentTypeUpdatedAt DATETIME NULL,
    documentTypeDeletedAt DATETIME NULL,
    documentTypeVersion INT NOT NULL DEFAULT 1,
    FOREIGN KEY (documentTypeId) REFERENCES DocumentTypes(documentTypeId)
)  ;

-- Create the RoleDocumentRequirements Table

    CREATE TABLE IF NOT EXISTS RoleDocumentRequirements(
    roleDocumentRequirementId INT AUTO_INCREMENT PRIMARY KEY,
    roleDocumentRequirementUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for the requirement
    roleId INT NOT NULL,  -- Foreign key to the Roles table
    documentTypeId INT NOT NULL,  -- Foreign key to the DocumentTypes table
    isDocumentMandatory BOOLEAN NOT NULL DEFAULT TRUE,  -- Whether the document is mandatory for the role
    isFileNumberRequired BOOLEAN NOT NULL DEFAULT FALSE,  -- Whether a file number is required for the document
    isExpirationDateRequired BOOLEAN NOT NULL DEFAULT FALSE,  -- Whether the expiration date is required for the document
    isDescriptionRequired BOOLEAN NOT NULL DEFAULT FALSE, -- Whether description is required or not 
    roleDocumentRequirementCreatedBy VARCHAR(36) NOT NULL,  -- Who created the requirement
    roleDocumentRequirementUpdatedBy VARCHAR(36) NULL,  -- Who last updated the requirement
    roleDocumentRequirementDeletedBy VARCHAR(36) NULL,  -- Who deleted the requirement
    roleDocumentRequirementCreatedAt DATETIME NOT NULL,  -- When the requirement was created
    roleDocumentRequirementUpdatedAt DATETIME NULL,  -- When the requirement was updated
    roleDocumentRequirementDeletedAt DATETIME NULL,  -- When the requirement was deleted
    FOREIGN KEY (roleDocumentRequirementCreatedBy) REFERENCES Users(userUniqueId),  -- Link to the Users table
    FOREIGN KEY (roleDocumentRequirementUpdatedBy) REFERENCES Users(userUniqueId),  -- Link to the Users table
    FOREIGN KEY (roleDocumentRequirementDeletedBy) REFERENCES Users(userUniqueId),  -- Link to the Users table
    FOREIGN KEY (roleId) REFERENCES Roles(roleId),  -- Link to the Roles table
    FOREIGN KEY (documentTypeId) REFERENCES DocumentTypes(documentTypeId),  -- Link to the DocumentTypes table
    UNIQUE (roleId, documentTypeId)  -- Ensure each role can have each document type only once
)  ; 

-- Create the AttachedDocuments Table (Active Documents Only)

CREATE TABLE IF NOT EXISTS AttachedDocuments (
    attachedDocumentId INT AUTO_INCREMENT PRIMARY KEY,
    attachedDocumentUniqueId VARCHAR(36) UNIQUE NOT NULL,    -- UUID for the attached document

    -- Polymorphic owner (Option B): who/what this document belongs to.
    -- ownerType  = 'user'    → ownerUniqueId is Users.userUniqueId
    -- ownerType  = 'company' → ownerUniqueId is TransportCompany.companyUniqueId
    -- ownerType  = 'vehicle' → ownerUniqueId is Vehicle.vehicleUniqueId
    -- No DB-level FK here because ownerUniqueId points to different tables.
    -- Application layer enforces referential integrity.


    ownerType ENUM('user', 'company', 'vehicle') NOT NULL DEFAULT 'user',

    ownerUniqueId VARCHAR(36) NOT NULL,

    attachedDocumentDescription VARCHAR(255) NULL,           -- Description of the attached document
    documentTypeId INT NOT NULL,                             -- Foreign key to DocumentTypes
    attachedDocumentFileNumber VARCHAR(25) NULL,             -- File number associated with the document
    documentExpirationDate DATETIME NULL,                    -- Expiration date for time-sensitive docs
    attachedDocumentAcceptance ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    attachedDocumentName VARCHAR(255) NOT NULL,              -- File path / URL stored on FTP
    documentVersion INT NOT NULL DEFAULT 1,                  -- Version counter (incremented on update)
    attachedDocumentCreatedByUserId VARCHAR(36) NOT NULL,    -- Audit: which user uploaded this doc
    attachedDocumentCreatedAt DATETIME NOT NULL,
    attachedDocumentAcceptanceReason VARCHAR(255) NULL,
    attachedDocumentAcceptedRejectedByUserId VARCHAR(36) NULL,
    attachedDocumentAcceptedRejectedAt DATETIME NULL,

    INDEX idx_owner (ownerType, ownerUniqueId),              -- Fast owner lookup
    INDEX idx_documentTypeId (documentTypeId),
    FOREIGN KEY (attachedDocumentCreatedByUserId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (documentTypeId) REFERENCES DocumentTypes(documentTypeId)
)  ;
-- Create the AttachedDocumentsHistory Table (for Historical Records)

CREATE TABLE IF NOT EXISTS AttachedDocumentsHistory (
    attachedDocumentHistoryId INT AUTO_INCREMENT PRIMARY KEY,
    attachedDocumentId INT NOT NULL,                             -- Reference to the original AttachedDocuments row
    attachedDocumentUniqueId VARCHAR(36) NOT NULL,               -- UUID of the document at snapshot time

    -- Polymorphic owner — mirrors AttachedDocuments.ownerType / ownerUniqueId.
    -- Stored here so history rows are self-contained: no join to parent needed
    -- to know whether this snapshot belonged to a user, company, or vehicle.

    ownerType    ENUM('user', 'company', 'vehicle') NOT NULL DEFAULT 'user',
    ownerUniqueId VARCHAR(36) NOT NULL,

    attachedDocumentDescription VARCHAR(255) NULL,
    documentTypeId INT NOT NULL,
    attachedDocumentFileNumber VARCHAR(25) NULL,                 -- Snapshot of file number at time of change
    documentExpirationDate DATETIME NULL,
    attachedDocumentAcceptance ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL,
    attachedDocumentAcceptedRejectedByUserId VARCHAR(36) NULL,
    attachedDocumentAcceptedRejectedAt DATETIME NULL,
    attachedDocumentName VARCHAR(255) NOT NULL,
    attachedDocumentCreatedByUserId VARCHAR(36) NOT NULL,        -- Audit: who originally uploaded
    attachedDocumentUpdatedByUserId VARCHAR(36) NULL,            -- Audit: who triggered this snapshot
    attachedDocumentDeletedByUserId VARCHAR(36) NULL,
    attachedDocumentCreatedAt DATETIME NOT NULL,
    attachedDocumentUpdatedAt DATETIME NULL,                     -- When this snapshot was taken
    attachedDocumentDeletedAt DATETIME NULL,
    attachedDocumentIsExpired BOOLEAN NOT NULL DEFAULT FALSE,    -- Was the doc expired at snapshot time?
    attachedDocumentAcceptanceReason VARCHAR(255) NULL,
    documentVersion INT NOT NULL DEFAULT 1,                      -- Version number at snapshot time

    INDEX idx_history_owner (ownerType, ownerUniqueId),          -- Fast owner history lookup
    INDEX idx_history_documentTypeId (documentTypeId),
    FOREIGN KEY (documentTypeId) REFERENCES DocumentTypes(documentTypeId)
)  ;`;
