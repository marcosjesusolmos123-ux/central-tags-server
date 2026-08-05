const express = require("express");
const multer = require("multer");
const { client } = require("../services/visionService");
const authenticateFirebase = require("../middleware/authenticateFirebase");
const {
  OcrLimitReachedError,
  OcrDisabledError,
  OcrPlanExpiredError,
  reserveOcrCredit,
  finishOcrSuccess,
  finishOcrFailure,
  getOcrUsage,
} = require("../services/ocrQuotaService");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/test", authenticateFirebase, upload.single("image"), async (req, res) => {
  let reservation;

  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "No se recibió ninguna imagen.",
      });
    }

    reservation = await reserveOcrCredit(req.auth.uid);

    let result;
    try {
      [result] = await client.textDetection(req.file.buffer);
    } catch (error) {
      await finishOcrFailure(req.auth.uid, reservation);
      reservation = null;
      throw error;
    }

    await finishOcrSuccess(req.auth.uid, reservation);
    reservation = null;

    res.json({
      ok: true,
      text: result.fullTextAnnotation?.text || "",
    });
  } catch (error) {
    if (error instanceof OcrLimitReachedError) {
      return res.status(429).json({
        ok: false,
        code: error.code,
        message: error.message,
      });
    }

    if (error instanceof OcrDisabledError || error instanceof OcrPlanExpiredError) {
      return res.status(403).json({ ok: false, code: error.code, message: error.message });
    }

    console.error(error);

    res.status(500).json({
      ok: false,
      code: "OCR_PROCESSING_FAILED",
      message: "No se pudo procesar la imagen. No se consumió ninguna captura.",
    });
  }
});

router.get("/usage", authenticateFirebase, async (req, res) => {
  try {
    const usage = await getOcrUsage(req.auth.uid, req.query);
    return res.json({ ok: true, ...usage });
  } catch (error) {
    if (error.message.includes("rango personalizado")) {
      return res.status(400).json({ ok: false, code: "INVALID_DATE_RANGE", message: error.message });
    }

    console.error(error);
    return res.status(500).json({
      ok: false,
      code: "USAGE_QUERY_FAILED",
      message: "No se pudo consultar el uso de OCR.",
    });
  }
});

module.exports = router;
