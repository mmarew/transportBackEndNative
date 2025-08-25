/**
 * Validates pagination parameters
 * @param {Number} page - Page number
 * @param {Number} limit - Items per page
 * @param {Number} maxLimit - Maximum allowed limit
 * @returns {Object} Validated page and limit values
 */
const validatePagination = (page, limit, maxLimit = 100) => {
  let validatedPage = parseInt(page) || 1;
  let validatedLimit = parseInt(limit) || 10;

  // Ensure page is at least 1
  validatedPage = Math.max(1, validatedPage);

  // Ensure limit is within bounds
  validatedLimit = Math.max(1, Math.min(validatedLimit, maxLimit));

  return { page: validatedPage, limit: validatedLimit };
};

/**
 * Generates pagination metadata
 * @param {Number} totalCount - Total number of items
 * @param {Number} currentPage - Current page number
 * @param {Number} limit - Number of items per page
 * @returns {Object} Pagination metadata
 */
const generatePagination = (totalCount, currentPage, limit) => {
  const totalPages = Math.ceil(totalCount / limit);

  return {
    currentPage: parseInt(currentPage),
    totalPages,
    totalCount,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
    limit: parseInt(limit),
  };
};

/**
 * Generates pagination links for API responses
 * @param {String} baseUrl - Base URL for the endpoint
 * @param {Object} query - Original query parameters
 * @param {Object} pagination - Pagination metadata
 * @returns {Object} Links for next and previous pages
 */
const generatePaginationLinks = (baseUrl, query, pagination) => {
  const { currentPage, totalPages, hasNext, hasPrev } = pagination;

  const links = {};
  const queryParams = new URLSearchParams(query);

  if (hasNext) {
    queryParams.set("page", currentPage + 1);
    links.next = `${baseUrl}?${queryParams.toString()}`;
  }

  if (hasPrev) {
    queryParams.set("page", currentPage - 1);
    links.prev = `${baseUrl}?${queryParams.toString()}`;
  }

  queryParams.set("page", 1);
  links.first = `${baseUrl}?${queryParams.toString()}`;

  queryParams.set("page", totalPages);
  links.last = `${baseUrl}?${queryParams.toString()}`;

  return links;
};

module.exports = {
  validatePagination,
  generatePagination,
  generatePaginationLinks,
};
