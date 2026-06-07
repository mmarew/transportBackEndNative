const { default: axios } = require("axios");
const { backendURL, usersData } = require("../constants");

///api/user/delinquencyResponse
const api = "/api/user/delinquencyResponse";
//create delinquency responses

  const testCreateDelinquencyResponse = async () => {
    const token=usersData.driver.token
    const Payload = {},
  const config = authConfig(token);
  const resultOf = await axios.post(
    backendURL + api,
    Payload,
    config,
  );
};
const testGetDelinquencyResponse = async () => {};
const testUpdateDelinquencyResponse = async () => {};
const testDeleteDelinquencyResponse = async () => {};

const testDelinquencyResponseWorkflows = async () => {};
module.exports = {
  testDelinquencyResponseWorkflows,
  testCreateDelinquencyResponse,
  testGetDelinquencyResponse,
  testUpdateDelinquencyResponse,
  testDeleteDelinquencyResponse,
};
