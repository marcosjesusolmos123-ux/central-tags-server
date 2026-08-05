const assert = require("node:assert/strict");
const { test } = require("node:test");

const firebasePath = require.resolve("../services/firebaseService");
const usersPath = require.resolve("../services/adminUserService");

function cache(path, exports) {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
}

function timestamp(iso) {
  const date = new Date(iso);
  return { toMillis: () => date.getTime(), toDate: () => date };
}

test("estadísticas calculan consumo, ranking y costo configurable", async () => {
  const statsPath = require.resolve("../services/adminStatsService");
  delete require.cache[statsPath];
  process.env.VISION_COST_PER_1000_OCR = "2";
  process.env.VISION_MONTHLY_FREE_UNITS = "1";
  process.env.VISION_COST_CURRENCY = "USD";
  const now = new Date();
  const current = timestamp(now.toISOString());
  const old = timestamp("2020-01-01T00:00:00.000Z");
  const userDocs = [
    { id: "u1", data: () => ({ ocrUsed: 10, ocrEnabled: true }) },
    { id: "u2", data: () => ({ ocrUsed: 3, ocrEnabled: false }) },
  ];
  const logDocs = [current, current, old].map((createdAt) => ({ data: () => ({ consumedCredit: true, createdAt }) }));
  cache(firebasePath, { db: {
    collection: () => ({ get: async () => ({ docs: userDocs }) }),
    collectionGroup: () => ({ get: async () => ({ docs: logDocs }) }),
  } });
  cache(usersPath, { allAuthUsers: async () => [
    { uid: "u1", email: "one@test.com" }, { uid: "u2", email: "two@test.com" },
  ] });
  const result = await require("../services/adminStatsService").getDashboard();
  assert.equal(result.totalUsers, 2);
  assert.equal(result.usersWithOcrActive, 1);
  assert.equal(result.ocrProcessedAllTime, 3);
  assert.equal(result.ocrProcessedCurrentMonth, 2);
  assert.equal(result.topUsers[0].uid, "u1");
  assert.equal(result.estimatedVisionCostCurrentMonth.amount, 0.002);
});

test("auditoría filtra, ordena y pagina eventos", async () => {
  const auditPath = require.resolve("../services/auditService");
  delete require.cache[auditPath];
  const docs = [
    { id: "older", data: () => ({ adminUid: "a1", targetUid: "u1", action: "OCR_ENABLED", createdAt: timestamp("2026-08-01T00:00:00Z") }) },
    { id: "newer", data: () => ({ adminUid: "a1", targetUid: "u1", action: "OCR_DISABLED", createdAt: timestamp("2026-08-02T00:00:00Z") }) },
  ];
  cache(firebasePath, { db: { collection: () => ({ get: async () => ({ docs }) }) } });
  const audit = require("../services/auditService");
  const result = await audit.listAuditEvents({ page: 1, limit: 10, adminUid: "a1", targetUid: "u1", action: "OCR_DISABLED" });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, "newer");
});
