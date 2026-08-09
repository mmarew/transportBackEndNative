"use strict";



const {
  pool} = require("../../Middleware/Database.config");


const logger = require("../../Utils/logger");


const {
  vehicleTypes,
  driversDocumentRequirement,
  statusList,
  roleList,
  listOfDocuments,
  journeyStatus,
  cancellationReasons,
  paymentStatus,
  paymentMethod,
  CommissionRates,
  TariffRateList,
  listOfVehicleStatusTypes,
  financialInstitutionAccount,
  subscriptionPlanLists,
  depositSources,
  shipperDocumentRequirement,
  companyDocumentRequirement,
  vehicleDocumentRequirement,
  companyAdminDocumentRequirement,
  dispatcherDocumentRequirement,
  listOfDelinquenciesTypes,
  subscriptionPlanPricingLists,
  companyRoleList,
  commissionStatusList
} = require("../../Utils/ListOfSeedData");
const {
  createDelinquencyType
} = require("../DelinquencyTypes.service");
const {
  createCommissionStatus
} = require("../CommissionStatus.service");
const {
  createVehicleStatusType
} = require("../VehicleStatusType.service");
const {
  addCancellationReason
} = require("../Cancellation.service");
const {
  createCommissionRate
} = require("../CommissionRates.service");
const {
  createDocumentType
} = require("../DocumentTypes.service");
const {
  createJourneyStatus
} = require("../JourneyStatus");
const {
  createPaymentMethod
} = require("../PaymentMethod.service");
const {
  createPaymentStatus
} = require("../PaymentStatus.service");
const {
  createMapping
} = require("../RoleDocumentRequirements");
const {
  createTariffRate
} = require("../TariffRate.service");

const {
  createVehicleType
} = require("../VehicleType.service");
const {
  createFinancialInstitutionAccount
} = require("../FinancialInstitutionAccount.service");
const {
  createSubscriptionPlan,
  getSubscriptionPlans
} = require("../SubscriptionPlan.service");
const {
  createDepositSource
} = require("../DepositSource.service");
const {
  createStatus
} = require("../Status.service");
const {
  createRole
} = require("../Role.service");
const {
  createRole: createCompanyRole
} = require("../CompanyRole.service");
const {
  createPricing
} = require("../SubscriptionPlanPricing.service");

