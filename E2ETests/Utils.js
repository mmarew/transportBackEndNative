const authConfig = (token) => ({
  headers: { Authorization: `Bearer ${token}` },
});
module.exports = { authConfig };
