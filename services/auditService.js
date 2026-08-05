const { FieldValue } = require("firebase-admin/firestore");
const { db } = require("./firebaseService");
const { AppError } = require("../utils/adminErrors");

const AUDIT_COLLECTION = "adminAuditEvents";

function cleanValues(values) {
  if (!values) return null;
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function auditEventData({ admin, action, target, before, after }) {
  return {
    adminUid: admin.uid,
    adminEmail: admin.email || null,
    action,
    targetUid: target.uid,
    targetEmail: target.email || null,
    createdAt: FieldValue.serverTimestamp(),
    before: cleanValues(before),
    after: cleanValues(after),
  };
}

async function writeAuditEvent({ admin, action, target, before, after }) {
  await db.collection(AUDIT_COLLECTION).add(auditEventData({ admin, action, target, before, after }));
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  return new Date(value).getTime() || 0;
}

function serializeEvent(document) {
  const data = document.data();
  return {
    id: document.id,
    adminUid: data.adminUid,
    adminEmail: data.adminEmail || null,
    action: data.action,
    targetUid: data.targetUid,
    targetEmail: data.targetEmail || null,
    createdAt: data.createdAt?.toDate?.().toISOString() || null,
    before: data.before || null,
    after: data.after || null,
  };
}

async function listAuditEvents({ page, limit, adminUid, targetUid, action, from, to }) {
  if (from && to && from >= to) throw new AppError(400, "INVALID_DATE_RANGE", "El rango de fechas no es válido.");
  const snapshot = await db.collection(AUDIT_COLLECTION).get();
  let documents = snapshot.docs;
  if (adminUid) documents = documents.filter((doc) => doc.data().adminUid === adminUid);
  if (targetUid) documents = documents.filter((doc) => doc.data().targetUid === targetUid);
  if (action) documents = documents.filter((doc) => doc.data().action === action);
  if (from) documents = documents.filter((doc) => millis(doc.data().createdAt) >= from.getTime());
  if (to) documents = documents.filter((doc) => millis(doc.data().createdAt) < to.getTime());
  documents.sort((a, b) => millis(b.data().createdAt) - millis(a.data().createdAt) || a.id.localeCompare(b.id));
  const total = documents.length;
  const offset = (page - 1) * limit;
  return { items: documents.slice(offset, offset + limit).map(serializeEvent), page, limit, total, totalPages: Math.ceil(total / limit) };
}

module.exports = { AUDIT_COLLECTION, auditEventData, writeAuditEvent, listAuditEvents };
