"use strict";

// subscriptions
// Tables: SubscriptionPlan, SubscriptionPlanPricing, UserSubscription
//
// Verbatim contiguous slice of the former Database/Database.js `sqlQuery`
// (original lines 1133-1198). It stays at this index because the
// whole schema runs as ONE `multipleStatements` batch and FK parents must
// precede their children - see ./index.js.
module.exports = `



CREATE TABLE IF NOT EXISTS SubscriptionPlan (
  subscriptionPlanId INT AUTO_INCREMENT PRIMARY KEY,
  subscriptionPlanUniqueId VARCHAR(36) NOT NULL UNIQUE,
  planName VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  isFree BOOLEAN DEFAULT FALSE,
  durationInDays INT NOT NULL,
  subscriptionPlanCreatedBy VARCHAR(36) NOT NULL,  -- Who created the subscription plan
  subscriptionPlanUpdatedBy VARCHAR(36) NULL,  -- Who updated the subscription plan
  subscriptionPlanDeletedBy VARCHAR(36) NULL,  -- Who deleted the subscription plan
  subscriptionPlanCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,  -- When the subscription plan was created
  subscriptionPlanUpdatedAt DATETIME NULL,  -- When the subscription plan was updated
  subscriptionPlanDeletedAt DATETIME NULL,  -- When the subscription plan was deleted
  FOREIGN KEY (subscriptionPlanCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (subscriptionPlanUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (subscriptionPlanDeletedBy) REFERENCES Users(userUniqueId)
);


--  Pricing for Subscription Plan Dynamic by effective date

CREATE TABLE IF NOT EXISTS SubscriptionPlanPricing (
  pricingId INT AUTO_INCREMENT PRIMARY KEY,
  subscriptionPlanPricingUniqueId VARCHAR(36) NOT NULL UNIQUE,
  subscriptionPlanUniqueId VARCHAR(36) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  effectiveFrom DATE NOT NULL,
  effectiveTo DATE NULL,
  subscriptionPlanPricingCreatedBy VARCHAR(36) NOT NULL,  -- Who created the pricing
  subscriptionPlanPricingUpdatedBy VARCHAR(36) NULL,  -- Who updated the pricing
  subscriptionPlanPricingDeletedBy VARCHAR(36) NULL,  -- Who deleted the pricing
  subscriptionPlanPricingCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,  -- When the pricing was created
  subscriptionPlanPricingUpdatedAt DATETIME NULL,  -- When the pricing was updated
  subscriptionPlanPricingDeletedAt DATETIME NULL,  -- When the pricing was deleted
  FOREIGN KEY (subscriptionPlanUniqueId) REFERENCES SubscriptionPlan(subscriptionPlanUniqueId),
  FOREIGN KEY (subscriptionPlanPricingCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (subscriptionPlanPricingUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (subscriptionPlanPricingDeletedBy) REFERENCES Users(userUniqueId)
);

-- subscription to driver 

CREATE TABLE IF NOT EXISTS UserSubscription (
  userSubscriptionId INT AUTO_INCREMENT PRIMARY KEY,
  userSubscriptionUniqueId VARCHAR(36) NOT NULL UNIQUE,
  driverUniqueId VARCHAR(36) NOT NULL,
  -- subscriptionPlanUniqueId varchar(36) NOT NULL,
  subscriptionPlanPricingUniqueId VARCHAR(36) NOT NULL,  -- Exact pricing tier at time of subscription
  startDate DATETIME NOT NULL,
  endDate DATETIME NOT NULL,
  userSubscriptionCreatedBy VARCHAR(36) NOT NULL,  -- Who created the driver subscription
  userSubscriptionUpdatedBy VARCHAR(36) NULL,  -- Who updated the driver subscription
  userSubscriptionDeletedBy VARCHAR(36) NULL,  -- Who deleted the driver subscription
  userSubscriptionCreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  userSubscriptionUpdatedAt DATETIME NULL,  -- When the driver subscription was updated
  userSubscriptionDeletedAt DATETIME NULL,  -- When the driver subscription was deleted
  FOREIGN KEY (driverUniqueId) REFERENCES Users(userUniqueId),
  -- FOREIGN KEY (subscriptionPlanUniqueId) REFERENCES SubscriptionPlan(subscriptionPlanUniqueId),
  FOREIGN KEY (subscriptionPlanPricingUniqueId) REFERENCES SubscriptionPlanPricing(subscriptionPlanPricingUniqueId),
  FOREIGN KEY (userSubscriptionCreatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userSubscriptionUpdatedBy) REFERENCES Users(userUniqueId),
  FOREIGN KEY (userSubscriptionDeletedBy) REFERENCES Users(userUniqueId)
);`;
