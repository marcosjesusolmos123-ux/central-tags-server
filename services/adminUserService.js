const { auth, db } = require("./firebaseService");
const { normalizedUser, publicOcrState } = require("./userModel");
const { AppError } = require("../utils/adminErrors");
const { getUsageSummary } = require("./ocrQuotaService");

function authCreatedAt(userRecord) {
  return userRecord.metadata?.creationTime ? new Date(userRecord.metadata.creationTime) : null;
}

function userResult(userRecord, firestoreData = {}) {
  const user = normalizedUser(firestoreData);
  const createdAt = user.createdAt || authCreatedAt(userRecord);
  return {
    uid: userRecord.uid,
    email: userRecord.email || user.email || null,
    createdAt: createdAt?.toISOString() || null,
    ...publicOcrState(user),
    isAdmin: userRecord.customClaims?.admin === true,
  };
}

async function allAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function listUsers({ search, page, limit }) {
  const normalizedSearch = (search || "").trim().toLowerCase();
  const [authUsers, firestoreSnapshot] = await Promise.all([
    allAuthUsers(),
    db.collection("users").get(),
  ]);
  const firestoreByUid = new Map(firestoreSnapshot.docs.map((document) => [document.id, document.data()]));
  let users = authUsers.map((record) => ({ record, data: firestoreByUid.get(record.uid) || {} }));
  if (normalizedSearch) {
    users = users.filter(({ record, data }) =>
      (record.email || data.email || "").toLowerCase().includes(normalizedSearch)
    );
  }
  users.sort((a, b) =>
    (a.record.email || a.data.email || "").localeCompare(b.record.email || b.data.email || "") ||
    a.record.uid.localeCompare(b.record.uid)
  );
  const total = users.length;
  const selected = users.slice((page - 1) * limit, page * limit);
  return {
    items: selected.map(({ record, data }) => userResult(record, data)),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

async function getAuthUser(uid) {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if (error.code === "auth/user-not-found") throw new AppError(404, "USER_NOT_FOUND", "El usuario no existe.");
    throw error;
  }
}

async function getUser(uid) {
  const userRecord = await getAuthUser(uid);
  const snapshot = await db.collection("users").doc(uid).get();
  const summary = await getUsageSummary(uid);
  return { ...userResult(userRecord, snapshot.exists ? snapshot.data() : {}), usage: summary };
}

module.exports = { allAuthUsers, getAuthUser, listUsers, getUser, userResult };
