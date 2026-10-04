"use strict";

// finance
// Tables: DepositSource, FinancialInstitutionAccounts, UserDeposit, UserBalanceTransfer, UserRefund, UserBalance
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 1199-1363). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `



-- driver deposit table lists


--   Master table for deposit sources (enum replacement)
CREATE TABLE IF NOT EXISTS DepositSource (
  depositSourceId INT AUTO_INCREMENT PRIMARY KEY,
  depositSourceUniqueId VARCHAR(36) NOT NULL UNIQUE,  -- UUID
  sourceKey VARCHAR(50) NOT NULL UNIQUE,              -- e.g., 'driver', 'bonus'
  sourceLabel VARCHAR(100) NOT NULL,                  -- e.g., 'Paid by Driver'
  depositSourceCreatedBy VARCHAR(36) NOT NULL,  -- Who created the deposit source
  depositSourceUpdatedBy VARCHAR(36) NULL,  -- Who updated the deposit source
  depositSourceDeletedBy VARCHAR(36) NULL,  -- Who deleted the deposit source
  depositSourceCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,  -- When the deposit source was created
  depositSourceUpdatedAt DATETIME NULL,  -- When the deposit source was updated
  depositSourceDeletedAt DATETIME NULL,  -- When the deposit source was deleted
  FOREIGN KEY (depositSourceCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (depositSourceUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (depositSourceDeletedBy) REFERENCES Users(userUniqueId)
);


-- Seed initial deposit sources
-- INSERT INTO DepositSource (sourceKey, sourceLabel) VALUES
  -- ('driver', 'Paid by Driver'),
  -- ('bonus', 'Referral Bonus'),
  -- ('admin', 'Manual Admin Deposit'),
  -- ('transfer', 'Transferred from Another Driver');

CREATE TABLE IF NOT EXISTS FinancialInstitutionAccounts (
  accountId INT AUTO_INCREMENT PRIMARY KEY,
  accountUniqueId VARCHAR(36) UNIQUE NOT NULL, -- UUID
  institutionName VARCHAR(100) NOT NULL,       -- e.g., 'Telebirr', 'CBE'
  accountHolderName VARCHAR(100) NOT NULL,     -- Person or entity name
  accountNumber VARCHAR(50) NOT NULL,          -- The actual account number
  accountType ENUM('bank', 'mobile_money', 'wallet') DEFAULT 'bank', -- optional
  isActive BOOLEAN DEFAULT TRUE,               -- To mark active/inactive accounts
  addedBy VARCHAR(36),                         -- admin or system user ID
  financialInstitutionAccountsCreatedBy VARCHAR(36) NOT NULL,  -- Who created the account
  financialInstitutionAccountUpdatedBy VARCHAR(36) NULL,  -- Who updated the account
  financialInstitutionAccountDeletedBy VARCHAR(36) NULL,  -- Who deleted the account
  financialInstitutionAccountsCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,  -- When the account was created
  financialInstitutionAccountsUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- When the account was updated
  financialInstitutionAccountDeletedAt DATETIME NULL,  -- When the account was deleted
  FOREIGN KEY (addedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (financialInstitutionAccountsCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (financialInstitutionAccountUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (financialInstitutionAccountDeletedBy) REFERENCES Users(userUniqueId)
);
--  Main table representing driver subscriptions via deposits
CREATE TABLE IF NOT EXISTS UserDeposit (
  userDepositId INT AUTO_INCREMENT PRIMARY KEY,
  userDepositUniqueId VARCHAR(36) NOT NULL UNIQUE,
  driverUniqueId VARCHAR(36) NOT NULL,
  depositAmount DOUBLE NOT NULL,
  depositSourceUniqueId VARCHAR(36) NOT NULL,
  accountUniqueId varchar(36) null, 
  depositStatus enum('requested','approved','rejected','FAILED','PENDING','COMPLETED') default "requested",
  depositURL text NOT NULL,
  depositTime DATETIME NOT NULL,
  acceptRejectReason VARCHAR(2000),
  userDepositCreatedBy VARCHAR(36) NOT NULL,  -- Who created the driver deposit
  userDepositUpdatedBy VARCHAR(36) NULL,  -- Who updated the driver deposit
  userDepositDeletedBy VARCHAR(36) NULL,  -- Who deleted the driver deposit
  userDepositCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  userDepositUpdatedAt DATETIME NULL,  -- When the driver deposit was updated
  userDepositDeletedAt DATETIME NULL,  -- When the driver deposit was deleted

  FOREIGN KEY (accountUniqueId) REFERENCES FinancialInstitutionAccounts(accountUniqueId),
  
  FOREIGN KEY (driverUniqueId) REFERENCES Users(userUniqueId),
  FOREIGN KEY (depositSourceUniqueId) REFERENCES DepositSource(depositSourceUniqueId),
  FOREIGN KEY (userDepositCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userDepositUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userDepositDeletedBy) REFERENCES Users(userUniqueId)
);
 
 

-- . Logs any deposit transferred from one driver to another
CREATE TABLE IF NOT EXISTS UserBalanceTransfer (
  depositTransferId INT AUTO_INCREMENT PRIMARY KEY,
  depositTransferUniqueId VARCHAR(36) NOT NULL UNIQUE,
  fromDriverUniqueId VARCHAR(36) NOT NULL,
  toDriverUniqueId VARCHAR(36) NOT NULL,
  transferredAmount DECIMAL(10, 2) NOT NULL,
  reason TEXT,
  transferTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  transferredBy VARCHAR(36),
  userBalanceTransferCreatedBy VARCHAR(36) NOT NULL,  -- Who created the transfer
  userBalanceTransferUpdatedBy VARCHAR(36) NULL,  -- Who updated the transfer
  userBalanceTransferDeletedBy VARCHAR(36) NULL,  -- Who deleted the transfer
  userBalanceTransferCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  userBalanceTransferUpdatedAt DATETIME NULL,  -- When the transfer was updated
  userBalanceTransferDeletedAt DATETIME NULL,  -- When the transfer was deleted
  FOREIGN KEY (fromDriverUniqueId) REFERENCES Users(userUniqueId),
  FOREIGN KEY (toDriverUniqueId) REFERENCES Users(userUniqueId),
  FOREIGN KEY (transferredBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userBalanceTransferCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userBalanceTransferUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userBalanceTransferDeletedBy) REFERENCES Users(userUniqueId)
);

-- UserRefund can be used to give back users money from ride hailing account (drivers, shippers, etc.)
CREATE TABLE IF NOT EXISTS UserRefund (
  userRefundId INT AUTO_INCREMENT PRIMARY KEY, -- Auto-incremented unique identifier for each refund record

  userRefundUniqueId VARCHAR(36) NOT NULL UNIQUE, -- UUID used to uniquely identify each refund transaction across systems

  userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key referencing the user receiving the refund (from Users.userUniqueId)

  refundAmount DECIMAL(10, 2) NOT NULL CHECK (refundAmount > 0), -- Amount of money refunded to the user (must be greater than 0)

  refundReason TEXT, -- Optional explanation or reason for issuing the refund

  refundedBy VARCHAR(36), -- UUID of the admin or system user who approved or issued the refund

  refundStatus ENUM('requested','approved') NOT NULL  DEFAULT 'requested', -- Status of the refund: either 'requested' (pending) or 'approved'

  accountUniqueId VARCHAR(36),   -- Financial account (institution) where the refund is deposited (FK to FinancialInstitutionAccounts)

  refundUrl TEXT,   -- ✅ Receipt or proof document URL sent to the institution upon refund approval

  refundDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Date and time when the refund was issued or logged

  userRefundCreatedBy VARCHAR(36) NOT NULL,  -- Who created the refund
  userRefundUpdatedBy VARCHAR(36) NULL,  -- Who updated the refund
  userRefundDeletedBy VARCHAR(36) NULL,  -- Who deleted the refund
  userRefundCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,  -- Timestamp when the refund record was created
  userRefundUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- Timestamp that auto-updates when the row is modified
  userRefundDeletedAt DATETIME NULL,  -- When the refund was deleted

  FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
  FOREIGN KEY (accountUniqueId) REFERENCES FinancialInstitutionAccounts(accountUniqueId),
  FOREIGN KEY (refundedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userRefundCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userRefundUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userRefundDeletedBy) REFERENCES Users(userUniqueId)
);


-- a table to store drivers balance after Commission to payment or deposit

CREATE TABLE IF NOT EXISTS UserBalance (
    userBalanceId INT AUTO_INCREMENT PRIMARY KEY,
    userBalanceUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for driver balance
    userUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to Users driver
    transactionType enum('Deposit', 'Commission','Transfer','Refund','Subscription',"freeGift") NOT NULL,  -- Type of transaction
    transactionUniqueId VARCHAR(36) NOT NULL,  -- UUID for 'Deposit', 'Commission','Transfer','Refund','Subscription'
    transactionTime DATETIME NOT NULL,  -- Time of transaction
    userBalanceAdjustmentType enum('reversal','adjustment', 'creation') NOT NULL,  -- Type of adjustment for user balance
    netBalance DECIMAL(10, 2) NOT NULL,  -- Balance which is previous balance + (deposit or - Commission)
    userBalanceCreatedBy VARCHAR(36) NOT NULL,  -- Who created the driver balance
    userBalanceUpdatedBy VARCHAR(36) NULL,  -- Who updated the driver balance
    userBalanceDeletedBy VARCHAR(36) NULL,  -- Who deleted the driver balance
    userBalanceCreatedAt DATETIME NOT NULL,  -- When the driver balance was created
    userBalanceUpdatedAt DATETIME NULL,  -- When the driver balance was updated
    userBalanceDeletedAt DATETIME NULL,  -- When the driver balance was deleted
    FOREIGN KEY (userUniqueId) REFERENCES Users(userUniqueId),
    FOREIGN KEY (userBalanceCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (userBalanceUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (userBalanceDeletedBy) REFERENCES Users(userUniqueId)
) ; `;
