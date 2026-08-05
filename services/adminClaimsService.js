const { randomUUID } = require("node:crypto");
const { Timestamp } = require("firebase-admin/firestore");
const { auth, db } = require("./firebaseService");
const { allAuthUsers } = require("./adminUserService");
const { writeAuditEvent } = require("./auditService");
const { AppError } = require("../utils/adminErrors");

async function findByEmail(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") throw new AppError(404, "USER_NOT_FOUND", "No existe un usuario con ese correo.");
    throw error;
  }
}

async function grantAdmin(email, admin) {
  const target = await findByEmail(email);
  const beforeClaims = target.customClaims || {};
  const afterClaims = { ...beforeClaims, admin: true };
  await auth.setCustomUserClaims(target.uid, afterClaims);
  try {
    await writeAuditEvent({
      admin,
      action: "ADMIN_GRANTED",
      target: { uid: target.uid, email: target.email },
      before: { admin: beforeClaims.admin === true },
      after: { admin: true },
    });
  } catch (error) {
    await auth.setCustomUserClaims(target.uid, beforeClaims).catch(() => {});
    throw error;
  }
  return { uid: target.uid, email: target.email || null, isAdmin: true, tokenRefreshRequired: true };
}

async function acquireRevokeLock() {
  const ref = db.collection("systemLocks").doc("adminClaimRevoke");
  const owner = randomUUID();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() : {};
    const expiresAt = current.expiresAt?.toMillis?.() || 0;
    if (expiresAt > Date.now()) {
      throw new AppError(409, "ADMIN_CHANGE_IN_PROGRESS", "Hay otro cambio de administradores en curso. Intentá nuevamente.");
    }
    transaction.set(ref, { owner, expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  });
  return async () => {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists && snapshot.data().owner === owner) transaction.delete(ref);
    }).catch(() => {});
  };
}

async function revokeAdmin(email, admin) {
  const target = await findByEmail(email);
  if (target.uid === admin.uid) {
    throw new AppError(409, "CANNOT_REVOKE_SELF", "No podés quitarte tu propio permiso de administrador.");
  }
  if (target.customClaims?.admin !== true) {
    throw new AppError(409, "ADMIN_NOT_ASSIGNED", "El usuario no posee permiso de administrador.");
  }
  const releaseLock = await acquireRevokeLock();
  try {
    const administrators = (await allAuthUsers()).filter((user) => user.customClaims?.admin === true);
    if (administrators.length <= 1) {
      throw new AppError(409, "LAST_ADMIN_PROTECTED", "No se puede quitar el permiso al último administrador.");
    }
    const beforeClaims = target.customClaims || {};
    const { admin: ignored, ...afterClaims } = beforeClaims;
    await auth.setCustomUserClaims(target.uid, afterClaims);
    try {
      await auth.revokeRefreshTokens(target.uid);
      await writeAuditEvent({
        admin,
        action: "ADMIN_REVOKED",
        target: { uid: target.uid, email: target.email },
        before: { admin: true },
        after: { admin: false },
      });
    } catch (error) {
      await auth.setCustomUserClaims(target.uid, beforeClaims).catch(() => {});
      throw error;
    }
    return { uid: target.uid, email: target.email || null, isAdmin: false, tokenRefreshRequired: true };
  } finally {
    await releaseLock();
  }
}

module.exports = { grantAdmin, revokeAdmin };
