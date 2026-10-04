"use strict";

// DriverQueueHistory - immutable SNAPSHOT audit trail for DriverQueue.
//
// Verbatim from the former Database/Database.js `driverQueueHistoryDdl`
// (original lines 14-50).
//
// Exported SEPARATELY as well as interpolated into slice 21, because
// ensureDriverQueueHistorySnapshotShape() in
// Services/Database/tableManage.service.js DROPs and re-creates this table to
// migrate it off the old columnName/oldValue/newValue pivot.
module.exports = `
CREATE TABLE IF NOT EXISTS DriverQueueHistory (
    historyId INT AUTO_INCREMENT PRIMARY KEY,
    historyUniqueId VARCHAR(36) UNIQUE NOT NULL,
    historyEvent VARCHAR(50) NOT NULL,                        -- what happened (checkin/recheckin/checkout/offer/accept/...)
    -- ── snapshot — mirrors every DriverQueue column (equal column number) ──
    queueId INT NULL,
    queueUniqueId VARCHAR(36) NOT NULL,                       -- FK → DriverQueue (entry affected)
    queueOrganizationUniqueId VARCHAR(36) NULL,
    queueDate DATE NULL,
    queueNumber INT NULL,
    queueRefusalCount INT NULL,
    vehicleDriverUniqueId VARCHAR(36) NULL,
    shipperRequestUniqueId VARCHAR(36) NULL,
    targetedShipperUserUUID VARCHAR(36) NULL,
    driverLatitude DECIMAL(10, 8) NULL,
    driverLongitude DECIMAL(11, 8) NULL,
    joinedAt DATETIME NULL,
    status INT NULL,
    requestedAt DATETIME NULL,
    agreedAt DATETIME NULL,
    loadingOrderNumber INT NULL,                              -- yard entrance number (write-once at AGREED; continuous sequence per org+date)
    queueCreatedAt DATETIME NULL,
    queueCreatedBy VARCHAR(36) NULL,
    queueUpdatedAt DATETIME NULL,
    queueUpdatedBy VARCHAR(36) NULL,
    queueDeletedAt DATETIME NULL,
    queueDeletedBy VARCHAR(36) NULL,
    -- ── audit provenance ──
    performedBy VARCHAR(36) NULL,                             -- FK → Users (who made the change)
    performedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dqh_org_date (queueOrganizationUniqueId, queueDate),
    INDEX idx_dqh_queue (queueUniqueId),
    INDEX idx_dqh_event (historyEvent),
    INDEX idx_dqh_performedAt (performedAt),
    FOREIGN KEY (queueUniqueId) REFERENCES DriverQueue(queueUniqueId),
    FOREIGN KEY (performedBy) REFERENCES Users(userUniqueId)
);`;
