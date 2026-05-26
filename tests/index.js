//import auth files
const usersData = {
  full_name: "Test User",
  email: "mmarew@gmail.com",
  phoneNumber: "+251911111111",
  otp: "1234",
};

const axios = require("axios");
//create user

const testCreateUser = async () => {
  const res = await axios.post(
    "http://localhost:3000/api/user/createUser",
    usersData,
  );
  console.log(res.data);
};

testCreateUser();
//create user, driver and shipper

//verify user by otp