const installPreDefinedData = async req => {
  const user = req?.user;
  const userUniqueId = user?.userUniqueId;
  logger.info("Starting installPreDefinedData", {
    hasUser: !!user,
    userUniqueId,
    counts: {
      listOfVehicleStatusTypes: listOfVehicleStatusTypes?.length,
      journeyStatus: journeyStatus?.length,
      statusList: statusList?.length,
      roleList: roleList?.length,
      companyRoleList: companyRoleList?.length,
      vehicleTypes: vehicleTypes?.length
    }
  });

  // Helper function to insert data sequentially
  const processDataSequentially = async (list, createFunction, successArray, errorArray, label) => {
    if (!list || !Array.isArray(list) || list.length === 0) {
      logger.warn(`No data found for ${label} to seed`);
      return;
    }
    for (const item of list) {
      try {
        const result = await createFunction({
          ...item,
          user,
          userUniqueId
        });
        logger.info(`Seeded ${label}:`, {
          item: item.statusName || item.roleName || item.VehicleStatusTypeName || item.journeyStatusName
        });
        if (!result.error) {
          successArray.push({
            label,
            item
          });
        } else {
          errorArray.push({
            label,
            item,
            error: result.error
          });
        }
      } catch (error) {
        const errorMessage = error?.message || "Unknown error during seeding";
        if (/already exists|duplicate entry/i.test(errorMessage)) {
          logger.info("Skipped existing item in predefined data", {
            label,
            item,
            error: errorMessage
          });
          successArray.push({
            label,
            item
          });
          continue;
        }
        logger.error("Error creating item in predefined data", {
          label,
          item,
          error: errorMessage
        });
        errorArray.push({
          label,
          item,
          error: errorMessage || "Failed to create item due to server error"
        });
      }
    }
  };

  // Arrays to store success and error data
  const statusSuccess = [],
    statusErrors = [],
    roleSuccess = [],
    roleErrors = [],
    companyRoleSuccess = [],
    companyRoleErrors = [],
    successVehicleTypes = [],
    failedVehicleTypes = [],
    successDocumentTypes = [],
    failedDocumentTypes = [],
    successOnDocumentRequirement = [],
    failedOnDocumentRequirement = [],
    failedJourneyStatus = [],
    successJourneyStatus = [],
    cancellationReasonsSuccess = [],
    cancellationReasonsErrors = [],
    paymentStatusSuccess = [],
    paymentStatusErrors = [],
    createPaymentMethodSuccess = [],
    createPaymentMethodErrors = [],
    successCommissionRates = [],
    failedCommissionRates = [],
    successTariffRateForVehicleType = [],
    failedTariffRateForVehicleType = [],
    successTariffRate = [],
    failedTariffRate = [],
    successVehicleStatusTypes = [],
    failedVehicleStatusTypes = [],
    financialInstitutionAccountSuccess = [],
    financialInstitutionAccountErrors = [],
    subscriptionPlanListsSuccess = [],
    subscriptionPlanListsErrors = [],
    depositSourcesSuccess = [],
    depositSourcesErrors = [],
    successShipperDocumentRequirement = [],
    failedShipperDocumentRequirement = [],
    successCompanyDocumentRequirement = [],
    failedCompanyDocumentRequirement = [],
    successVehicleDocumentRequirement = [],
    failedVehicleDocumentRequirement = [],
    successCompanyAdminDocumentRequirement = [],
    failedCompanyAdminDocumentRequirement = [],
    successDispatcherDocumentRequirement = [],
    failedDispatcherDocumentRequirement = [],
    listOfDelinquenciesTypesSuccess = [],
    listOfDelinquenciesTypesErrors = [],
    commissionStatusSuccess = [],
    commissionStatusErrors = [],
    subscriptionPlanPricingSuccess = [],
    subscriptionPlanPricingErrors = [];
  await processDataSequentially(listOfVehicleStatusTypes, vehicleStatusType => createVehicleStatusType({
    ...vehicleStatusType,
    user
  }), successVehicleStatusTypes, failedVehicleStatusTypes, "VehicleStatusType");
  await processDataSequentially(journeyStatus, status => createJourneyStatus(status, user), successJourneyStatus, failedJourneyStatus, "JourneyStatus");
  await processDataSequentially(statusList, async status => {
    try {
      return await createStatus({
        ...status,
        user
      });
    } catch (error) {
      if (error.message && error.message.includes("already exists")) {
        return {
          message: "Data already exists",
          data: null
        };
      }
      throw error;
    }
  }, statusSuccess, statusErrors, "Status");
  await processDataSequentially(roleList, async role => {
    try {
      return await createRole({
        ...role,
        user
      });
    } catch (error) {
      if (error.message && error.message.includes("already exists")) {
        return {
          message: "Data already exists",
          data: null
        };
      }
      throw error;
    }
  }, roleSuccess, roleErrors, "Role");
  await processDataSequentially(companyRoleList, async companyRole => {
    try {
      return await createCompanyRole({
        ...companyRole,
        userUniqueId
      });
    } catch (error) {
      if (error.message && error.message.includes("already exists")) {
        return {
          message: "Data already exists",
          data: null
        };
      }
      throw error;
    }
  }, companyRoleSuccess, companyRoleErrors, "CompanyRoles");
  await processDataSequentially(vehicleTypes, VehicleType => createVehicleType({
    ...VehicleType
  }, user.userUniqueId), successVehicleTypes, failedVehicleTypes, "VehicleTypes");
  await processDataSequentially(listOfDocuments, document => createDocumentType({
    body: {
      ...document,
      user
    }
  }), successDocumentTypes, failedDocumentTypes, "DocumentType");
  await processDataSequentially(driversDocumentRequirement, document => {
    return createMapping({
      body: document,
      userUniqueId: user.userUniqueId
    });
  }, successOnDocumentRequirement, failedOnDocumentRequirement, "DocumentRequirement");
  await processDataSequentially(shipperDocumentRequirement, document => createMapping({
    body: document,
    userUniqueId: user.userUniqueId
  }), successShipperDocumentRequirement, failedShipperDocumentRequirement, "ShipperDocumentRequirement");
  await processDataSequentially(companyDocumentRequirement, document => createMapping({
    body: document,
    userUniqueId: user.userUniqueId
  }), successCompanyDocumentRequirement, failedCompanyDocumentRequirement, "CompanyDocumentRequirement");
  await processDataSequentially(vehicleDocumentRequirement, document => createMapping({
    body: document,
    userUniqueId: user.userUniqueId
  }), successVehicleDocumentRequirement, failedVehicleDocumentRequirement, "VehicleDocumentRequirement");
  await processDataSequentially(companyAdminDocumentRequirement, document => createMapping({
    body: document,
    userUniqueId: user.userUniqueId
  }), successCompanyAdminDocumentRequirement, failedCompanyAdminDocumentRequirement, "CompanyAdminDocumentRequirement");
  await processDataSequentially(dispatcherDocumentRequirement, document => createMapping({
    body: document,
    userUniqueId: user.userUniqueId
  }), successDispatcherDocumentRequirement, failedDispatcherDocumentRequirement, "DispatcherDocumentRequirement");
  await processDataSequentially(cancellationReasons, reason => addCancellationReason(reason, user), cancellationReasonsSuccess, cancellationReasonsErrors, "CancellationReasonsType");
  await processDataSequentially(paymentStatus, createPaymentStatus, paymentStatusSuccess, paymentStatusErrors, "PaymentStatus");
  await processDataSequentially(paymentMethod, method => createPaymentMethod({
    paymentMethod: method.paymentMethod,
    user
  }), createPaymentMethodSuccess, createPaymentMethodErrors, "PaymentMethod");
  let updatedCommissionRates = CommissionRates.map(item => {
    return {
      ...item,
      commissionRateCreatedBy: user.userUniqueId
    };
  });
  await processDataSequentially(updatedCommissionRates, createCommissionRate, successCommissionRates, failedCommissionRates, "CommissionRates");
  await processDataSequentially(TariffRateList, createTariffRate, successTariffRate, failedTariffRate, "TariffRateList");
  await processDataSequentially(financialInstitutionAccount, account => createFinancialInstitutionAccount({
    ...account,
    user
  }), financialInstitutionAccountSuccess, financialInstitutionAccountErrors, "financialInstitutionAccount");
  await processDataSequentially(subscriptionPlanLists, plan => createSubscriptionPlan({
    ...plan,
    user
  }), subscriptionPlanListsSuccess, subscriptionPlanListsErrors, "subscriptionPlanLists");
  await processDataSequentially(depositSources, source => createDepositSource({
    ...source,
    user
  }), depositSourcesSuccess, depositSourcesErrors, "depositSources");
  await processDataSequentially(listOfDelinquenciesTypes, createDelinquencyType, listOfDelinquenciesTypesSuccess, listOfDelinquenciesTypesErrors, "listOfDelinquenciesTypes");
  await processDataSequentially(commissionStatusList, status => createCommissionStatus({
    ...status,
    user
  }), commissionStatusSuccess, commissionStatusErrors, "commissionStatusList");
  const planMapping = ["One month Free", "One month", "Three Months", "One Year"];
  const updatedSubscriptionPlanPricingLists = [];
  for (let index = 0; index < (subscriptionPlanPricingLists?.length || 0); index += 1) {
    const item = subscriptionPlanPricingLists[index];
    const planName = planMapping[index];
    const plansResult = await getSubscriptionPlans({ planName });
    const matchedPlan = (plansResult?.data || []).find(p => p.planName === planName);
    updatedSubscriptionPlanPricingLists.push({
      ...item,
      subscriptionPlanUniqueId: matchedPlan?.subscriptionPlanUniqueId
    });
  }
  await processDataSequentially(updatedSubscriptionPlanPricingLists, pricing => createPricing({
    ...pricing,
    user
  }), subscriptionPlanPricingSuccess, subscriptionPlanPricingErrors, "subscriptionPlanPricing");
  return {
    message: "Seed data installed successfully",
    data: {
      subscriptionPlanPricing: {
        success: subscriptionPlanPricingSuccess,
        errors: subscriptionPlanPricingErrors
      },
      DelinquencyTypes: {
        success: listOfDelinquenciesTypesSuccess,
        errors: listOfDelinquenciesTypesErrors
      },
      CommissionStatus: {
        success: commissionStatusSuccess,
        errors: commissionStatusErrors
      },
      shipperDocumentRequirement: {
        success: successShipperDocumentRequirement,
        errors: failedShipperDocumentRequirement
      },
      companyDocumentRequirement: {
        success: successCompanyDocumentRequirement,
        errors: failedCompanyDocumentRequirement
      },
      vehicleDocumentRequirement: {
        success: successVehicleDocumentRequirement,
        errors: failedVehicleDocumentRequirement
      },
      companyAdminDocumentRequirement: {
        success: successCompanyAdminDocumentRequirement,
        errors: failedCompanyAdminDocumentRequirement
      },
      dispatcherDocumentRequirement: {
        success: successDispatcherDocumentRequirement,
        errors: failedDispatcherDocumentRequirement
      },
      VehicleStatusTypes: {
        success: successVehicleStatusTypes,
        errors: failedVehicleStatusTypes
      },
      CommissionRates: {
        successCommissionRates,
        failedCommissionRates
      },
      TariffRateForVehcleTypes: {
        successTariffRateForVehicleType,
        failedTariffRateForVehicleType
      },
      TariffRateList: {
        successTariffRate,
        failedTariffRate
      },
      paymentStatus: {
        success: paymentStatusSuccess,
        errors: paymentStatusErrors
      },
      statuses: {
        success: statusSuccess,
        errors: statusErrors
      },
      roles: {
        success: roleSuccess,
        errors: roleErrors
      },
      CompanyRoles: {
        success: companyRoleSuccess,
        errors: companyRoleErrors
      },
      vehicleTypes: {
        success: successVehicleTypes,
        errors: failedVehicleTypes
      },
      documentTypes: {
        success: successDocumentTypes,
        errors: failedDocumentTypes
      },
      documentRequirements: {
        success: successOnDocumentRequirement,
        errors: failedOnDocumentRequirement
      },
      journeyStatus: {
        success: successJourneyStatus,
        errors: failedJourneyStatus
      },
      cancellationReasons: {
        success: cancellationReasonsSuccess,
        errors: cancellationReasonsErrors
      },
      financialInstitutionAccount: {
        success: financialInstitutionAccountSuccess,
        errors: financialInstitutionAccountErrors
      },
      depositSources: {
        success: depositSourcesSuccess,
        errors: depositSourcesErrors
      },
      subscriptionPlanLists: {
        success: subscriptionPlanListsSuccess,
        errors: subscriptionPlanListsErrors
      }
    }
  };
};

module.exports = {
  installPreDefinedData
};
