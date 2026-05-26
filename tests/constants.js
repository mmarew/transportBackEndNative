const backendURL = "http://localhost:3000";

const usersData = {
  fullName: "Test User", // Schema expects fullName, not full_name
  email: "mmarew@gmail.com",
  phoneNumber: "+251911111111",
  roleId: 2, // Schema requires roleId (e.g., 2 for Shipper, 3 for Driver)
  OTP: 101010, // Schema requires an OTP for verification
};

module.exports = {
  backendURL,
  usersData,
};
