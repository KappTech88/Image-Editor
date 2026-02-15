require("dotenv").config();
const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");

const app = express();
const PORT = process.env.PORT || 3001;

// API key from environment
const API_KEY = process.env.MODELSLAB_API_KEY;
if (!API_KEY) {
  console.error("MODELSLAB_API_KEY is not set in .env file");
  process.exit(1);
}

// Constants
const API_BASE = "https://modelslab.com/api/v6";
const FETCH_TIMEOUT = 30000;
const MAX_PROMPT_LENGTH = 1000;
const MODEL_ID = "flux";
const VALID_ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"];
const VALID_RESOLUTIONS = ["1k", "2k"];

// Security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
  })
);

// Rate limiting
app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Body parser (large limit for base64 images)
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

/**
 * POST /api/edit - Image edit endpoint
 */
const validateEdit = [
  body("prompt")
    .trim()
    .notEmpty()
    .withMessage("Prompt is required")
    .isLength({ max: MAX_PROMPT_LENGTH })
    .withMessage("Prompt too long"),
  body("initImage")
    .trim()
    .notEmpty()
    .withMessage("Source image is required"),
  body("strength")
    .optional()
    .isFloat({ min: 0.1, max: 1.0 })
    .withMessage("Strength must be between 0.1 and 1.0"),
  body("aspectRatio")
    .optional()
    .isIn(VALID_ASPECT_RATIOS)
    .withMessage("Invalid aspect ratio"),
  body("resolution")
    .optional()
    .isIn(VALID_RESOLUTIONS)
    .withMessage("Invalid resolution"),
];

app.post("/api/edit", validateEdit, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { prompt, initImage, strength, aspectRatio, resolution } = req.body;

  try {
    const requestBody = {
      key: API_KEY,
      model_id: MODEL_ID,
      prompt: prompt,
      init_image: initImage,
      width: "512",
      height: "512",
      samples: "1",
      num_inference_steps: "30",
      guidance_scale: 7.5,
      strength: strength || 0.7,
      safety_checker: "no",
      seed: null,
      webhook: null,
      track_id: null,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(`${API_BASE}/images/img2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (data.status === "error") {
      return res.status(400).json({ error: data.message || "API returned an error" });
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || "API request failed" });
    }

    if (data.status === "processing") {
      return res.json({
        status: "processing",
        id: data.id,
        eta: data.eta,
      });
    }

    res.json({
      status: "success",
      images: data.output || [],
    });
  } catch (err) {
    console.error("Edit API Error:", err.message);
    if (err.name === "AbortError") {
      return res.status(408).json({ error: "Request timed out" });
    }
    res.status(500).json({ error: "Failed to edit image: " + err.message });
  }
});

/**
 * POST /api/fetch - Poll for processing results
 */
const validateFetch = [
  body("id").trim().notEmpty().withMessage("ID is required"),
];

app.post("/api/fetch", validateFetch, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { id } = req.body;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(`${API_BASE}/images/fetch/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: API_KEY }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await response.json();

    if (data.status === "error") {
      return res.status(400).json({ error: data.message || "Fetch failed" });
    }

    if (data.status === "processing") {
      return res.json({ status: "processing", eta: data.eta });
    }

    res.json({
      status: "success",
      images: data.output || [],
    });
  } catch (err) {
    console.error("Fetch Error:", err.message);
    if (err.name === "AbortError") {
      return res.status(408).json({ error: "Request timed out" });
    }
    res.status(500).json({ error: "Failed to fetch result: " + err.message });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Image Editor running at http://localhost:${PORT}`);
});
