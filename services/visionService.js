const vision = require("@google-cloud/vision");
const path = require("path");

const client = new vision.ImageAnnotatorClient({
  keyFilename: path.join(
    __dirname,
    "../credentials/central-tags-ocr-2ab212dea179.json"
  ),
});

module.exports = {
  client,
};