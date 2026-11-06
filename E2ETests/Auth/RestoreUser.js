"use strict";

/**
 * POST /api/user/restoreUser — undo an accidental soft delete by phone number.
 *
 * deleteUser blocks an account in two places: Users.isDeleted/userDeletedAt
 * (every request 403s, login refuses) and UserRoleStatusCurrent.statusId = 8
 * (ACCOUNT_DELETED). The restore endpoint must undo both, leave the audit row
 * behind, and refuse anything that is not an actual restore:
 *   - unknown phone                → 404
 *   - account that is not deleted  → 409
 *   - caller that is not admin     → 403
 *
 * The test provisions its OWN throwaway shipper account, so it never touches the
 * canonical users other suites depend on, and soft-deletes it again at the end.
 */

const axios = require("axios");
const { backendURL, usersData, usersRoles, runId } = require("../constants");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");
const { AUTH_ENDPOINTS } = require("../../Routes/EndPoints/auth.endpoints");
const { USER_ENDPOINTS } = require("../../Routes/EndPoints/user.endpoints");
const { ensureUser } = require("./ensureUser");

const errMsg = err => {
  const data = err?.response?.data;
  const e = data?.error;
  if (typeof e === "object") return JSON.stringify(e).slice(0, 300);
  if (typeof e === "string") return e;
  return err?.message || "unknown error";
};

const buildThrowawayUser = () => {
  const suffix = String(Date.now()).slice(-3);
  return {
    fullName: "E2E Restore Candidate",
    phoneNumber: `+2519${runId}${suffix}`,
    // .com on purpose: the register validator uses Joi's email TLD allowlist,
    // which rejects reserved TLDs such as `.test` with a 400.
    email: `restore.e2e.${runId}.${suffix}@e2e-test.com`,
    roleId: usersRoles.shipperRoleId,
    statusId: 1,
  };
};

/** Admin directory read — also the proof that the row is visible again. */
const findUserByPhone = async (adminToken, phoneNumber, roleId) => {
  const res = await axios.get(
    backendURL + USER_ENDPOINTS.GET_USER_BY_FILTER_DETAILED,
    {
      ...authConfig(adminToken),
      params: { phoneNumber, roleId, exactMatch: true, limit: 20, page: 1 },
    },
  );
  const rows = res.data?.data || [];
  const match = rows.find(
    row => (row?.user?.phoneNumber || row?.phoneNumber) === phoneNumber,
  );
  if (!match) return null;
  const roles = match.rolesAndStatuses || [];
  const roleStatus = roles.find(entry => entry?.userRoles?.roleId === roleId);
  return {
    userUniqueId: match.user?.userUniqueId || match.userUniqueId,
    isDeleted: match.user?.isDeleted ?? match.isDeleted ?? null,
    statusId:
      roleStatus?.userRoleStatuses?.statusId ??
      match.statusId ??
      null,
  };
};

const loginAttempt = async (phoneNumber, roleId) => {
  const res = await axios.post(backendURL + AUTH_ENDPOINTS.LOGIN_USER, {
    phoneNumber,
    roleId,
  });
  return res.data;
};

