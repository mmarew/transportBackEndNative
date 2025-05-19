function modifyDateTime(dateStr, changes = {}) {
  const date = new Date(dateStr.replace(" ", "T")); // ensure compatibility

  if (isNaN(date))
    throw new Error("Invalid date format. Use 'YYYY-MM-DD HH:mm:ss'");

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
