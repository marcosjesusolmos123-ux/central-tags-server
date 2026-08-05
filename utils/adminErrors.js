class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

function sendError(res, error, fallbackCode = "INTERNAL_ERROR") {
  if (error instanceof AppError) {
    return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
  }

  console.error(error);
  return res.status(500).json({
    ok: false,
    code: fallbackCode,
    message: "Ocurrió un error interno. Intentá nuevamente.",
  });
}

module.exports = { AppError, sendError };
