const express = require("express");
const authenticateFirebase = require("../middleware/authenticateFirebase");
const requireAdmin = require("../middleware/requireAdmin");
const { sendError, AppError } = require("../utils/adminErrors");
const validation = require("../validations/adminValidations");
const users = require("../services/adminUserService");
const plans = require("../services/adminOcrPlanService");
const claims = require("../services/adminClaimsService");
const stats = require("../services/adminStatsService");
const audit = require("../services/auditService");
const { getAdminConfig } = require("../config/adminConfig");

const router = express.Router();
const AUDIT_ACTIONS = new Set([
  "OCR_ENABLED", "OCR_DISABLED", "PLAN_ACTIVATED", "PLAN_RENEWED",
  "OCR_LIMIT_CHANGED", "OCR_USAGE_RESET", "ADMIN_GRANTED", "ADMIN_REVOKED",
]);

router.use(authenticateFirebase, requireAdmin);

function handler(callback) {
  return async (req, res) => {
    try {
      await callback(req, res);
    } catch (error) {
      sendError(res, error, "ADMIN_OPERATION_FAILED");
    }
  };
}

function adminIdentity(req) {
  return { uid: req.auth.uid, email: req.auth.email || null };
}

router.get("/session", (req, res) => res.json({ authorized: true }));

router.get("/users", handler(async (req, res) => {
  const paging = validation.pagination(req.query);
  const search = typeof req.query.search === "string" ? req.query.search.slice(0, 254) : "";
  res.json({ ok: true, ...(await users.listUsers({ ...paging, search })) });
}));

router.get("/users/:uid", handler(async (req, res) => {
  res.json({ ok: true, user: await users.getUser(validation.uid(req.params.uid)) });
}));

router.post("/users/:uid/ocr/enable", handler(async (req, res) => {
  const state = await plans.setOcrEnabled(validation.uid(req.params.uid), true, adminIdentity(req));
  res.json({ ok: true, user: state });
}));

router.post("/users/:uid/ocr/disable", handler(async (req, res) => {
  const state = await plans.setOcrEnabled(validation.uid(req.params.uid), false, adminIdentity(req));
  res.json({ ok: true, user: state });
}));

router.post("/users/:uid/plan/activate", handler(async (req, res) => {
  const input = validation.planActivation(req.body, getAdminConfig().maxOcrLimit);
  const state = await plans.activatePlan(validation.uid(req.params.uid), input, adminIdentity(req));
  res.json({ ok: true, user: state });
}));

router.post("/users/:uid/plan/renew", handler(async (req, res) => {
  const input = validation.renewal(req.body, getAdminConfig().maxOcrLimit);
  const state = await plans.renewPlan(validation.uid(req.params.uid), input, adminIdentity(req));
  res.json({ ok: true, user: state });
}));

router.patch("/users/:uid/ocr/limit", handler(async (req, res) => {
  const limit = validation.positiveInteger(req.body?.ocrLimit, "ocrLimit", getAdminConfig().maxOcrLimit);
  const state = await plans.changeLimit(validation.uid(req.params.uid), limit, adminIdentity(req));
  res.json({ ok: true, user: state });
}));

router.post("/users/:uid/ocr/reset", handler(async (req, res) => {
  const state = await plans.resetUsage(validation.uid(req.params.uid), adminIdentity(req));
  res.json({ ok: true, user: state });
}));

router.post("/admins/grant", handler(async (req, res) => {
  const result = await claims.grantAdmin(validation.email(req.body?.email), adminIdentity(req));
  res.json({ ok: true, user: result, message: "El usuario debe renovar su token o volver a iniciar sesión." });
}));

router.post("/admins/revoke", handler(async (req, res) => {
  const result = await claims.revokeAdmin(validation.email(req.body?.email), adminIdentity(req));
  res.json({ ok: true, user: result, message: "Las sesiones fueron revocadas; el usuario deberá volver a iniciar sesión." });
}));

router.get("/dashboard", handler(async (req, res) => {
  res.json({ ok: true, ...(await stats.getDashboard()) });
}));

router.get("/audit-events", handler(async (req, res) => {
  const paging = validation.pagination(req.query);
  const action = typeof req.query.action === "string" && req.query.action ? req.query.action : null;
  if (action && !AUDIT_ACTIONS.has(action)) throw new AppError(400, "INVALID_ACTION", "El tipo de acción no es válido.");
  const adminUid = req.query.adminUid ? validation.uid(req.query.adminUid) : null;
  const targetUid = req.query.targetUid ? validation.uid(req.query.targetUid) : null;
  const from = validation.optionalAuditDate(req.query.from, "from");
  const to = validation.optionalAuditDate(req.query.to, "to", true);
  res.json({ ok: true, ...(await audit.listAuditEvents({ ...paging, action, adminUid, targetUid, from, to })) });
}));

module.exports = router;
