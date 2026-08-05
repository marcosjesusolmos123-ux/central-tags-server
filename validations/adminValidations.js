const { AppError } = require("../utils/adminErrors");

const DEFAULT_PAGE_LIMIT = 25;
const MAX_PAGE_LIMIT = 100;

function positiveInteger(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new AppError(400, "INVALID_INPUT", `${field} debe ser un entero entre 1 y ${maximum}.`);
  }
  return value;
}

function pagination(query = {}) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? DEFAULT_PAGE_LIMIT : Number(query.limit);
  return {
    page: positiveInteger(page, "page"),
    limit: positiveInteger(limit, "limit", MAX_PAGE_LIMIT),
  };
}

function email(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AppError(400, "INVALID_EMAIL", "El correo electrónico no es válido.");
  }
  return normalized;
}

function uid(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/.test(value)) {
    throw new AppError(400, "INVALID_UID", "El UID no es válido.");
  }
  return value;
}

function isoDate(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(value)) {
    throw new AppError(400, "INVALID_DATE", `${field} debe ser una fecha ISO válida.`);
  }
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, "INVALID_DATE", `${field} debe ser una fecha ISO válida.`);
  }
  if (value.length === 10 && date.toISOString().slice(0, 10) !== value) {
    throw new AppError(400, "INVALID_DATE", `${field} debe ser una fecha ISO válida.`);
  }
  return date;
}

function planActivation(body = {}, maximum) {
  if (body.plan !== "free" && body.plan !== "monthly") {
    throw new AppError(400, "INVALID_PLAN", 'plan debe ser "free" o "monthly".');
  }
  if (body.plan === "free") {
    return { plan: "free", ocrLimit: 50, planStartsAt: null, planExpiresAt: null };
  }
  const startsAt = isoDate(body.planStartsAt, "planStartsAt");
  const expiresAt = isoDate(body.planExpiresAt, "planExpiresAt");
  if (expiresAt <= startsAt) {
    throw new AppError(400, "INVALID_PLAN_DATES", "planExpiresAt debe ser posterior a planStartsAt.");
  }
  return {
    plan: "monthly",
    ocrLimit: positiveInteger(body.ocrLimit, "ocrLimit", maximum),
    planStartsAt: startsAt,
    planExpiresAt: expiresAt,
  };
}

function renewal(body = {}, maximum) {
  const startsAt = isoDate(body.planStartsAt, "planStartsAt");
  const expiresAt = isoDate(body.planExpiresAt, "planExpiresAt");
  if (expiresAt <= startsAt) {
    throw new AppError(400, "INVALID_PLAN_DATES", "planExpiresAt debe ser posterior a planStartsAt.");
  }
  return {
    ocrLimit: positiveInteger(body.ocrLimit, "ocrLimit", maximum),
    planStartsAt: startsAt,
    planExpiresAt: expiresAt,
  };
}

function optionalAuditDate(value, field, endOfDay = false) {
  if (!value) return null;
  const date = isoDate(value, field);
  if (endOfDay && value.length === 10) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

module.exports = { email, uid, pagination, positiveInteger, planActivation, renewal, optionalAuditDate };
