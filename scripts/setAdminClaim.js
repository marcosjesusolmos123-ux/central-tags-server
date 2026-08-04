const { auth } = require("../services/firebaseService");

async function setAdminClaim() {
  const uid = process.argv[2]?.trim();

  if (!uid) {
    throw new Error("Uso: npm run set-admin -- <FIREBASE_UID>");
  }

  const user = await auth.getUser(uid);
  const currentClaims = user.customClaims || {};

  await auth.setCustomUserClaims(uid, {
    ...currentClaims,
    admin: true,
  });

  const updatedUser = await auth.getUser(uid);
  if (updatedUser.customClaims?.admin !== true) {
    throw new Error(`No se pudo verificar el claim admin para el UID ${uid}.`);
  }

  console.log(`Claim admin: true asignado y verificado para el UID ${uid}.`);
  console.log("Renová el Firebase ID Token cerrando sesión o usando getIdToken(true).");
}

setAdminClaim().catch((error) => {
  console.error(`No se pudo asignar el claim: ${error.message}`);
  process.exitCode = 1;
});
