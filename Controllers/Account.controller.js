const ServerResponder = require("../Utils/ServerResponder");
const AccountService = require("../Services/Account.service");

// GET /api/account/status/:userUniqueId
const accountStatus = async (req, res) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    let ownerUserUniqueId = req?.query?.ownerUserUniqueId;
    let enableDocumentChecks = req?.query?.enableDocumentChecks;
    if (!ownerUserUniqueId || ownerUserUniqueId == "self") {
      ownerUserUniqueId = userUniqueId;
    }

    const result = await AccountService.accountStatus({
      ownerUserUniqueId,
      user,
      body: req.body,
      enableDocumentChecks,
    });

    ServerResponder(res, result);
  } catch (error) {
    console.log("@Account.controllers.accountStatus error", error);
    ServerResponder(res, {
      message: "error",
      error: "unable to verify requirements",
    });
  }
};

module.exports = {
  accountStatus,
};
