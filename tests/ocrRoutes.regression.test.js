const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const firebaseServicePath = require.resolve("../services/firebaseService");
const visionServicePath = require.resolve("../services/visionService");
const quotaServicePath = require.resolve("../services/ocrQuotaService");

function mockModule(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

async function withOcrServer(verifyIdToken, callback) {
  mockModule(firebaseServicePath, { auth: { verifyIdToken } });
  mockModule(visionServicePath, {
    client: {
      textDetection: async () => {
        throw new Error("Vision no debe ejecutarse en esta prueba");
      },
    },
  });
  mockModule(quotaServicePath, {
    OcrLimitReachedError: class OcrLimitReachedError extends Error {},
    reserveOcrCredit: async () => {
      throw new Error("La cuota no debe ejecutarse en esta prueba");
    },
    finishOcrSuccess: async () => {},
    finishOcrFailure: async () => {},
    getOcrUsage: async () => ({}),
  });

  const express = require("express");
  const app = express();
  app.use("/ocr", require("../routes/ocrRoutes"));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test("la ruta OCR conserva la autenticación y validación previa a la cuota", async () => {
  let verificationCalls = 0;

  await withOcrServer(async () => {
    verificationCalls += 1;
    return { uid: "ocr-user" };
  }, async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/ocr/test`, { method: "POST" });
    assert.equal(unauthenticated.status, 401);

    const missingImage = await fetch(`${baseUrl}/ocr/test`, {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
    });
    assert.equal(missingImage.status, 400);
    assert.equal(verificationCalls, 1);
  });
});
