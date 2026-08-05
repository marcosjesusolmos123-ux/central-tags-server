const assert = require("node:assert/strict");
const test = require("node:test");

const firebasePath = require.resolve("../services/firebaseService");
const quotaPath = require.resolve("../services/ocrQuotaService");

test("finishOcrSuccess devuelve el saldo confirmado por su transacción", async () => {
  const writes = [];
  const db = {
    runTransaction: async (callback) => callback({
      get: async () => ({
        exists: true,
        data: () => ({ plan: "free", ocrLimit: 50, ocrUsed: 0, ocrPending: 1 }),
      }),
      set: (reference, value) => writes.push({ type: "set", reference, value }),
      update: (reference, value) => writes.push({ type: "update", reference, value }),
    }),
  };
  require.cache[firebasePath] = {
    id: firebasePath,
    filename: firebasePath,
    loaded: true,
    exports: { db },
  };
  delete require.cache[quotaPath];
  const { finishOcrSuccess } = require("../services/ocrQuotaService");
  const balance = await finishOcrSuccess("user", { userRef: "user-ref", logRef: "log-ref" });

  assert.deepEqual(balance, { ocrUsed: 1, ocrLimit: 50, ocrRemaining: 49 });
  assert.equal(writes[0].value.ocrUsed, 1);
  assert.equal(writes[0].value.ocrPending, 0);
  assert.equal(writes[1].value.consumedCredit, true);
});
