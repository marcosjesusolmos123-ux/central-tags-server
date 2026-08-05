const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { db } = require("./firebaseService");
const { getAuthUser } = require("./adminUserService");
const { normalizedUser, publicOcrState } = require("./userModel");
const { AUDIT_COLLECTION, auditEventData } = require("./auditService");
const { AppError } = require("../utils/adminErrors");

function auditState(user) {
  return publicOcrState(user);
}

async function mutateUser(uid, admin, action, buildUpdate) {
  const target = await getAuthUser(uid);
  const userRef = db.collection("users").doc(uid);
  const auditRef = db.collection(AUDIT_COLLECTION).doc();
  let before;
  let after;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    before = normalizedUser(snapshot.exists ? snapshot.data() : {});
    const update = buildUpdate(before);
    transaction.set(userRef, {
      email: target.email || before.email || null,
      createdAt: before.createdAt
        ? Timestamp.fromDate(before.createdAt)
        : target.metadata?.creationTime
          ? Timestamp.fromDate(new Date(target.metadata.creationTime))
          : FieldValue.serverTimestamp(),
      ...update,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    after = normalizedUser({ ...before, ...update, email: target.email || before.email });
    transaction.set(auditRef, auditEventData({
      admin,
      action,
      target: { uid, email: target.email },
      before: auditState(before),
      after: auditState(after),
    }));
  });
  return { uid, email: target.email || null, ...auditState(after) };
}

function setOcrEnabled(uid, enabled, admin) {
  return mutateUser(uid, admin, enabled ? "OCR_ENABLED" : "OCR_DISABLED", () => ({ ocrEnabled: enabled }));
}

function activatePlan(uid, input, admin) {
  return mutateUser(uid, admin, "PLAN_ACTIVATED", () => ({
    plan: input.plan,
    ocrEnabled: true,
    ocrLimit: input.ocrLimit,
    ocrUsed: 0,
    ocrPending: 0,
    planStartsAt: input.planStartsAt ? Timestamp.fromDate(input.planStartsAt) : null,
    planExpiresAt: input.planExpiresAt ? Timestamp.fromDate(input.planExpiresAt) : null,
  }));
}

function renewPlan(uid, input, admin) {
  return mutateUser(uid, admin, "PLAN_RENEWED", (before) => {
    if (before.plan !== "monthly") {
      throw new AppError(409, "PLAN_NOT_MONTHLY", "Solo se puede renovar un plan monthly existente.");
    }
    return {
      plan: "monthly",
      ocrEnabled: true,
      ocrLimit: input.ocrLimit,
      ocrUsed: 0,
      ocrPending: 0,
      planStartsAt: Timestamp.fromDate(input.planStartsAt),
      planExpiresAt: Timestamp.fromDate(input.planExpiresAt),
    };
  });
}

function changeLimit(uid, limit, admin) {
  return mutateUser(uid, admin, "OCR_LIMIT_CHANGED", () => ({ ocrLimit: limit }));
}

function resetUsage(uid, admin) {
  return mutateUser(uid, admin, "OCR_USAGE_RESET", () => ({ ocrUsed: 0 }));
}

module.exports = { setOcrEnabled, activatePlan, renewPlan, changeLimit, resetUsage };
