const currentDate = () => {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // getMonth() is zero-based
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// module.exports = currentDate;
const currentDateEAT = () => {
  const now = new Date();

  // Convert to UTC and add 3 hours for East African Time (UTC+3)
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const eatTime = new Date(utcTime + 3 * 60 * 60 * 1000); // UTC+3

  const year = eatTime.getUTCFullYear();
  const month = String(eatTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(eatTime.getUTCDate()).padStart(2, "0");
  const hours = String(eatTime.getUTCHours()).padStart(2, "0");
  const minutes = String(eatTime.getUTCMinutes()).padStart(2, "0");
  const seconds = String(eatTime.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

module.exports = { currentDateEAT, currentDate };
