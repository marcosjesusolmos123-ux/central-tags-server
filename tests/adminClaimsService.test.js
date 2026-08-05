const assert = require("node:assert/strict");
const { beforeEach, test } = require("node:test");

const firebasePath = require.resolve("../services/firebaseService");
const usersPath = require.resolve("../services/adminUserService");
const auditPath = require.resolve("../services/auditService");
const claimsPath = require.resolve("../services/adminClaimsService");

function loadService({ target, administrators }) {
  const claimWrites = [];
  let revokedUid = null;
  delete require.cache[claimsPath];
  const lockRef = {};
  const db = {
    collection: () => ({ doc: () => lockRef }),
    runTransaction: async (callback) => callback({
      get: async () => ({ exists: false, data: () => ({}) }),
      set: () => {}, delete: () => {},
    }),
  };
  require.cache[firebasePath] = { id: firebasePath, filename: firebasePath, loaded: true, exports: { db, auth: {
    getUserByEmail: async () => target,
    setCustomUserClaims: async (uid, claims) => claimWrites.push({ uid, claims }),
    revokeRefreshTokens: async (uid) => { revokedUid = uid; },
  } } };
  require.cache[usersPath] = { id: usersPath, filename: usersPath, loaded: true, exports: { allAuthUsers: async () => administrators } };
  require.cache[auditPath] = { id: auditPath, filename: auditPath, loaded: true, exports: { writeAuditEvent: async () => {} } };
  return { service: require("../services/adminClaimsService"), claimWrites, revoked: () => revokedUid };
}

beforeEach(() => delete require.cache[claimsPath]);

test("conceder admin conserva los custom claims actuales", async () => {
  const setup = loadService({ target: { uid: "user", email: "u@test.com", customClaims: { premium: true } }, administrators: [] });
  await setup.service.grantAdmin("u@test.com", { uid: "admin" });
  assert.deepEqual(setup.claimWrites[0].claims, { premium: true, admin: true });
});

test("impide que un administrador se quite a sí mismo", async () => {
  const setup = loadService({ target: { uid: "admin", customClaims: { admin: true } }, administrators: [] });
  await assert.rejects(() => setup.service.revokeAdmin("a@test.com", { uid: "admin" }), (error) => error.code === "CANNOT_REVOKE_SELF");
});

test("impide eliminar al último administrador", async () => {
  const target = { uid: "other", customClaims: { admin: true } };
  const setup = loadService({ target, administrators: [target] });
  await assert.rejects(() => setup.service.revokeAdmin("o@test.com", { uid: "admin" }), (error) => error.code === "LAST_ADMIN_PROTECTED");
});

test("quitar admin conserva otros claims y revoca sesiones", async () => {
  const target = { uid: "other", email: "o@test.com", customClaims: { admin: true, premium: true } };
  const setup = loadService({ target, administrators: [target, { uid: "admin", customClaims: { admin: true } }] });
  await setup.service.revokeAdmin("o@test.com", { uid: "admin" });
  assert.deepEqual(setup.claimWrites[0].claims, { premium: true });
  assert.equal(setup.revoked(), "other");
});
