"use strict";

// Ethiopian phone-number canonicalization.
//
// The Users.phoneNumber column is UNIQUE but has historically been written in
// mixed formats (+251XXXXXXXXX, 251XXXXXXXXX, 0XXXXXXXXX). Exact-string lookups
// then MISS an existing user (different format) and insert a DUPLICATE — which
// in turn fires the "New user registered" alert for an already-existing user.
//
// Canonical form used by this app: +251 + 9 digits (+251XXXXXXXXX).

const stripNonDigits = (value) => String(value || "").replace(/\D/g, "");

const trim = (value) => String(value || "").trim();

/**
 * Extract the national (9-digit) mobile number from any common local form,
 * returning null when it is not a recognizable Ethiopian mobile number.
 */
const nationalDigits = (phone) => {
  const t = trim(phone);
  if (!t) return null;
  let digits = stripNonDigits(t);
  if (!digits) return null;

  // Drop a leading country code (251) and/or leading 0.
  // eslint-disable-next-line no-magic-numbers -- 251 is the Ethiopian country code
  if (digits.startsWith("251") && digits.length > 9) {
    // eslint-disable-next-line no-magic-numbers -- length of the 251 country code
    digits = digits.slice(3);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  // Ethiopian mobile/mobile-ish lines are 9 digits starting with 7 or 9
  // (the dominant case in this app); accept any 9-digit line to be safe.
  if (!/^\d{9}$/.test(digits)) {
    return null;
  }
  return digits;
};

/**
 * Canonicalize a phone number to +251XXXXXXXXX. Unknown/non-Ethiopian inputs are
 * returned whitespace-trimmed and otherwise unchanged (safe no-op).
 */
const normalizePhoneNumber = (phone) => {
  const t = trim(phone);
  if (!t) return phone;
  const national = nationalDigits(t);
  if (!national) {
    return t.startsWith("+") ? t : t;
  }
  return `+251${national}`;
};

/**
 * The natural stored representations of a phone that must all resolve to the
 * same identity (deduped, including the raw cleaned input):
 *   canonical   +251XXXXXXXXX
 *   national    251XXXXXXXXX
 *   local       0XXXXXXXXX
 */
const phoneNumberVariants = (phone) => {
  const national = nationalDigits(phone);
  if (!national) {
    const t = trim(phone);
    return t ? [t] : [];
  }
  return [
    `+251${national}`,
    `251${national}`,
    `0${national}`,
  ];
};

/**
 * True when two phone numbers resolve to the same national number (ignoring
 * format: +251…, 251…, 0…), false when both resolve but differ, null when either
 * cannot be parsed (fall back to raw string comparison by the caller).
 */
const nationalDigitsMatch = (a, b) => {
  const na = nationalDigits(a);
  const nb = nationalDigits(b);
  if (na === null || nb === null) return null;
  return na === nb;
};

/**
 * Lenient same-phone test: parsed numbers compare by national digits; when either
 * cannot be parsed, fall back to raw trimmed-string equality so we never falsely
 * reject an existing record as "different".
 */
const areSamePhone = (a, b) => {
  const m = nationalDigitsMatch(a, b);
  if (m !== null) return m;
  return trim(a) === trim(b);
};

module.exports = {
  normalizePhoneNumber,
  phoneNumberVariants,
  nationalDigits,
  nationalDigitsMatch,
  areSamePhone,
};
