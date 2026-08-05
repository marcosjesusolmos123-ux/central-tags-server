const { db } = require("./firebaseService");
const { allAuthUsers } = require("./adminUserService");
const { normalizedUser, isPlanExpired } = require("./userModel");
const { getAdminConfig } = require("../config/adminConfig");

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  return new Date(value).getTime() || 0;
}

function startOfUtcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfUtcMonth(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

async function getDashboard() {
  const now = new Date();
  const [authUsers, userSnapshot, logSnapshot] = await Promise.all([
    allAuthUsers(),
    db.collection("users").get(),
    db.collectionGroup("ocrLogs").get(),
  ]);
  const authByUid = new Map(authUsers.map((user) => [user.uid, user]));
  const firestoreByUid = new Map(userSnapshot.docs.map((doc) => [doc.id, doc.data()]));
  const users = authUsers.map((record) => ({ uid: record.uid, ...normalizedUser(firestoreByUid.get(record.uid) || {}) }));
  const consumed = logSnapshot.docs.filter((doc) => doc.data().consumedCredit === true);
  const dayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);
  const today = consumed.filter((doc) => timestampMillis(doc.data().createdAt) >= dayStart).length;
  const month = consumed.filter((doc) => timestampMillis(doc.data().createdAt) >= monthStart).length;
  const config = getAdminConfig();
  const billableUnits = Math.max(0, month - config.visionMonthlyFreeUnits);
  const topUsers = users
    .sort((a, b) => b.ocrUsed - a.ocrUsed || a.uid.localeCompare(b.uid))
    .slice(0, 10)
    .map((user) => ({ uid: user.uid, email: authByUid.get(user.uid)?.email || user.email || null, ocrUsed: user.ocrUsed }));
  return {
    totalUsers: authUsers.length,
    usersWithOcrActive: users.filter((user) => user.ocrEnabled && !isPlanExpired(user, now)).length,
    ocrProcessedToday: today,
    ocrProcessedCurrentMonth: month,
    ocrProcessedAllTime: consumed.length,
    averageOcrPerUser: authUsers.length ? Number((consumed.length / authUsers.length).toFixed(2)) : 0,
    topUsers,
    estimatedVisionCostCurrentMonth: {
      amount: Number(((billableUnits / 1000) * config.visionCostPer1000).toFixed(6)),
      currency: config.visionCostCurrency,
      costPer1000Ocr: config.visionCostPer1000,
      globalMonthlyFreeUnits: config.visionMonthlyFreeUnits,
      billableUnits,
      disclaimer: "Estimación basada en registros internos; la factura de Google Cloud es la fuente definitiva.",
    },
    timezone: "UTC",
  };
}

module.exports = { getDashboard };
