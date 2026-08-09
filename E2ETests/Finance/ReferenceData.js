const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig, getAnyJourneyDecision } = require("../Utils");

// ── DepositSource ───────────────────────────────────────────────────────────────
const DS_URL = "/api/finance/depositSource";
const dsCache = { data: null };

const testGetDepositSources = async ({ user } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.get(backendURL + DS_URL, authConfig(token));
  console.log("✅ DepositSources fetched:", result.data.data?.length ?? 0);
  dsCache.data = result.data.data;
  return result.data;
};

const testGetDepositSourceById = async ({ user, depositSourceUniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = depositSourceUniqueId || dsCache.data?.[0]?.depositSourceUniqueId;
  if (!id) throw new Error("No depositSourceUniqueId found");
  const result = await axios.get(`${backendURL}${DS_URL}/${id}`, authConfig(token));
  console.log("✅ DepositSource fetched by ID:", id);
  return result.data;
};

const testCreateDepositSource = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const defaultPayload = { sourceKey: "E2E_TEST_" + Date.now(), sourceLabel: "E2E test deposit source", ...payload };
  const result = await axios.post(backendURL + DS_URL, defaultPayload, authConfig(token));
  console.log("✅ DepositSource created:", result.data.depositSourceUniqueId || result.data.data?.depositSourceUniqueId);
  return result.data;
};

const testUpdateDepositSource = async ({ user, depositSourceUniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = depositSourceUniqueId || dsCache.data?.[0]?.depositSourceUniqueId;
  if (!id) throw new Error("No depositSourceUniqueId found to update");
  const defaultPayload = { sourceLabel: "Updated E2E deposit source label", ...payload };
  const result = await axios.put(`${backendURL}${DS_URL}/${id}`, defaultPayload, authConfig(token));
  console.log("✅ DepositSource updated:", id);
  return result.data;
};

const testDeleteDepositSource = async ({ user, depositSourceUniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = depositSourceUniqueId || dsCache.data?.[0]?.depositSourceUniqueId;
  if (!id) throw new Error("No depositSourceUniqueId found to delete");
  const result = await axios.delete(`${backendURL}${DS_URL}/${id}`, authConfig(token));
  console.log("✅ DepositSource deleted:", id);
  return result.data;
};

const testDepositSourceWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── DepositSource Workflow ──");
  await testGetDepositSources({ user });
  const created = await testCreateDepositSource({ user });
  const depositSourceUniqueId = created?.depositSourceUniqueId || created?.data?.depositSourceUniqueId;
  if (!depositSourceUniqueId) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetDepositSources({ user });
  await testGetDepositSourceById({ user, depositSourceUniqueId });
  await testUpdateDepositSource({ user, depositSourceUniqueId });
  await testGetDepositSources({ user });
  await testDeleteDepositSource({ user, depositSourceUniqueId });
  await testGetDepositSources({ user });
  console.log("── DepositSource Workflow complete ──\n");
  return { depositSourceUniqueId };
};

// ── FinancialInstitutionAccount ─────────────────────────────────────────────────
const FIA_URL = "/api/finance/financialInstitutionAccount";
const fiaCache = { data: null };

const testGetFinancialInstitutionAccounts = async ({ user } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.get(backendURL + FIA_URL, authConfig(token));
  console.log("✅ FinancialInstitutionAccounts fetched:", result.data.data?.length ?? 0);
  fiaCache.data = result.data.data;
  return result.data;
};

const testCreateFinancialInstitutionAccount = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const defaultPayload = { institutionName: "E2E Test Bank", accountHolderName: "Test User E2E", accountNumber: "E2E" + Date.now().toString().slice(-9), accountType: "bank", isActive: true, ...payload };
  const result = await axios.post(backendURL + FIA_URL, defaultPayload, authConfig(token));
  console.log("✅ FinancialInstitutionAccount created:", result.data.accountUniqueId || result.data.data?.accountUniqueId);
  return result.data;
};

