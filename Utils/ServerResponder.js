const ServerResponder = async (res, data) => {
  // status code 201 for create and update
  // server error 500
  // bad request 400
  // not found 404 and wrong media type
  // status code 204 for delete
  try {
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
