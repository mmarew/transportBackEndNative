"use strict";

const PLACEHOLDER_DOMAINS = ["@dynamics.com", "@passenger.com", "@system.com"];

/**
 * Generates a consistent placeholder email for users who do not provide one.
 * Used to satisfy database NOT NULL constraints while maintaining unique identity.
 *
 * @param {string} phoneNumber - The user's phone number.
 * @returns {string} The generated placeholder email.
 */
const getPlaceholderEmail = (phoneNumber) => {
  if (!phoneNumber) {return null;}
  const cleanPhone = String(phoneNumber).trim().replace(/\+/g, "");
  return `${cleanPhone}@dynamics.com`;
};

/**
 * Checks if a given email is a system-generated placeholder.
 *
 * @param {string} email - The email address to check.
 * @returns {boolean} True if the email is a placeholder.
 */
const isPlaceholderEmail = (email) => {
  if (!email) {return true;}
  const lowerEmail = email.toLowerCase();
  return PLACEHOLDER_DOMAINS.some((domain) => lowerEmail.endsWith(domain));
};

module.exports = {
  getPlaceholderEmail,
  isPlaceholderEmail,
};