const testUpdateFinancialInstitutionAccount = async ({ user, accountUniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = accountUniqueId || fiaCache.data?.[0]?.accountUniqueId;
  if (!id) throw new Error("No accountUniqueId found to update");
  const defaultPayload = { isActive: false, ...payload };
  const result = await axios.put(`${backendURL}${FIA_URL}/${id}`, defaultPayload, authConfig(token));
  console.log("✅ FinancialInstitutionAccount updated:", id);
  return result.data;
};

const testDeleteFinancialInstitutionAccount = async ({ user, accountUniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = accountUniqueId || fiaCache.data?.[0]?.accountUniqueId;
  if (!id) throw new Error("No accountUniqueId found to delete");
  const result = await axios.delete(`${backendURL}${FIA_URL}/${id}`, authConfig(token));
  console.log("✅ FinancialInstitutionAccount deleted:", id);
  return result.data;
};

const testFinancialInstitutionAccountWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── FinancialInstitutionAccount Workflow ──");
  await testGetFinancialInstitutionAccounts({ user });
  const created = await testCreateFinancialInstitutionAccount({ user });
  const accountUniqueId = created?.accountUniqueId || created?.data?.accountUniqueId;
  if (!accountUniqueId) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetFinancialInstitutionAccounts({ user });
  await testUpdateFinancialInstitutionAccount({ user, accountUniqueId, payload: { isActive: false } });
  await testGetFinancialInstitutionAccounts({ user });
  await testDeleteFinancialInstitutionAccount({ user, accountUniqueId });
  await testGetFinancialInstitutionAccounts({ user });
  console.log("── FinancialInstitutionAccount Workflow complete ──\n");
  return { accountUniqueId };
};

// ── Ratings ─────────────────────────────────────────────────────────────────────
const RAT_URL = "/api/ratings";
const ratCache = { data: null };

const testGetRatings = async ({ user, filters = {} } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const query = new URLSearchParams(filters).toString();
  const url = query ? `${RAT_URL}?${query}` : RAT_URL;
  const result = await axios.get(backendURL + url, authConfig(token));
  console.log("✅ Ratings fetched:", result.data.data?.length ?? 0);
  ratCache.data = result.data.data;
  return result.data;
};

const testCreateRating = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.shipper?.token;
  if (!token) throw new Error("token not found");
  const journeyDecisionUniqueId = payload?.journeyDecisionUniqueId || (await getAnyJourneyDecision({ token })) || usersData?.driver?.lastJourneyDecisionUniqueId || usersData?.driver?.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;
  if (!journeyDecisionUniqueId) { console.warn("⏩ testCreateRating skipped — no journeyDecisionUniqueId"); return { skipped: true }; }
  const ratedUserUniqueId = payload?.ratedUserUniqueId || usersData?.driver?.accountData?.userData?.userUniqueId || usersData?.driver?.accountData?.driver?.userUniqueId;
  if (!ratedUserUniqueId) { console.warn("⏩ testCreateRating skipped — no ratedUserUniqueId"); return { skipped: true }; }
  const defaultPayload = { journeyDecisionUniqueId, ratedUserUniqueId, ratingValue: 5, comment: "E2E test rating — excellent service", ...payload };
  const result = await axios.post(backendURL + RAT_URL, defaultPayload, authConfig(token));
  const id = result.data?.data?.ratingUniqueId || result.data?.ratingUniqueId || result.data?.data?.ratingId || result.data?.ratingId || result.data?.data?.id || result.data?.id;
  console.log("✅ Rating created:", id ?? "(no id in response)");
  return result.data;
};

