const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const AppError = require("./AppError");
// Function to convert degrees to radians
const toRadians = (degrees) => (degrees * Math.PI) / 180;

// Function to calculate distance using Haversine formula
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of Earth in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

// Given JourneyRoutePoints array
const calculateDistances = (journeyRoutePoints) => {
  // Calculate the distance between consecutive points
  let totalDistance = 0;
  for (let i = 0; i < journeyRoutePoints.length - 1; i++) {
    const point1 = journeyRoutePoints[i];
    const point2 = journeyRoutePoints[i + 1];
    const distance = haversineDistance(
      parseFloat(point1.latitude),
      parseFloat(point1.longitude),
      parseFloat(point2.latitude),
      parseFloat(point2.longitude),
    );
    totalDistance += distance;
  }

  return totalDistance;
};
async function PaymentCalculator({ vehicleTypeUniqueId, journeyUniqueId }) {
  try {
    if (!vehicleTypeUniqueId || !journeyUniqueId) {
      throw new AppError("Missing required parameters", AppError.BAD_REQUEST);
    }

    const TariffRateForVehicleTypes = await performJoinSelect({
      baseTable: "TariffRateForVehcleTypes",
      joins: [
        {
          table: "TariffRate",
          on: "TariffRateForVehcleTypes.tariffRateUniqueId = TariffRate.tariffRateUniqueId",
        },
      ],
      conditions: { vehicleTypeUniqueId },
    });

    if (TariffRateForVehicleTypes.length === 0) {
      throw new AppError("No tariff rate found for this vehicle type", AppError.NOT_FOUND);
    }

    const { standingTariffRate, journeyTariffRate, timingTariffRate } =
      TariffRateForVehicleTypes[0];

    if (!standingTariffRate || !journeyTariffRate || !timingTariffRate) {
      throw new AppError("Missing required tariff rate columns", AppError.INTERNAL_SERVER_ERROR);
    }

    const JourneyRoutePoints = await getData({
      tableName: "JourneyRoutePoints",
      conditions: { journeyUniqueId },
    });

    if (!JourneyRoutePoints.length) {
      throw new AppError("No journey route points found for this journey", AppError.NOT_FOUND);
    }

    const totalDistance = Math.round(calculateDistances(JourneyRoutePoints));

    const moneyByDistance = totalDistance * parseFloat(journeyTariffRate);
    const startingTime = JourneyRoutePoints[0].timestamp;
    const endingTime =
      JourneyRoutePoints[JourneyRoutePoints.length - 1].timestamp;

    const totalTime = new Date(endingTime) - new Date(startingTime);
    const totalMunites = totalTime / 1000 / 60;

    const moneyByTime = totalMunites * parseFloat(timingTariffRate);

    const totalMoney = Math.round(
      parseFloat(standingTariffRate) + moneyByDistance + moneyByTime,
    );

    return {
      totalDistance,
      message: "success",
      totalMoney,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    const logger = require("./logger");
    logger.error("Error calculating payment", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError("Something went wrong during payment calculation", AppError.INTERNAL_SERVER_ERROR);
  }
}
module.exports = PaymentCalculator;
