const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");

const calls = [];
let baseUrl;
let server;

function mock(path, exports) {
  const resolved = require.resolve(path);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

before(async () => {
  mock("../services/firebaseService", { auth: { verifyIdToken: async () => ({ uid: "admin-1", email: "admin@test.com", admin: true }) } });
  mock("../services/adminUserService", {
    listUsers: async (input) => { calls.push(["list", input]); return { items: [{ uid: "u1", email: "found@test.com" }], total: 1 }; },
    getUser: async (uid) => {
      if (uid === "missing") {
        const { AppError } = require("../utils/adminErrors");
        throw new AppError(404, "USER_NOT_FOUND", "El usuario no existe.");
      }
      return { uid };
    },
  });
  mock("../services/adminOcrPlanService", {
    setOcrEnabled: async (uid, enabled) => { calls.push(["enabled", uid, enabled]); return { uid, ocrEnabled: enabled }; },
    activatePlan: async (uid, input) => { calls.push(["activate", uid, input]); return { uid, ...input, ocrUsed: 0 }; },
    renewPlan: async (uid, input) => { calls.push(["renew", uid, input]); return { uid, ...input, ocrUsed: 0 }; },
    changeLimit: async (uid, limit) => { calls.push(["limit", uid, limit]); return { uid, ocrLimit: limit }; },
    resetUsage: async (uid) => { calls.push(["reset", uid]); return { uid, ocrUsed: 0 }; },
  });
  mock("../services/adminClaimsService", {
    grantAdmin: async (email) => ({ uid: "u2", email, isAdmin: true }),
    revokeAdmin: async (email) => ({ uid: "u2", email, isAdmin: false }),
  });
  mock("../services/adminStatsService", { getDashboard: async () => ({ totalUsers: 2, ocrProcessedAllTime: 7 }) });
  mock("../services/auditService", { listAuditEvents: async (input) => ({ items: [{ action: input.action }], total: 1 }) });

  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use("/admin", require("../routes/adminRoutes"));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

async function request(path, method = "GET", body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: "Bearer admin-token", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

test("administrador autorizado puede buscar usuarios por correo y paginar", async () => {
  const result = await request("/admin/users?search=found%40test.com&page=1&limit=10");
  assert.equal(result.status, 200);
  assert.equal(result.body.items[0].email, "found@test.com");
  assert.equal(calls.find((call) => call[0] === "list")[1].search, "found@test.com");
});

test("ficha individual devuelve 404 para usuario inexistente", async () => {
  const result = await request("/admin/users/missing");
  assert.equal(result.status, 404);
  assert.equal(result.body.code, "USER_NOT_FOUND");
});

test("activa y desactiva solamente el OCR", async () => {
  assert.equal((await request("/admin/users/u1/ocr/enable", "POST")).body.user.ocrEnabled, true);
  assert.equal((await request("/admin/users/u1/ocr/disable", "POST")).body.user.ocrEnabled, false);
});

test("activa plan monthly validado y reiniciado", async () => {
  const result = await request("/admin/users/u1/plan/activate", "POST", {
    plan: "monthly", ocrLimit: 200, planStartsAt: "2026-08-01", planExpiresAt: "2026-09-01",
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.ocrUsed, 0);
});

test("renueva plan monthly con fechas y límite validados", async () => {
  const result = await request("/admin/users/u1/plan/renew", "POST", {
    ocrLimit: 300, planStartsAt: "2026-09-01", planExpiresAt: "2026-10-01",
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.ocrLimit, 300);
});

test("cambia el límite sin aceptar valores negativos", async () => {
  assert.equal((await request("/admin/users/u1/ocr/limit", "PATCH", { ocrLimit: 75 })).status, 200);
  assert.equal((await request("/admin/users/u1/ocr/limit", "PATCH", { ocrLimit: -1 })).status, 400);
});

test("reinicia el contador OCR", async () => {
  const result = await request("/admin/users/u1/ocr/reset", "POST");
  assert.equal(result.body.user.ocrUsed, 0);
});

test("concede y quita administrador mediante correo validado", async () => {
  assert.equal((await request("/admin/admins/grant", "POST", { email: "USER@test.com" })).body.user.isAdmin, true);
  assert.equal((await request("/admin/admins/revoke", "POST", { email: "user@test.com" })).body.user.isAdmin, false);
  assert.equal((await request("/admin/admins/grant", "POST", { email: "invalid" })).status, 400);
});

test("dashboard devuelve estadísticas", async () => {
  const result = await request("/admin/dashboard");
  assert.equal(result.body.ocrProcessedAllTime, 7);
});

test("auditoría acepta filtros y paginación", async () => {
  const result = await request("/admin/audit-events?action=OCR_DISABLED&page=1&limit=20");
  assert.equal(result.status, 200);
  assert.equal(result.body.items[0].action, "OCR_DISABLED");
});
