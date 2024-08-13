const ServerResponder = async (res, data) => {
  try {
    // console.log("ServerResponder", data);
    let { message } = data;
    if (message == "error") {
      res.status(500).json(data);
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "error", error: "something went wrong" });
  }
};
module.exports = ServerResponder;
