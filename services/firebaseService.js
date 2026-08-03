const fs = require("fs");
const path = require("path");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

function loadFirebaseCredentials() {
  if (process.env.FIREBASE_CREDENTIALS_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_CREDENTIALS_JSON);
    } catch (error) {
      throw new Error(
        `FIREBASE_CREDENTIALS_JSON no contiene credenciales válidas: ${error.message}`
      );
    }
  }

  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const credentialsPath = configuredPath
    ? path.resolve(configuredPath)
    : path.join(
        __dirname,
        "..",
        "credentials",
        "central-tags-firebase-adminsdk-fbsvc-c8767ff7e1.json"
      );

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      "No se encontraron credenciales de Firebase Admin. Configurá " +
        "FIREBASE_SERVICE_ACCOUNT_PATH o FIREBASE_CREDENTIALS_JSON."
    );
  }

  try {
    return JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  } catch (error) {
    throw new Error(`Las credenciales de Firebase Admin no son válidas: ${error.message}`);
  }
}

const credentials = loadFirebaseCredentials();
const app =
  getApps()[0] ||
  initializeApp({
    credential: cert(credentials),
    projectId: process.env.FIREBASE_PROJECT_ID || credentials.project_id,
  });

const auth = getAuth(app);
const db = process.env.FIRESTORE_DATABASE_ID
  ? getFirestore(app, process.env.FIRESTORE_DATABASE_ID)
  : getFirestore(app);

module.exports = { auth, db };
