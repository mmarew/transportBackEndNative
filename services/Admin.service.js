const { performJoinSelect } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const { getAttachedDocumentsByUser } = require("./attachedDocuments.service");

const adminServices = {
  // Fetch completed journeys
  getCompletedJourney: async () => {
    const query = `
      SELECT  * from Journey 
      WHERE journeyStatusId = 5;
    `;
    const [results] = await pool.query(query);
    return results;
  },

  // Fetch unauthorized drivers
  getUnauthorizedDriver: async () => {
    const sql = `
      SELECT Users.*, UserRole.*, UserRoleStatusCurrent.*
      FROM Users
      JOIN UserRole ON Users.userUniqueId = UserRole.userUniqueId
      JOIN UserRoleStatusCurrent ON UserRole.userRoleId = UserRoleStatusCurrent.userRoleId
      WHERE UserRoleStatusCurrent.statusId != ?
    `;
    const [unauthorizedUsers] = await pool.query(sql, [1]);

    const usersWithDocuments = await Promise.all(
      unauthorizedUsers.map(async (user) => {
        const documents = await getAttachedDocumentsByUser(user.userUniqueId);
        return { user, documents };
      })
    );

    return usersWithDocuments;
  },
};

module.exports = adminServices;