const testRestoreUser = async () => {
  const adminToken = usersData?.admin?.token || usersData?.supperAdmin?.token;
  const nonAdminToken = usersData?.shipper?.token;
  if (!adminToken) {
    return report.skip("POST /api/user/restoreUser", "no admin token available");
  }

  const candidate = buildThrowawayUser();
  let userUniqueId = null;

  const deleteCandidate = async () => {
    if (!userUniqueId) return;
    try {
      await axios.delete(
        backendURL + `/api/user/users/${userUniqueId}`,
        authConfig(adminToken),
      );
    } catch (error) {
      // Already gone (or the test never got that far) — cleanup is best-effort.
      if (error?.response?.status !== 404) {
        console.warn("⚠️  restoreUser cleanup failed:", errMsg(error));
      }
    }
  };

  console.log("\n── POST /api/user/restoreUser ──");

  try {
    // 1. Provision a throwaway account.
    await axios.post(backendURL + AUTH_ENDPOINTS.CREATE_USER, candidate);
    const created = await findUserByPhone(
      adminToken,
      candidate.phoneNumber,
      candidate.roleId,
    );
    if (!created?.userUniqueId) {
      throw new Error("Throwaway user was not visible in the admin directory");
    }
    userUniqueId = created.userUniqueId;
    report.pass("restoreUser: candidateCreated");

    // 2. Delete it (the accidental deletion we are undoing).
    await axios.delete(
      backendURL + `/api/user/users/${userUniqueId}`,
      authConfig(adminToken),
    );
    const whileDeleted = await findUserByPhone(
      adminToken,
      candidate.phoneNumber,
      candidate.roleId,
    );
    if (whileDeleted) {
      throw new Error("Deleted account is still listed by the admin directory");
    }
    report.pass("restoreUser: candidateDeleted");

    // 3. The block is real: login must be refused while the account is deleted.
    try {
      await loginAttempt(candidate.phoneNumber, candidate.roleId);
      report.fail(
        "restoreUser: blockIsReal",
        new Error("login succeeded for a deleted account"),
      );
    } catch (blockedError) {
      const status = blockedError?.response?.status;
      if (status === 403 || status === 404) {
        report.guard("restoreUser: blockIsReal", status);
      } else {
        throw blockedError;
      }
    }

    // 4. Restore it by phone number.
    const restoreRes = await axios.post(
      backendURL + USER_ENDPOINTS.RESTORE_USER,
      { phoneNumber: candidate.phoneNumber },
      authConfig(adminToken),
    );
    const restoredRoles = restoreRes.data?.data?.roles || [];
    if (restoreRes.data?.data?.userUniqueId !== userUniqueId) {
      throw new Error(
        `Restore resolved the wrong account (${restoreRes.data?.data?.userUniqueId})`,
      );
    }
    if (restoredRoles.length === 0) {
      throw new Error("Restore returned no roles");
    }
    if (restoredRoles.some(role => Number(role.statusId) === 8)) {
      throw new Error("A role was left on ACCOUNT_DELETED (8) after restore");
    }
    report.pass("restoreUser: restored");

    // 5. The account is usable again: visible in the directory and able to login.
    const afterRestore = await findUserByPhone(
      adminToken,
      candidate.phoneNumber,
      candidate.roleId,
    );
    if (!afterRestore) {
      throw new Error("Restored account is not visible in the admin directory");
    }
    if (Number(afterRestore.isDeleted) === 1) {
      throw new Error("Restored account still has isDeleted = 1");
    }
    if (Number(afterRestore.statusId) === 8) {
      throw new Error("Restored role is still on ACCOUNT_DELETED (8)");
    }
    report.pass("restoreUser: directoryShowsActiveAccount");

    const loginRes = await loginAttempt(candidate.phoneNumber, candidate.roleId);
    if (!loginRes?.data?.userUniqueId && !loginRes?.message) {
      throw new Error("Login returned neither a user nor a message after restore");
    }
    report.pass("restoreUser: loginWorksAgain");

    // 6. Guards.
    try {
      await axios.post(
        backendURL + USER_ENDPOINTS.RESTORE_USER,
        { phoneNumber: "+251900000000" },
        authConfig(adminToken),
      );
      report.fail(
        "restoreUser: unknownPhoneRejected",
        new Error("restore accepted a phone number that does not exist"),
      );
    } catch (unknownError) {
      const status = unknownError?.response?.status;
      if (status === 404) {
        report.guard("restoreUser: unknownPhoneRejected", status);
      } else {
        throw unknownError;
      }
    }

    try {
      await axios.post(
        backendURL + USER_ENDPOINTS.RESTORE_USER,
        { phoneNumber: candidate.phoneNumber },
        authConfig(adminToken),
      );
      report.fail(
        "restoreUser: liveAccountRejected",
        new Error("restore accepted an account that is not deleted"),
      );
    } catch (liveError) {
      const status = liveError?.response?.status;
      if (status === 409) {
        report.guard("restoreUser: liveAccountRejected", status);
      } else {
        throw liveError;
      }
    }

    if (!nonAdminToken) {
      report.skip("restoreUser: nonAdminRejected", "no shipper token available");
    } else {
      try {
        await axios.post(
          backendURL + USER_ENDPOINTS.RESTORE_USER,
          { phoneNumber: candidate.phoneNumber },
          authConfig(nonAdminToken),
        );
        report.fail(
          "restoreUser: nonAdminRejected",
          new Error("a non-admin caller was allowed to restore an account"),
        );
      } catch (authError) {
        const status = authError?.response?.status;
        if (status === 403) {
          report.guard("restoreUser: nonAdminRejected", status);
        } else {
          throw authError;
        }
      }
    }

    console.log("✅ Restore deleted user test PASSED\n");
  } catch (error) {
    console.error("\n❌ Restore deleted user test FAILED:", error.message);
    if (error.response) console.error("API error:", error.response.data);
    report.fail("restoreUser", error);
  } finally {
    await deleteCandidate();
  }
};

