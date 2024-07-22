const ServerResponder = async (res, data) => {
  // console.log("ServerResponder", data);
  let { message } = data;
  if (message == "error") {
    res.status(500).json(data);
  } else {
    res.status(200).json(data);
  }
};
module.exports = ServerResponder;
