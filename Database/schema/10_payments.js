"use strict";

// payments
// Tables: PaymentMethod, PaymentStatus, JourneyPayments
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 940-1000). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `
 
-- Create the PaymentMethod table

CREATE TABLE IF NOT EXISTS PaymentMethod (
    paymentMethodId INT AUTO_INCREMENT PRIMARY KEY,
    paymentMethodUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for payment method
    paymentMethod VARCHAR(50) NOT NULL,  -- Name of the payment method (e.g., on cash, by bank, by tele birr)
    paymentMethodCreatedBy VARCHAR(36) NOT NULL,  -- Who created the payment method
    paymentMethodUpdatedBy VARCHAR(36) NULL,  -- Who updated the payment method
    paymentMethodDeletedBy VARCHAR(36) NULL,  -- Who deleted the payment method
    paymentMethodCreatedAt DATETIME NOT NULL,  -- Creation time of the payment method
    paymentMethodUpdatedAt DATETIME NULL,  -- When the payment method was updated
    paymentMethodDeletedAt DATETIME NULL,  -- When the payment method was deleted
    FOREIGN KEY (paymentMethodCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (paymentMethodUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (paymentMethodDeletedBy) REFERENCES Users(userUniqueId)
) ;  

 -- Create the PaymentStatus table

CREATE TABLE IF NOT EXISTS PaymentStatus (
    paymentStatusId INT AUTO_INCREMENT PRIMARY KEY,
    paymentStatusUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for payment status
    paymentStatus VARCHAR(50) UNIQUE NOT NULL,  -- Payment status (e.g., Pending, Completed, Failed)
    paymentStatusCreatedAt DATETIME NOT NULL,  -- Creation time of the payment status
    paymentStatusUpdatedBy VARCHAR(36) NULL,  -- Who updated the payment status
    paymentStatusUpdatedAt DATETIME NULL,  -- When the payment status was updated
    paymentStatusDeletedBy VARCHAR(36) NULL,  -- Who deleted the payment status
    paymentStatusDeletedAt DATETIME NULL,  -- Deletion time of the payment status
    FOREIGN KEY (paymentStatusUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (paymentStatusDeletedBy) REFERENCES Users(userUniqueId)
) ;


-- Create the JourneyPayments table where shipper pays to driver for journey service

CREATE TABLE IF NOT EXISTS JourneyPayments (
    paymentId INT AUTO_INCREMENT PRIMARY KEY,
    paymentUniqueId VARCHAR(36) UNIQUE NOT NULL,  -- UUID for payment
    journeyDecisionUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to JourneyDecisions
    amount DECIMAL(10, 2) NOT NULL,  -- Payment amount
    paymentMethodUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to PaymentMethod
    paymentStatusUniqueId VARCHAR(36) NOT NULL,  -- Foreign key to PaymentStatus
    paymentTime TIMESTAMP NOT NULL,  -- Time of payment
    journeyPaymentCreatedBy VARCHAR(36) NOT NULL,  -- Who created the payment
    journeyPaymentUpdatedBy VARCHAR(36) NULL,  -- Who updated the payment
    journeyPaymentDeletedBy VARCHAR(36) NULL,  -- Who deleted the payment
    journeyPaymentCreatedAt DATETIME NOT NULL,  -- When the payment was created
    journeyPaymentUpdatedAt DATETIME NULL,  -- When the payment was updated
    journeyPaymentDeletedAt DATETIME NULL,  -- When the payment was deleted
    
    FOREIGN KEY (journeyDecisionUniqueId) REFERENCES JourneyDecisions(journeyDecisionUniqueId),
    FOREIGN KEY (paymentMethodUniqueId) REFERENCES PaymentMethod(paymentMethodUniqueId),
    FOREIGN KEY (paymentStatusUniqueId) REFERENCES PaymentStatus(paymentStatusUniqueId),
    FOREIGN KEY (journeyPaymentCreatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyPaymentUpdatedBy) REFERENCES Users(userUniqueId),
    FOREIGN KEY (journeyPaymentDeletedBy) REFERENCES Users(userUniqueId),
    
    INDEX idx_journeyPayments_journeyDecision (journeyDecisionUniqueId),
    INDEX idx_journeyPayments_paymentTime (paymentTime)
) ;`;
