//import auth files
const usersData = {
  fullName: "Test User", // Schema expects fullName, not full_name
  email: "mmarew@gmail.com",
  phoneNumber: "+251911111111",
  roleId: 2, // Schema requires roleId (e.g., 2 for Shipper, 3 for Driver)
};

const axios = require("axios");
const { AUTH_ENDPOINTS } = require("../Routes/auth/APIEndPoints");
const { backendURL } = require("./constants");
//create user
const testCreateUser = async () => {
  try {
    const res = await axios.post(
      backendURL + AUTH_ENDPOINTS.CREATE_USER,
      usersData,
    );
    console.log("✅ Success! User Created:");
    console.log(res.data);
  } catch (error) {
    console.log("❌ Failed to create user.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Error:", error.message);
    }
  }
};

testCreateUser();
