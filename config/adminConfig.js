function nonNegativeNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} debe ser un número no negativo.`);
  return value;
}

function positiveInteger(name, fallback) {
  const value = nonNegativeNumber(name, fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} debe ser un entero positivo.`);
  return value;
}

function getAdminConfig() {
  return {
    maxOcrLimit: positiveInteger("ADMIN_MAX_OCR_LIMIT", 100000),
    visionCostPer1000: nonNegativeNumber("VISION_COST_PER_1000_OCR", 0),
    visionMonthlyFreeUnits: Math.floor(nonNegativeNumber("VISION_MONTHLY_FREE_UNITS", 0)),
    visionCostCurrency: (process.env.VISION_COST_CURRENCY || "USD").trim().toUpperCase(),
    corsOrigins: (process.env.CORS_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean),
  };
}

module.exports = { getAdminConfig };
