"use strict";

// Auto-generated history tables — one full-column snapshot table per tracked
// entity. Each row mirrors a source row BEFORE a mutation (UPDATE/DELETE) plus
// changeType, changedByUserId and a monotonic <entity>Version. Reconstruct any
// transition by diffing a snapshot row with the next (or the live row).
// NOTE: no FOREIGN KEY on the source row on purpose — these are immutable audit
// rows that must survive hard deletion of the source row they reference.

const historyTablesDdl = `
CREATE TABLE IF NOT EXISTS \`RolesHistory\` (
    \`roleHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`roleHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`roleId\` int NOT NULL,
    \`roleUniqueId\` varchar(36) NOT NULL,
    \`roleName\` varchar(50) NOT NULL,
    \`roleDescription\` varchar(255) DEFAULT NULL,
    \`roleCreatedBy\` varchar(36) NOT NULL,
    \`roleUpdatedBy\` varchar(36) DEFAULT NULL,
    \`roleUpdatedAt\` datetime DEFAULT NULL,
    \`roleDeletedBy\` varchar(36) DEFAULT NULL,
    \`roleCreatedAt\` datetime NOT NULL,
    \`roleDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`roleVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_roleHistory_source (roleId),
    INDEX idx_roleHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`JourneyStatusHistory\` (
    \`journeyStatusHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`journeyStatusHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`journeyStatusId\` int NOT NULL,
    \`journeyStatusUniqueId\` varchar(36) NOT NULL,
    \`journeyStatusName\` varchar(50) NOT NULL,
    \`journeyStatusDescription\` varchar(2255) DEFAULT NULL,
    \`journeyStatusCreatedBy\` varchar(36) NOT NULL,
    \`journeyStatusUpdatedBy\` varchar(36) DEFAULT NULL,
    \`journeyStatusDeletedBy\` varchar(36) DEFAULT NULL,
    \`journeyStatusCreatedAt\` datetime NOT NULL,
    \`journeyStatusUpdatedAt\` datetime DEFAULT NULL,
    \`journeyStatusDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`journeyStatusVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_journeyStatusHistory_source (journeyStatusId),
    INDEX idx_journeyStatusHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`VehicleStatusHistory\` (
    \`vehicleStatusHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`vehicleStatusHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`vehicleStatusId\` int NOT NULL,
    \`vehicleStatusUniqueId\` varchar(36) NOT NULL,
    \`vehicleUniqueId\` varchar(36) NOT NULL,
    \`VehicleStatusTypeId\` int NOT NULL,
    \`statusStartDate\` datetime NOT NULL,
    \`statusEndDate\` datetime DEFAULT NULL,
    \`vehicleStatusCreatedBy\` varchar(36) NOT NULL,
    \`vehicleStatusUpdatedBy\` varchar(36) DEFAULT NULL,
    \`vehicleStatusDeletedBy\` varchar(36) DEFAULT NULL,
    \`vehicleStatusCreatedAt\` datetime NOT NULL,
    \`vehicleStatusUpdatedAt\` datetime DEFAULT NULL,
    \`vehicleStatusDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`vehicleStatusVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_vehicleStatusHistory_source (vehicleStatusId),
    INDEX idx_vehicleStatusHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`VehicleStatusTypesHistory\` (
    \`vehicleStatusTypeHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`vehicleStatusTypeHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`VehicleStatusTypeId\` int NOT NULL,
    \`VehicleStatusTypeUniqueId\` varchar(36) NOT NULL,
    \`VehicleStatusTypeName\` varchar(50) NOT NULL,
    \`VehicleStatusTypeDescription\` varchar(255) DEFAULT NULL,
    \`VehicleStatusTypeCreatedBy\` varchar(36) NOT NULL,
    \`VehicleStatusTypeUpdatedBy\` varchar(36) DEFAULT NULL,
    \`VehicleStatusTypeUpdatedAt\` datetime DEFAULT NULL,
    \`VehicleStatusTypeDeletedBy\` varchar(36) DEFAULT NULL,
    \`VehicleStatusTypeDeletedAt\` datetime DEFAULT NULL,
    \`VehicleStatusTypeCreatedAt\` datetime NOT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`vehicleStatusTypeVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_vehicleStatusTypeHistory_source (VehicleStatusTypeId),
    INDEX idx_vehicleStatusTypeHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`StatusesHistory\` (
    \`statusHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`statusHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`statusId\` int NOT NULL,
    \`statusUniqueId\` varchar(36) NOT NULL,
    \`statusName\` varchar(150) NOT NULL,
    \`statusDescription\` varchar(255) DEFAULT NULL,
    \`statusCreatedBy\` varchar(36) NOT NULL,
    \`statusUpdatedBy\` varchar(36) DEFAULT NULL,
    \`statusUpdatedAt\` datetime DEFAULT NULL,
    \`statusDeletedBy\` varchar(36) DEFAULT NULL,
    \`statusDeletedAt\` datetime DEFAULT NULL,
    \`statusCreatedAt\` datetime NOT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`statusVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_statusHistory_source (statusId),
    INDEX idx_statusHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`DelinquencyTypesHistory\` (
    \`delinquencyTypeHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`delinquencyTypeHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`delinquencyTypeId\` int NOT NULL,
    \`delinquencyTypeUniqueId\` varchar(36) NOT NULL,
    \`delinquencyTypeName\` varchar(50) NOT NULL,
    \`delinquencyTypeDescription\` text NOT NULL,
    \`defaultPoints\` int NOT NULL DEFAULT '1',
    \`defaultSeverity\` enum('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    \`applicableRoles\` varchar(36) NOT NULL,
    \`isActive\` tinyint(1) NOT NULL DEFAULT '1',
    \`delinquencyTypeCreatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`delinquencyTypeCreatedBy\` varchar(36) NOT NULL,
    \`delinquencyTypeUpdatedAt\` datetime DEFAULT NULL,
    \`delinquencyTypeUpdatedBy\` varchar(36) DEFAULT NULL,
    \`delinquencyTypeDeletedAt\` datetime DEFAULT NULL,
    \`delinquencyTypeDeletedBy\` varchar(36) DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`delinquencyTypeVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_delinquencyTypeHistory_source (delinquencyTypeId),
    INDEX idx_delinquencyTypeHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`CancellationReasonsTypeHistory\` (
    \`cancellationReasonsTypeHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`cancellationReasonsTypeHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`cancellationReasonsTypeId\` int NOT NULL,
    \`cancellationReasonTypeUniqueId\` varchar(36) NOT NULL,
    \`cancellationReason\` varchar(150) NOT NULL,
    \`roleId\` int NOT NULL,
    \`requestMode\` enum('individual','company','both') NOT NULL DEFAULT 'both',
    \`cancellationReasonTypeCreatedBy\` varchar(36) NOT NULL,
    \`cancellationReasonTypeUpdatedBy\` varchar(36) DEFAULT NULL,
    \`cancellationReasonTypeDeletedBy\` varchar(36) DEFAULT NULL,
    \`cancellationReasonTypeCreatedAt\` datetime NOT NULL,
    \`cancellationReasonTypeUpdatedAt\` datetime DEFAULT NULL,
    \`cancellationReasonTypeDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`cancellationReasonsTypeVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_cancellationReasonsTypeHistory_source (cancellationReasonsTypeId),
    INDEX idx_cancellationReasonsTypeHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`PaymentMethodHistory\` (
    \`paymentMethodHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`paymentMethodHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`paymentMethodId\` int NOT NULL,
    \`paymentMethodUniqueId\` varchar(36) NOT NULL,
    \`paymentMethod\` varchar(50) NOT NULL,
    \`paymentMethodCreatedBy\` varchar(36) NOT NULL,
    \`paymentMethodUpdatedBy\` varchar(36) DEFAULT NULL,
    \`paymentMethodDeletedBy\` varchar(36) DEFAULT NULL,
    \`paymentMethodCreatedAt\` datetime NOT NULL,
    \`paymentMethodUpdatedAt\` datetime DEFAULT NULL,
    \`paymentMethodDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`paymentMethodVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_paymentMethodHistory_source (paymentMethodId),
    INDEX idx_paymentMethodHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`PaymentStatusHistory\` (
    \`paymentStatusHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`paymentStatusHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`paymentStatusId\` int NOT NULL,
    \`paymentStatusUniqueId\` varchar(36) NOT NULL,
    \`paymentStatus\` varchar(50) NOT NULL,
    \`paymentStatusCreatedAt\` datetime NOT NULL,
    \`paymentStatusUpdatedBy\` varchar(36) DEFAULT NULL,
    \`paymentStatusUpdatedAt\` datetime DEFAULT NULL,
    \`paymentStatusDeletedBy\` varchar(36) DEFAULT NULL,
    \`paymentStatusDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`paymentStatusVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_paymentStatusHistory_source (paymentStatusId),
    INDEX idx_paymentStatusHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`DepositSourceHistory\` (
    \`depositSourceHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`depositSourceHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`depositSourceId\` int NOT NULL,
    \`depositSourceUniqueId\` varchar(36) NOT NULL,
    \`sourceKey\` varchar(50) NOT NULL,
    \`sourceLabel\` varchar(100) NOT NULL,
    \`depositSourceCreatedBy\` varchar(36) NOT NULL,
    \`depositSourceUpdatedBy\` varchar(36) DEFAULT NULL,
    \`depositSourceDeletedBy\` varchar(36) DEFAULT NULL,
    \`depositSourceCreatedAt\` datetime DEFAULT CURRENT_TIMESTAMP,
    \`depositSourceUpdatedAt\` datetime DEFAULT NULL,
    \`depositSourceDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`depositSourceVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_depositSourceHistory_source (depositSourceId),
    INDEX idx_depositSourceHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`CommissionRatesHistory\` (
    \`commissionRateHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`commissionRateHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`commissionRateId\` int NOT NULL,
    \`commissionRateUniqueId\` varchar(36) NOT NULL,
    \`commissionRate\` decimal(5,2) NOT NULL,
    \`commissionRateEffectiveDate\` date NOT NULL,
    \`commissionRateExpirationDate\` date NOT NULL,
    \`commissionRateCreatedAt\` datetime DEFAULT CURRENT_TIMESTAMP,
    \`commissionRateUpdatedAt\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    \`commissionRateDeletedAt\` datetime DEFAULT NULL,
    \`commissionRateCreatedBy\` varchar(36) NOT NULL,
    \`commissionRateUpdatedBy\` varchar(36) DEFAULT NULL,
    \`commissionRateDeletedBy\` varchar(36) DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`commissionRateVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_commissionRateHistory_source (commissionRateId),
    INDEX idx_commissionRateHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`CompanyRolesHistory\` (
    \`companyRoleHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`companyRoleHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`companyRoleId\` int NOT NULL,
    \`companyRoleUniqueId\` varchar(36) NOT NULL,
    \`companyRoleName\` varchar(50) NOT NULL,
    \`companyRoleDescription\` text NULL,
    \`companyRoleCreatedBy\` varchar(36) NOT NULL,
    \`companyRoleUpdatedBy\` varchar(36) DEFAULT NULL,
    \`companyRoleDeletedBy\` varchar(36) DEFAULT NULL,
    \`companyRoleCreatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`companyRoleUpdatedAt\` datetime DEFAULT NULL,
    \`companyRoleDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`companyRoleVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_companyRoleHistory_source (companyRoleId),
    INDEX idx_companyRoleHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`VehicleHistory\` (
    \`vehicleHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`vehicleHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`vehicleId\` int NOT NULL,
    \`vehicleUniqueId\` varchar(36) NOT NULL,
    \`vehicleTypeUniqueId\` varchar(36) NOT NULL,
    \`licensePlate\` varchar(50) NOT NULL,
    \`color\` varchar(50) NOT NULL,
    \`vehicleCreatedBy\` varchar(36) NOT NULL,
    \`vehicleUpdatedBy\` varchar(36) DEFAULT NULL,
    \`vehicleUpdatedAt\` datetime DEFAULT NULL,
    \`vehicleDeletedBy\` varchar(36) DEFAULT NULL,
    \`vehicleCreatedAt\` datetime NOT NULL,
    \`vehicleDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`vehicleVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_vehicleHistory_source (vehicleId),
    INDEX idx_vehicleHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`CompanyVehicleHistory\` (
    \`companyVehicleHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`companyVehicleHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`companyVehicleId\` int NOT NULL,
    \`companyVehicleUniqueId\` varchar(36) NOT NULL,
    \`companyUniqueId\` varchar(36) NOT NULL,
    \`vehicleUniqueId\` varchar(36) NOT NULL,
    \`assignmentStatus\` enum('active','inactive') NOT NULL DEFAULT 'active',
    \`assignmentStartDate\` datetime NOT NULL,
    \`assignmentEndDate\` datetime DEFAULT NULL,
    \`companyVehicleCreatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`companyVehicleCreatedBy\` varchar(36) NOT NULL,
    \`companyVehicleUpdatedAt\` datetime DEFAULT NULL,
    \`companyVehicleUpdatedBy\` varchar(36) DEFAULT NULL,
    \`companyVehicleDeletedAt\` datetime DEFAULT NULL,
    \`companyVehicleDeletedBy\` varchar(36) DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`companyVehicleVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_companyVehicleHistory_source (companyVehicleId),
    INDEX idx_companyVehicleHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`VehicleDriverHistory\` (
    \`vehicleDriverHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`vehicleDriverHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`vehicleDriverId\` int NOT NULL,
    \`vehicleDriverUniqueId\` varchar(36) NOT NULL,
    \`vehicleUniqueId\` varchar(36) NOT NULL,
    \`driverUserUniqueId\` varchar(36) NOT NULL,
    \`assignmentStatus\` enum('active','inactive') NOT NULL DEFAULT 'active',
    \`assignmentStartDate\` datetime NOT NULL,
    \`assignmentEndDate\` datetime DEFAULT NULL,
    \`vehicleDriverCreatedBy\` varchar(36) NOT NULL,
    \`vehicleDriverUpdatedBy\` varchar(36) DEFAULT NULL,
    \`vehicleDriverDeletedBy\` varchar(36) DEFAULT NULL,
    \`vehicleDriverCreatedAt\` datetime DEFAULT CURRENT_TIMESTAMP,
    \`vehicleDriverUpdatedAt\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    \`vehicleDriverDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`vehicleDriverVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_vehicleDriverHistory_source (vehicleDriverId),
    INDEX idx_vehicleDriverHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`CompanyMembershipHistory\` (
    \`companyMembershipHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`companyMembershipHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`membershipId\` int NOT NULL,
    \`membershipUniqueId\` varchar(36) NOT NULL,
    \`companyUniqueId\` varchar(36) NOT NULL,
    \`userUniqueId\` varchar(36) NOT NULL,
    \`companyRoleUniqueId\` varchar(36) NOT NULL,
    \`isActive\` tinyint(1) NOT NULL DEFAULT '1',
    \`membershipStartDate\` datetime NOT NULL,
    \`membershipEndDate\` datetime DEFAULT NULL,
    \`membershipCreatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`membershipCreatedBy\` varchar(36) NOT NULL,
    \`membershipUpdatedAt\` datetime DEFAULT NULL,
    \`membershipUpdatedBy\` varchar(36) DEFAULT NULL,
    \`membershipDeletedAt\` datetime DEFAULT NULL,
    \`membershipDeletedBy\` varchar(36) DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`companyMembershipVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_companyMembershipHistory_source (membershipId),
    INDEX idx_companyMembershipHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`TariffRateForVehicleTypesHistory\` (
    \`tariffRateForVehicleTypeHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`tariffRateForVehicleTypeHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`tariffRateForVehicleTypeId\` int NOT NULL,
    \`tariffRateForVehicleTypeUniqueId\` varchar(36) NOT NULL,
    \`vehicleTypeUniqueId\` varchar(36) NOT NULL,
    \`tariffRateUniqueId\` varchar(36) NOT NULL,
    \`tariffRateForVehicleTypeCreatedBy\` varchar(36) NOT NULL,
    \`tariffRateForVehicleTypeUpdatedBy\` varchar(36) DEFAULT NULL,
    \`tariffRateForVehicleTypeDeletedBy\` varchar(36) DEFAULT NULL,
    \`tariffRateForVehicleTypeCreatedAt\` datetime NOT NULL,
    \`tariffRateForVehicleTypeUpdatedAt\` datetime DEFAULT NULL,
    \`tariffRateForVehicleTypeDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`tariffRateForVehicleTypeVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_tariffRateForVehicleTypeHistory_source (tariffRateForVehicleTypeId),
    INDEX idx_tariffRateForVehicleTypeHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`TariffRateHistory\` (
    \`tariffRateHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`tariffRateHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`tariffRateId\` int NOT NULL,
    \`tariffRateUniqueId\` varchar(36) NOT NULL,
    \`tariffRateName\` varchar(255) NOT NULL,
    \`standingTariffRate\` decimal(10,2) NOT NULL,
    \`journeyTariffRate\` decimal(10,2) NOT NULL,
    \`timingTariffRate\` decimal(10,2) NOT NULL,
    \`tariffRateEffectiveDate\` date NOT NULL,
    \`tariffRateExpirationDate\` date NOT NULL,
    \`tariffRateDescription\` text NOT NULL,
    \`tariffRateCreatedBy\` varchar(36) NOT NULL,
    \`tariffRateUpdatedBy\` varchar(36) DEFAULT NULL,
    \`tariffRateDeletedBy\` varchar(36) DEFAULT NULL,
    \`tariffRateCreatedAt\` datetime NOT NULL,
    \`tariffRateUpdatedAt\` datetime DEFAULT NULL,
    \`tariffRateDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`tariffRateVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_tariffRateHistory_source (tariffRateId),
    INDEX idx_tariffRateHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`SubscriptionPlanHistory\` (
    \`subscriptionPlanHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`subscriptionPlanHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`subscriptionPlanId\` int NOT NULL,
    \`subscriptionPlanUniqueId\` varchar(36) NOT NULL,
    \`planName\` varchar(100) NOT NULL,
    \`description\` text NULL,
    \`isFree\` tinyint(1) DEFAULT '0',
    \`durationInDays\` int NOT NULL,
    \`subscriptionPlanCreatedBy\` varchar(36) NOT NULL,
    \`subscriptionPlanUpdatedBy\` varchar(36) DEFAULT NULL,
    \`subscriptionPlanDeletedBy\` varchar(36) DEFAULT NULL,
    \`subscriptionPlanCreatedAt\` datetime DEFAULT CURRENT_TIMESTAMP,
    \`subscriptionPlanUpdatedAt\` datetime DEFAULT NULL,
    \`subscriptionPlanDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`subscriptionPlanVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_subscriptionPlanHistory_source (subscriptionPlanId),
    INDEX idx_subscriptionPlanHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`SubscriptionPlanPricingHistory\` (
    \`subscriptionPlanPricingHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`subscriptionPlanPricingHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`pricingId\` int NOT NULL,
    \`subscriptionPlanPricingUniqueId\` varchar(36) NOT NULL,
    \`subscriptionPlanUniqueId\` varchar(36) NOT NULL,
    \`price\` decimal(10,2) NOT NULL,
    \`effectiveFrom\` date NOT NULL,
    \`effectiveTo\` date DEFAULT NULL,
    \`subscriptionPlanPricingCreatedBy\` varchar(36) NOT NULL,
    \`subscriptionPlanPricingUpdatedBy\` varchar(36) DEFAULT NULL,
    \`subscriptionPlanPricingDeletedBy\` varchar(36) DEFAULT NULL,
    \`subscriptionPlanPricingCreatedAt\` datetime DEFAULT CURRENT_TIMESTAMP,
    \`subscriptionPlanPricingUpdatedAt\` datetime DEFAULT NULL,
    \`subscriptionPlanPricingDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`subscriptionPlanPricingVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_subscriptionPlanPricingHistory_source (pricingId),
    INDEX idx_subscriptionPlanPricingHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`UserSubscriptionHistory\` (
    \`userSubscriptionHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`userSubscriptionHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`userSubscriptionId\` int NOT NULL,
    \`userSubscriptionUniqueId\` varchar(36) NOT NULL,
    \`driverUniqueId\` varchar(36) NOT NULL,
    \`subscriptionPlanPricingUniqueId\` varchar(36) NOT NULL,
    \`startDate\` datetime NOT NULL,
    \`endDate\` datetime NOT NULL,
    \`userSubscriptionCreatedBy\` varchar(36) NOT NULL,
    \`userSubscriptionUpdatedBy\` varchar(36) DEFAULT NULL,
    \`userSubscriptionDeletedBy\` varchar(36) DEFAULT NULL,
    \`userSubscriptionCreatedAt\` datetime DEFAULT CURRENT_TIMESTAMP,
    \`userSubscriptionUpdatedAt\` datetime DEFAULT NULL,
    \`userSubscriptionDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`userSubscriptionVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_userSubscriptionHistory_source (userSubscriptionId),
    INDEX idx_userSubscriptionHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`CommissionHistory\` (
    \`commissionHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`commissionHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`commissionId\` int NOT NULL,
    \`commissionUniqueId\` varchar(36) NOT NULL,
    \`paymentUniqueId\` varchar(36) DEFAULT NULL,
    \`journeyDecisionUniqueId\` varchar(36) NOT NULL,
    \`commissionRateUniqueId\` varchar(36) NOT NULL,
    \`commissionAmount\` decimal(10,2) NOT NULL,
    \`commissionStatusUniqueId\` varchar(36) NOT NULL,
    \`commissionCreatedAt\` datetime DEFAULT CURRENT_TIMESTAMP,
    \`commissionUpdatedAt\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    \`commissionDeletedAt\` datetime DEFAULT NULL,
    \`commissionCreatedBy\` varchar(36) NOT NULL,
    \`commissionUpdatedBy\` varchar(36) DEFAULT NULL,
    \`commissionDeletedBy\` varchar(36) DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`commissionVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_commissionHistory_source (commissionId),
    INDEX idx_commissionHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`CompanyCommissionHistory\` (
    \`companyCommissionHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`companyCommissionHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`companyCommissionId\` int NOT NULL,
    \`companyCommissionUniqueId\` varchar(36) NOT NULL,
    \`companyBidRequestUniqueId\` varchar(36) NOT NULL,
    \`companyUniqueId\` varchar(36) NOT NULL,
    \`commissionRateUniqueId\` varchar(36) NOT NULL,
    \`baseTotalCost\` decimal(10,2) NOT NULL,
    \`commissionRate\` decimal(5,2) NOT NULL,
    \`commissionAmount\` decimal(10,2) NOT NULL,
    \`commissionStatusUniqueId\` varchar(36) NOT NULL,
    \`paymentReference\` varchar(255) DEFAULT NULL,
    \`paidAt\` datetime DEFAULT NULL,
    \`paidBy\` varchar(36) DEFAULT NULL,
    \`companyCommissionCreatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`companyCommissionCreatedBy\` varchar(36) NOT NULL,
    \`companyCommissionUpdatedAt\` datetime DEFAULT NULL,
    \`companyCommissionUpdatedBy\` varchar(36) DEFAULT NULL,
    \`companyCommissionDeletedAt\` datetime DEFAULT NULL,
    \`companyCommissionDeletedBy\` varchar(36) DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`companyCommissionVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_companyCommissionHistory_source (companyCommissionId),
    INDEX idx_companyCommissionHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS \`UserBalanceHistory\` (
    \`userBalanceHistoryId\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT 'history row PK',
    \`userBalanceHistoryUniqueId\` VARCHAR(36) NOT NULL COMMENT 'history row UUID',
    \`userBalanceId\` int NOT NULL,
    \`userBalanceUniqueId\` varchar(36) NOT NULL,
    \`userUniqueId\` varchar(36) NOT NULL,
    \`transactionType\` enum('Deposit','Commission','Transfer','Refund','Subscription','freeGift') NOT NULL,
    \`transactionUniqueId\` varchar(36) NOT NULL,
    \`transactionTime\` datetime NOT NULL,
    \`userBalanceAdjustmentType\` enum('reversal','adjustment','creation') NOT NULL,
    \`netBalance\` decimal(10,2) NOT NULL,
    \`userBalanceCreatedBy\` varchar(36) NOT NULL,
    \`userBalanceUpdatedBy\` varchar(36) DEFAULT NULL,
    \`userBalanceDeletedBy\` varchar(36) DEFAULT NULL,
    \`userBalanceCreatedAt\` datetime NOT NULL,
    \`userBalanceUpdatedAt\` datetime DEFAULT NULL,
    \`userBalanceDeletedAt\` datetime DEFAULT NULL,
    \`changeType\` ENUM('UPDATE','DELETE') NOT NULL COMMENT 'UPDATE or DELETE',
    \`changedByUserId\` VARCHAR(36) NULL COMMENT 'who made the change',
    \`userBalanceVersion\` INT NOT NULL DEFAULT 1 COMMENT 'monotonic version per source row',
    INDEX idx_userBalanceHistory_source (userBalanceId),
    INDEX idx_userBalanceHistory_changedBy (changedByUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

module.exports = { historyTablesDdl };
