const assert = require("node:assert/strict");
const http = require("node:http");
const { test } = require("node:test");
const { normalizedUser, isPlanExpired } = require("../services/userModel");

const firebasePath = require.resolve("../services/firebaseService");
const visionPath = require.resolve("../services/visionService");
const quotaPath = require.resolve("../services/ocrQuotaService");
const authMiddlewarePath = require.resolve("../middleware/authenticateFirebase");
const routePath = require.resolve("../routes/ocrRoutes");

function mock(path, exports) {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
}

async function requestOcr({ quotaError, visionResult = "texto" }) {
  let visionCalls = 0;
  class OcrLimitReachedError extends Error {}
  class OcrDisabledError extends Error { constructor() { super("OCR desactivado"); this.code = "OCR_DISABLED"; } }
  class OcrPlanExpiredError extends Error { constructor() { super("Plan vencido"); this.code = "OCR_PLAN_EXPIRED"; } }
  delete require.cache[routePath];
  delete require.cache[authMiddlewarePath];
  mock(firebasePath, { auth: { verifyIdToken: async () => ({ uid: "user" }) } });
  mock(visionPath, { client: { textDetection: async () => { visionCalls += 1; return [{ fullTextAnnotation: { text: visionResult } }]; } } });
  mock(quotaPath, {
    OcrLimitReachedError, OcrDisabledError, OcrPlanExpiredError,
    reserveOcrCredit: async () => { if (quotaError === "disabled") throw new OcrDisabledError(); if (quotaError === "expired") throw new OcrPlanExpiredError(); return {}; },
    finishOcrSuccess: async () => {}, finishOcrFailure: async () => {}, getOcrUsage: async () => ({}),
  });
  const express = require("express");
  const app = express();
  app.use("/ocr", require("../routes/ocrRoutes"));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const data = new FormData();
    data.append("image", new Blob(["fake-image"]), "image.png");
    const response = await fetch(`http://127.0.0.1:${server.address().port}/ocr/test`, { method: "POST", headers: { Authorization: "Bearer valid" }, body: data });
    return { status: response.status, body: await response.json(), visionCalls };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("usuarios antiguos reciben defaults seguros sin perder acceso a otras funciones", () => {
  const user = normalizedUser({ unrelatedField: true });
  assert.equal(user.plan, "free");
  assert.equal(user.ocrEnabled, true);
  assert.equal(user.ocrUsed, 0);
  assert.equal(user.ocrLimit, 50);
});

test("un plan monthly vencido permanece bloqueado aunque OCR esté activo", () => {
  const user = normalizedUser({ plan: "monthly", ocrEnabled: true, planExpiresAt: new Date("2020-01-01") });
  assert.equal(isPlanExpired(user), true);
});

test("OCR desactivado devuelve código específico sin llamar Google Vision", async () => {
  const result = await requestOcr({ quotaError: "disabled" });
  assert.equal(result.status, 403);
  assert.equal(result.body.code, "OCR_DISABLED");
  assert.equal(result.visionCalls, 0);
});

test("plan vencido devuelve código específico sin llamar Google Vision", async () => {
  const result = await requestOcr({ quotaError: "expired" });
  assert.equal(result.status, 403);
  assert.equal(result.body.code, "OCR_PLAN_EXPIRED");
  assert.equal(result.visionCalls, 0);
});

test("regresión: OCR normal conserva el procesamiento exitoso sin Vision real", async () => {
  const result = await requestOcr({});
  assert.equal(result.status, 200);
  assert.equal(result.body.text, "texto");
  assert.equal(result.visionCalls, 1);
});
