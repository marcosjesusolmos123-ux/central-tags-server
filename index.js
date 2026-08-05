require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const ocrRoutes = require("./routes/ocrRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { getAdminConfig } = require("./config/adminConfig");

const app = express();

const allowedOrigins = getAdminConfig().corsOrigins;
app.use(cors(allowedOrigins.length ? {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
} : undefined));
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get("/", (req, res) => {
  res.send("Central Tags Server funcionando");
});

app.use("/ocr", ocrRoutes);
app.use("/admin", adminRoutes);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
  });
}

module.exports = app;
