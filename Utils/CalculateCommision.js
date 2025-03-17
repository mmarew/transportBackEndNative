const {
  getAllCommissionRates,
} = require("../Services/CommissionRates.service");

const calculateCommision = async (amount) => {
  // get commision rate from db
  const commisionRates = await getAllCommissionRates();
  console.log("@calculateCommision commisionRates", commisionRates);
  const commissionRateUniqueId = commisionRates.data[0]?.commissionRateUniqueId;
  const rate = commisionRates.data[0]?.commissionRate;
  const commissionAmount = parseFloat(rate) * amount;
  return { commissionAmount, commissionRateUniqueId };
};
module.exports = calculateCommision;
