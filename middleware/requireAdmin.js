function requireAdmin(req, res, next) {
  if (req.auth?.admin !== true) {
    return res.status(403).json({
      authorized: false,
      code: "ADMIN_REQUIRED",
      message: "La cuenta autenticada no tiene permisos de administrador.",
    });
  }

  return next();
}

module.exports = requireAdmin;
