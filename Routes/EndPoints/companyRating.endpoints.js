"use strict";

const COMPANY_RATING_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_COMPANY_RATING: "/api/company/ratings",
  GET_COMPANY_RATINGS: "/api/company/ratings",
  GET_COMPANY_AVERAGE_RATING: "/api/company/ratings/average/:companyUniqueId",
  UPDATE_COMPANY_RATING: "/api/company/ratings/:companyRatingUniqueId",
  DELETE_COMPANY_RATING: "/api/company/ratings/:companyRatingUniqueId",

  // Relative paths — used by Express router (already mounted at /api/company/ratings)
  ROUTER: {
    CREATE_COMPANY_RATING: "/",
    GET_COMPANY_RATINGS: "/",
    GET_COMPANY_AVERAGE_RATING: "/average/:companyUniqueId",
    UPDATE_COMPANY_RATING: "/:companyRatingUniqueId",
    DELETE_COMPANY_RATING: "/:companyRatingUniqueId",
  },

  // Mount prefix — used by company/index.js
  MOUNT: "/ratings",
};

module.exports = { COMPANY_RATING_ENDPOINTS };