const testUpdateRating = async ({ user, id, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const ratingId = id || ratCache.data?.[0]?.id || ratCache.data?.[0]?.ratingUniqueId;
  if (!ratingId) throw new Error("No rating ID found to update");
  const defaultPayload = { comment: "Updated E2E test rating comment", ...payload };
  const result = await axios.put(`${backendURL}${RAT_URL}/${ratingId}`, defaultPayload, authConfig(token));
  console.log("✅ Rating updated:", ratingId);
  return result.data;
};

const testDeleteRating = async ({ user, id } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const ratingId = id || ratCache.data?.[0]?.id || ratCache.data?.[0]?.ratingUniqueId;
  if (!ratingId) throw new Error("No rating ID found to delete");
  const result = await axios.delete(`${backendURL}${RAT_URL}/${ratingId}`, authConfig(token));
  console.log("✅ Rating deleted:", ratingId);
  return result.data;
};

const testRatingsWorkflow = async ({ user = usersData.shipper } = {}) => {
  console.log("\n── Ratings Workflow ──");
  await testGetRatings({ user });
  if (usersData?.driver?.accountData?.userData?.userUniqueId) {
    await testGetRatings({ user, filters: { ratedUserUniqueId: usersData.driver.accountData.userData.userUniqueId } });
  }
  const created = await testCreateRating({ user });
  if (created?.skipped) { console.log("⏩ Skipped — run full journey flow first"); console.log("── Ratings Workflow skipped ──\n"); return { skipped: true }; }
  const ratingId = created?.data?.ratingUniqueId || created?.ratingUniqueId || created?.data?.ratingId || created?.ratingId || created?.data?.id || created?.id || ratCache.data?.[0]?.ratingUniqueId || ratCache.data?.[0]?.ratingId || ratCache.data?.[0]?.id;
  if (ratingId) {
    await testGetRatings({ user });
    await testUpdateRating({ user, id: ratingId });
    await testGetRatings({ user });
    await testDeleteRating({ user, id: ratingId });
    await testGetRatings({ user });
  } else {
    console.warn("⚠️  Rating created but ID not extractable — skipping UPDATE/DELETE");
  }
  console.log("── Ratings Workflow complete ──\n");
  return { cache: ratCache };
};

// ── TariffRate ──────────────────────────────────────────────────────────────────
const TR_URL = "/api/finance/tariffRate";
const trCache = { data: null };

const testGetTariffRates = async ({ user } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.get(backendURL + TR_URL, authConfig(token));
  console.log("✅ TariffRates fetched:", result.data.data?.length ?? 0);
  trCache.data = result.data.data;
  return result.data;
};

const testCreateTariffRate = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const defaultPayload = { tariffRateName: "E2E Test Tariff " + Date.now(), standingTariffRate: 100, journeyTariffRate: 25, timingTariffRate: 10, tariffRateDescription: "E2E test tariff rate", tariffRateEffectiveDate: "2026-01-01", tariffRateExpirationDate: "2030-01-01", ...payload };
  const result = await axios.post(backendURL + TR_URL, defaultPayload, authConfig(token));
  console.log("✅ TariffRate created:", result.data.tariffRateUniqueId || result.data.data?.tariffRateUniqueId);
  return result.data;
};

