const express = require("express");
const multer = require("multer");
const { client } = require("../services/visionService");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/test", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "No se recibió ninguna imagen.",
      });
    }

    const [result] = await client.textDetection(req.file.buffer);

    res.json({
      ok: true,
      text: result.fullTextAnnotation?.text || "",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
});

module.exports = router;