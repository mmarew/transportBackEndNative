// utils/routeUtils.js

/**
 * Registers multiple routes on a router
 * @param {Object} router - Express router instance
 * @param {Array} routes - Array of route configuration objects
 */
const registerRoutes = (router, routes) => {
  routes.forEach((route) => {
    const { method, path, middleware = [], handler } = route;

    // Validate route configuration
    if (!method || !path || !handler) {
      console.error("Invalid route configuration:", route);
      throw new Error(
        "Route configuration must include method, path, and handler"
      );
    }

    // Ensure middleware is an array
    const middlewares = Array.isArray(middleware) ? middleware : [middleware];

    // Register the route
    router[method.toLowerCase()](path, ...middlewares, handler);

    // console.log(`Registered ${method.toUpperCase()} ${path}`);
  });
};

module.exports = { registerRoutes };