const testUpdateTariffRate = async ({ user, tariffRateUniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = tariffRateUniqueId || trCache.data?.[0]?.tariffRateUniqueId;
  if (!id) throw new Error("No tariffRateUniqueId found to update");
  const defaultPayload = { standingTariffRate: 150, ...payload };
  const result = await axios.put(`${backendURL}${TR_URL}/${id}`, defaultPayload, authConfig(token));
  console.log("✅ TariffRate updated:", id);
  return result.data;
};

const testDeleteTariffRate = async ({ user, tariffRateUniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = tariffRateUniqueId || trCache.data?.[0]?.tariffRateUniqueId;
  if (!id) throw new Error("No tariffRateUniqueId found to delete");
  const result = await axios.delete(`${backendURL}${TR_URL}/${id}`, authConfig(token));
  console.log("✅ TariffRate deleted:", id);
  return result.data;
};

const testTariffRateWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── TariffRate Workflow ──");
  await testGetTariffRates({ user });
  const created = await testCreateTariffRate({ user });
  const tariffRateUniqueId = created?.tariffRateUniqueId || created?.data?.tariffRateUniqueId;
  if (!tariffRateUniqueId) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetTariffRates({ user });
  await testUpdateTariffRate({ user, tariffRateUniqueId });
  await testGetTariffRates({ user });
  await testDeleteTariffRate({ user, tariffRateUniqueId });
  await testGetTariffRates({ user });
  console.log("── TariffRate Workflow complete ──\n");
  return { tariffRateUniqueId };
};

// ── TariffRateForVehicleType ────────────────────────────────────────────────────
const TRVT_URL = "/api/admin/tariffRateForVehicleType";
const trvtCache = { data: null };

const testGetTariffRatesForVehicleTypes = async ({ user } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const result = await axios.get(backendURL + TRVT_URL, authConfig(token));
  console.log("✅ TariffRateForVehicleTypes fetched:", result.data.data?.length ?? 0);
  trvtCache.data = result.data.data;
  return result.data;
};

const testCreateTariffRateForVehicleType = async ({ user, vehicleTypeUniqueId, tariffRateUniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  if (!vehicleTypeUniqueId || !tariffRateUniqueId) { console.warn("⏩ testCreateTariffRateForVehicleType skipped — IDs required"); return { skipped: true }; }
  const defaultPayload = { vehicleTypeUniqueId, tariffRateUniqueId, ...payload };
  const result = await axios.post(backendURL + TRVT_URL, defaultPayload, authConfig(token));
  console.log("✅ TariffRateForVehicleType created:", result.data.tariffRateForVehicleTypeUniqueId || result.data.data?.tariffRateForVehicleTypeUniqueId);
  return result.data;
};

const testUpdateTariffRateForVehicleType = async ({ user, tariffRateForVehicleTypeUniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = tariffRateForVehicleTypeUniqueId || trvtCache.data?.[0]?.tariffRateForVehicleTypeUniqueId;
  if (!id) throw new Error("No tariffRateForVehicleTypeUniqueId found to update");
  const defaultPayload = { status: 0, ...payload };
  const result = await axios.put(`${backendURL}${TRVT_URL}/${id}`, defaultPayload, authConfig(token));
  console.log("✅ TariffRateForVehicleType updated:", id);
  return result.data;
};

const testDeleteTariffRateForVehicleType = async ({ user, tariffRateForVehicleTypeUniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = tariffRateForVehicleTypeUniqueId || trvtCache.data?.[0]?.tariffRateForVehicleTypeUniqueId;
  if (!id) throw new Error("No tariffRateForVehicleTypeUniqueId found to delete");
  const result = await axios.delete(`${backendURL}${TRVT_URL}/${id}`, authConfig(token));
  console.log("✅ TariffRateForVehicleType deleted:", id);
  return result.data;
};

const testTariffRateForVehicleTypeWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── TariffRateForVehicleType Workflow ──");
  await testGetTariffRatesForVehicleTypes({ user });
  const vehicleTypesResult = await axios.get(backendURL + "/api/admin/vehicleTypes", authConfig(user?.token || usersData.admin?.token)).catch(() => null);
  const tariffRatesResult = await axios.get(backendURL + "/api/finance/tariffRate", authConfig(user?.token || usersData.admin?.token)).catch(() => null);
  const vehicleTypeUniqueId = vehicleTypesResult?.data?.data?.[0]?.vehicleTypeUniqueId;
  const tariffRateUniqueId = tariffRatesResult?.data?.data?.[0]?.tariffRateUniqueId;
  const anotherTariffRateUniqueId = tariffRatesResult?.data?.data?.[1]?.tariffRateUniqueId;
  if (!vehicleTypeUniqueId || !tariffRateUniqueId) { console.log("⏩ Skipped — IDs not available"); return { skipped: true }; }
  const created = await testCreateTariffRateForVehicleType({ user, vehicleTypeUniqueId, tariffRateUniqueId });
  if (created?.skipped) return { skipped: true };
  const id = created?.tariffRateForVehicleTypeUniqueId || created?.data?.tariffRateForVehicleTypeUniqueId;
  if (!id) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetTariffRatesForVehicleTypes({ user });
  await testUpdateTariffRateForVehicleType({ user, tariffRateForVehicleTypeUniqueId: id, payload: { tariffRateUniqueId: anotherTariffRateUniqueId } });
  await testGetTariffRatesForVehicleTypes({ user });
  await testDeleteTariffRateForVehicleType({ user, tariffRateForVehicleTypeUniqueId: id });
  await testGetTariffRatesForVehicleTypes({ user });
  console.log("── TariffRateForVehicleType Workflow complete ──\n");
  return { id };
};

module.exports = {
  testDepositSourceWorkflow, testGetDepositSources, testGetDepositSourceById, testCreateDepositSource, testUpdateDepositSource, testDeleteDepositSource,
  testFinancialInstitutionAccountWorkflow, testGetFinancialInstitutionAccounts, testCreateFinancialInstitutionAccount, testUpdateFinancialInstitutionAccount, testDeleteFinancialInstitutionAccount,
  testRatingsWorkflow, testGetRatings, testCreateRating, testUpdateRating, testDeleteRating,
  testTariffRateWorkflow, testGetTariffRates, testCreateTariffRate, testUpdateTariffRate, testDeleteTariffRate,
  testTariffRateForVehicleTypeWorkflow, testGetTariffRatesForVehicleTypes, testCreateTariffRateForVehicleType, testUpdateTariffRateForVehicleType, testDeleteTariffRateForVehicleType,
};
