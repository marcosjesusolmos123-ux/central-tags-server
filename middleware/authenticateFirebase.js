const { auth } = require("../services/firebaseService");

async function authenticateFirebase(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      ok: false,
      code: "AUTH_REQUIRED",
      message: "Se requiere un token de Firebase en Authorization: Bearer <token>.",
    });
  }

  try {
    const decodedToken = await auth.verifyIdToken(match[1], true);
    req.auth = { uid: decodedToken.uid };
    return next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      code: "INVALID_TOKEN",
      message: "El token de Firebase es inválido, venció o fue revocado.",
    });
  }
}

module.exports = authenticateFirebase;
