const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const firebaseServicePath = require.resolve("../services/firebaseService");
const authenticatePath = require.resolve("../middleware/authenticateFirebase");
const adminRoutesPath = require.resolve("../routes/adminRoutes");

function loadAdminRoutes(verifyIdToken) {
  delete require.cache[adminRoutesPath];
  delete require.cache[authenticatePath];
  require.cache[firebaseServicePath] = {
    id: firebaseServicePath,
    filename: firebaseServicePath,
    loaded: true,
    exports: { auth: { verifyIdToken } },
  };

  return require("../routes/adminRoutes");
}

async function requestSession(verifyIdToken, authorization) {
  const express = require("express");
  const app = express();
  app.use("/admin", loadAdminRoutes(verifyIdToken));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const headers = authorization ? { Authorization: authorization } : {};
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/admin/session`,
      { headers }
    );
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test("GET /admin/session devuelve 401 sin Bearer token", async () => {
  const result = await requestSession(async () => {
    throw new Error("no debe ejecutarse");
  });

  assert.equal(result.status, 401);
  assert.equal(result.body.code, "AUTH_REQUIRED");
});

test("GET /admin/session devuelve 401 para un token inválido", async () => {
  const result = await requestSession(async () => {
    throw new Error("token inválido");
  }, "Bearer invalid-token");

  assert.equal(result.status, 401);
  assert.equal(result.body.code, "INVALID_TOKEN");
});

test("GET /admin/session devuelve 403 sin admin: true", async () => {
  const result = await requestSession(
    async () => ({ uid: "regular-user" }),
    "Bearer valid-user-token"
  );

  assert.equal(result.status, 403);
  assert.equal(result.body.authorized, false);
  assert.equal(result.body.code, "ADMIN_REQUIRED");
});

test("GET /admin/session autoriza exclusivamente admin: true", async () => {
  const result = await requestSession(
    async () => ({ uid: "admin-user", admin: true }),
    "Bearer valid-admin-token"
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { authorized: true });
});
