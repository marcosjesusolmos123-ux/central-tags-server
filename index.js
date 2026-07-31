require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const ocrRoutes = require("./routes/ocrRoutes");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.get("/", (req, res) => {
  res.send("Central Tags Server funcionando");
});

app.use("/ocr", ocrRoutes);

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