/**
 * Delete + restore the CANONICAL driver account.
 *
 * Phase K of the suite soft-deletes `usersData.driver` (TestUntested/
 * testDeleteUser) so the delete endpoint gets exercised — which leaves the
 * driver account blocked for every later run, and was exactly how an account
 * got "accidentally deleted". This step restores it by phone number, proves the
 * pre-deletion token no longer works once its sessions were revoked, and
 * re-provisions a fresh driver token so the run ends with a usable driver.
 */
const testRestoreDeletedDriver = async () => {
  const adminToken = usersData?.admin?.token || usersData?.supperAdmin?.token;
  const driver = usersData?.driver;
  if (!adminToken || !driver?.phoneNumber || !driver?.roleId) {
    return report.skip(
      "restoreDeletedDriver",
      "no admin token or driver phone available",
    );
  }

  console.log("\n── Delete + restore the canonical driver account ──");

  // Only undo a deletion this suite actually performed — never restore over a
  // live account, that would be a no-op 409 and hide a broken delete step.
  try {
    await loginAttempt(driver.phoneNumber, driver.roleId);
    return report.skip(
      "restoreDeletedDriver: blockedWhileDeleted",
      "driver account is not deleted — the delete step did not run",
    );
  } catch (blockedError) {
    const status = blockedError?.response?.status;
    if (status !== 403 && status !== 404) throw blockedError;
    report.guard("restoreDeletedDriver: blockedWhileDeleted", status);
  }

  const oldToken = driver.token || null;

  try {
    const restoreRes = await axios.post(
      backendURL + USER_ENDPOINTS.RESTORE_USER,
      { phoneNumber: driver.phoneNumber },
      authConfig(adminToken),
    );
    const data = restoreRes.data?.data || {};
    const expectedUid =
      driver.userUniqueId || driver.accountData?.userData?.userUniqueId;
    if (expectedUid && data.userUniqueId && data.userUniqueId !== expectedUid) {
      throw new Error(
        `Restore resolved ${data.userUniqueId}, expected ${expectedUid}`,
      );
    }
    const roles = data.roles || [];
    if (roles.length === 0) throw new Error("Restore returned no roles");
    if (roles.some(role => Number(role.statusId) === 8)) {
      throw new Error("A driver role was left on ACCOUNT_DELETED (8)");
    }
    report.pass("restoreDeletedDriver: restored");

    // Sessions created before the deletion must not survive the restore.
    if (oldToken && Number(data.sessionsRevoked) > 0) {
      try {
        await axios.get(backendURL + USER_ENDPOINTS.GET_SELF, authConfig(oldToken));
        report.fail(
          "restoreDeletedDriver: staleTokenRejected",
          new Error("a token minted before the deletion still authenticates"),
        );
      } catch (tokenError) {
        const tokenStatus = tokenError?.response?.status;
        if (tokenStatus === 401) {
          report.guard("restoreDeletedDriver: staleTokenRejected", tokenStatus);
        } else {
          throw tokenError;
        }
      }
    }

    // A fresh login must work, and the run must end with a usable driver token.
    const refreshed = await ensureUser({
      userType: "driver",
      options: { force: true },
    });
    if (!refreshed?.token) {
      throw new Error("Driver could not log in again after the restore");
    }
    report.pass("restoreDeletedDriver: driverCanLoginAgain");

    const self = await axios.get(
      backendURL + USER_ENDPOINTS.GET_SELF,
      authConfig(refreshed.token),
    );
    if (self.status !== 200) {
      throw new Error(`GET /api/user/self returned ${self.status}`);
    }
    report.pass("restoreDeletedDriver: authenticatedRequestWorks");

    console.log("✅ Delete + restore driver account test PASSED\n");
  } catch (error) {
    console.error("\n❌ Delete + restore driver account test FAILED:", error.message);
    if (error.response) console.error("API error:", error.response.data);
    report.fail("restoreDeletedDriver", error);
  }
};

module.exports = { testRestoreUser, testRestoreDeletedDriver };
