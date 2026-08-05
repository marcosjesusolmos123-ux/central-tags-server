const DEFAULT_PLAN = "free";
const DEFAULT_OCR_LIMIT = 50;

function nonNegativeInteger(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function dateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedUser(data = {}) {
  const plan = data.plan === "monthly" ? "monthly" : DEFAULT_PLAN;
  return {
    email: typeof data.email === "string" ? data.email : null,
    createdAt: dateValue(data.createdAt),
    plan,
    ocrEnabled: data.ocrEnabled !== false,
    ocrLimit: nonNegativeInteger(data.ocrLimit, DEFAULT_OCR_LIMIT),
    ocrUsed: nonNegativeInteger(data.ocrUsed, 0),
    ocrPending: nonNegativeInteger(data.ocrPending, 0),
    planStartsAt: plan === "monthly" ? dateValue(data.planStartsAt) : null,
    planExpiresAt: plan === "monthly" ? dateValue(data.planExpiresAt) : null,
    updatedAt: dateValue(data.updatedAt),
  };
}

function isPlanExpired(user, now = new Date()) {
  return user.plan === "monthly" && (!user.planExpiresAt || user.planExpiresAt <= now);
}

function publicOcrState(user, now = new Date()) {
  const expired = isPlanExpired(user, now);
  return {
    plan: user.plan,
    ocrEnabled: user.ocrEnabled,
    ocrAvailable: user.ocrEnabled && !expired && user.ocrUsed + user.ocrPending < user.ocrLimit,
    ocrUsed: user.ocrUsed,
    ocrLimit: user.ocrLimit,
    ocrRemaining: Math.max(0, user.ocrLimit - user.ocrUsed - user.ocrPending),
    planStartsAt: user.planStartsAt?.toISOString() || null,
    planExpiresAt: user.planExpiresAt?.toISOString() || null,
    planExpired: expired,
    updatedAt: user.updatedAt?.toISOString() || null,
  };
}

module.exports = { DEFAULT_PLAN, DEFAULT_OCR_LIMIT, normalizedUser, isPlanExpired, publicOcrState };
