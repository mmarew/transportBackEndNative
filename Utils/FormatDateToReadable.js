// Function to format date in 'YYYY-MM-DD HH:MM:SS' format
function formatDateToReadable(isoDate) {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Example usage
const isoDate = "2024-11-01T08:22:36.000Z";

const formattedDate = formatDateToReadable(isoDate);

console.log(formattedDate); // Outputs: '2024-11-01 08:22:36'
module.exports = formatDateToReadable;
