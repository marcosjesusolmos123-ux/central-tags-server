const express = require("express");
const authenticateFirebase = require("../middleware/authenticateFirebase");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

router.get("/session", authenticateFirebase, requireAdmin, (req, res) => {
  return res.json({ authorized: true });
});

module.exports = router;
