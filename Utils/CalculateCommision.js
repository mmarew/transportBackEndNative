const {
  getAllCommissionRates,
} = require("../Services/CommissionRates.service");

const calculateCommision = async (amount) => {
  // get commision rate from db
  const commisionRate = await getAllCommissionRates();
  const commissionRateUniqueId = commisionRate.data[0]?.commissionRateUniqueId;
  const rate = commisionRate.data[0]?.commissionRate;
  const commissionAmount = parseFloat(rate) * amount;
  return { commissionAmount, commissionRateUniqueId };
};
module.exports = calculateCommision;
