const vision = require("@google-cloud/vision");

function getVisionClientOptions() {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;

  if (!credentialsJson) {
    return {};
  }

  try {
    const credentials = JSON.parse(credentialsJson);

    if (!credentials.client_email || !credentials.private_key) {
      throw new Error("Faltan client_email o private_key.");
    }

    return {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || credentials.project_id,
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key.replace(/\\n/g, "\n"),
      },
    };
  } catch (error) {
    throw new Error(
      `GOOGLE_CREDENTIALS_JSON no contiene credenciales válidas: ${error.message}`
    );
  }
}

const client = new vision.ImageAnnotatorClient(getVisionClientOptions());

module.exports = {
  client,
};
