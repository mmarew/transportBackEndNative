function modifyDateTime(dateStr, changes = {}) {
  let date;

  // Convert to Date instance safely
  if (dateStr instanceof Date) {
    date = new Date(dateStr); // clone to avoid mutation
  } else if (typeof dateStr === "string") {
    date = new Date(dateStr.replace(" ", "T"));
  } else {
    throw new Error("Invalid input: dateStr must be a string or Date object");
  }

  if (isNaN(date))
    throw new Error("Invalid date format. Use 'YYYY-MM-DD HH:mm:ss' or Date");

  // Apply modifications
  if (changes.years) date.setFullYear(date.getFullYear() + changes.years);
  if (changes.months) date.setMonth(date.getMonth() + changes.months);
  if (changes.days) date.setDate(date.getDate() + changes.days);
  if (changes.hours) date.setHours(date.getHours() + changes.hours);
  if (changes.minutes) date.setMinutes(date.getMinutes() + changes.minutes);
  if (changes.seconds) date.setSeconds(date.getSeconds() + changes.seconds);

  // Format back to "YYYY-MM-DD HH:mm:ss"
  const pad = (n) => String(n).padStart(2, "0");

  const formatted =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds()
    )}`;

  return formatted;
}

module.exports = modifyDateTime;
