const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { db } = require("./firebaseService");
const { normalizedUser, isPlanExpired, publicOcrState } = require("./userModel");

class OcrLimitReachedError extends Error {
  constructor() {
    super("No quedan capturas OCR disponibles.");
    this.name = "OcrLimitReachedError";
    this.code = "OCR_LIMIT_REACHED";
  }
}

class OcrDisabledError extends Error {
  constructor() {
    super("El OCR fue desactivado para esta cuenta.");
    this.name = "OcrDisabledError";
    this.code = "OCR_DISABLED";
  }
}

class OcrPlanExpiredError extends Error {
  constructor() {
    super("El plan mensual de OCR está vencido. Debe ser renovado por un administrador.");
    this.name = "OcrPlanExpiredError";
    this.code = "OCR_PLAN_EXPIRED";
  }
}

function refsFor(uid) {
  const userRef = db.collection("users").doc(uid);
  const logRef = userRef.collection("ocrLogs").doc();
  return { userRef, logRef };
}

async function reserveOcrCredit(uid) {
  const { userRef, logRef } = refsFor(uid);

  await db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const user = normalizedUser(userSnapshot.exists ? userSnapshot.data() : {});

    if (!user.ocrEnabled) throw new OcrDisabledError();
    if (isPlanExpired(user)) throw new OcrPlanExpiredError();
    if (user.ocrUsed + user.ocrPending >= user.ocrLimit) {
      throw new OcrLimitReachedError();
    }

    transaction.set(
      userRef,
      {
        plan: user.plan,
        ocrEnabled: user.ocrEnabled,
        ocrLimit: user.ocrLimit,
        ocrUsed: user.ocrUsed,
        ocrPending: user.ocrPending + 1,
      },
      { merge: true }
    );
    transaction.set(logRef, {
      uid,
      createdAt: FieldValue.serverTimestamp(),
      status: "processing",
      consumedCredit: false,
    });
  });

  return { userRef, logRef };
}

async function finishOcrSuccess(uid, reservation) {
  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(reservation.userRef);
    const user = normalizedUser(userSnapshot.exists ? userSnapshot.data() : {});
    const ocrUsed = user.ocrUsed + 1;
    const ocrPending = Math.max(0, user.ocrPending - 1);

    transaction.set(
      reservation.userRef,
      {
        plan: user.plan,
        ocrLimit: user.ocrLimit,
        ocrUsed,
        ocrPending,
      },
      { merge: true }
    );
    transaction.update(reservation.logRef, {
      status: "correcto",
      consumedCredit: true,
      completedAt: FieldValue.serverTimestamp(),
    });

    return {
      ocrUsed,
      ocrLimit: user.ocrLimit,
      ocrRemaining: Math.max(0, user.ocrLimit - ocrUsed - ocrPending),
    };
  });
}

async function finishOcrFailure(uid, reservation) {
  await db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(reservation.userRef);
    const user = normalizedUser(userSnapshot.exists ? userSnapshot.data() : {});

    transaction.set(
      reservation.userRef,
      {
        plan: user.plan,
        ocrLimit: user.ocrLimit,
        ocrUsed: user.ocrUsed,
        ocrPending: Math.max(0, user.ocrPending - 1),
      },
      { merge: true }
    );
    transaction.update(reservation.logRef, {
      status: "fallido",
      consumedCredit: false,
      completedAt: FieldValue.serverTimestamp(),
    });
  });
}

function utcStartOfDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function utcStartOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

async function countConsumedBetween(logsRef, from, to) {
  const snapshot = await logsRef
    .where("createdAt", ">=", Timestamp.fromDate(from))
    .where("createdAt", "<", Timestamp.fromDate(to))
    .get();
  return snapshot.docs.filter((document) => document.data().consumedCredit === true).length;
}

function parseCustomRange(fromText, toText) {
  if (!fromText && !toText) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromText || "") || !/^\d{4}-\d{2}-\d{2}$/.test(toText || "")) {
    throw new Error("El rango personalizado requiere from y to con formato YYYY-MM-DD.");
  }

  const from = new Date(`${fromText}T00:00:00.000Z`);
  const toInclusive = new Date(`${toText}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(toInclusive.getTime()) || from > toInclusive) {
    throw new Error("El rango personalizado no es válido.");
  }

  const to = new Date(toInclusive.getTime() + 24 * 60 * 60 * 1000);
  if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw new Error("El rango personalizado no puede superar 366 días.");
  }
  return { from, to, fromText, toText };
}

async function getOcrUsage(uid, query = {}) {
  const userRef = db.collection("users").doc(uid);
  const logsRef = userRef.collection("ocrLogs");
  const now = new Date();
  const end = new Date(now.getTime() + 1);
  const todayStart = utcStartOfDay(now);
  const sevenDaysStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const monthStart = utcStartOfMonth(now);
  const customRange = parseCustomRange(query.from, query.to);

  const userSnapshot = await userRef.get();
  const user = normalizedUser(userSnapshot.exists ? userSnapshot.data() : {});

  const counts = await Promise.all([
    countConsumedBetween(logsRef, todayStart, end),
    countConsumedBetween(logsRef, sevenDaysStart, end),
    countConsumedBetween(logsRef, monthStart, end),
    customRange ? countConsumedBetween(logsRef, customRange.from, customRange.to) : null,
  ]);

  return {
    ...publicOcrState(user, now),
    usedToday: counts[0],
    usedLast7Days: counts[1],
    usedCurrentMonth: counts[2],
    customRange: customRange
      ? { from: customRange.fromText, to: customRange.toText, used: counts[3] }
      : null,
    timezone: "UTC",
  };
}

async function getUsageSummary(uid) {
  const usage = await getOcrUsage(uid);
  return {
    today: usage.usedToday,
    last7Days: usage.usedLast7Days,
    currentMonth: usage.usedCurrentMonth,
    timezone: usage.timezone,
  };
}

module.exports = {
  OcrLimitReachedError,
  OcrDisabledError,
  OcrPlanExpiredError,
  reserveOcrCredit,
  finishOcrSuccess,
  finishOcrFailure,
  getOcrUsage,
  getUsageSummary,
};
