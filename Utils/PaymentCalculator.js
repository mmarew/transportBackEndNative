const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
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
      parseFloat(point2.longitude)
    );
    totalDistance += distance;
  }

  return totalDistance;
};
async function PaymentCalculator({ vehicleTypeUniqueId, journeyUniqueId }) {
  try {
    // first get all tarrif rate based on vehicle types uniqueid
    const TarrifRateForVehcleTypes = await performJoinSelect({
      baseTable: "TarrifRateForVehcleTypes",
      joins: [
        {
          table: "TarrifRate",
          on: "TarrifRateForVehcleTypes.tarrifRateUniqueId = TarrifRate.tarrifRateUniqueId",
        },
      ],
      conditions: { vehicleTypeUniqueId },
    });
    // then get all journey routes
    if (TarrifRateForVehcleTypes.length === 0)
      return {
        message: "error",
        error: "No tarrif rate found for this vehicle type",
      };
    const { standingTarrifRate, journeyTarrifRate, timingTarrifRate } =
      TarrifRateForVehcleTypes[0];
    const JourneyRoutePoints = await getData({
      tableName: "JourneyRoutePoints",
      conditions: { journeyUniqueId },
    });
    // then calculate  distance
    const totalDistance = calculateDistances(JourneyRoutePoints);
    // then multiply by tarrif rate
    const moneyByDistance = totalDistance * parseFloat(journeyTarrifRate);
    // calculate time
    const startingTime = JourneyRoutePoints[0].timestamp;
    const endingTime =
      JourneyRoutePoints[JourneyRoutePoints.length - 1].timestamp;
    // const date = formatDateToReadable();
    const totalTime = new Date(endingTime) - new Date(startingTime);
    console.log("totalTime", totalTime);
    const totalMunites = totalTime / 1000 / 60;
    // calculate money by time
    const moneyByTime = totalMunites * parseFloat(timingTarrifRate);
    const totalMoney =
      parseFloat(standingTarrifRate) + moneyByDistance + moneyByTime;
    return {
      totalDistance,
      message: "success",
      totalMoney,
    };
  } catch (error) {
    console.log(error);
    return { message: "error", error: "Something went wrong" };
  }
}
module.exports = PaymentCalculator;
