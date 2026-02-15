require("dotenv").config();
const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");

const app = express();
const PORT = process.env.PORT || 3001;

// API key from environment (locked in server-side)
const API_KEY = process.env.MODELSLAB_API_KEY;
if (!API_KEY) {
  console.error("MODELSLAB_API_KEY is not set in .env file");
  process.exit(1);
}

// Constants
const API_V6_BASE = "https://modelslab.com/api/v6";
const API_V7_BASE = "https://modelslab.com/api/v7";
const FETCH_TIMEOUT = 30000; // 30 seconds
const MAX_PROMPT_LENGTH = 1000;

// Hardcoded model IDs (no user selection)
const TEXT2IMG_MODEL = "flux";
const IMG2IMG_MODEL = "grok-imagine-image-121";

// Image generation limits
const MIN_IMAGE_DIMENSION = 64;
const MAX_IMAGE_DIMENSION = 2048;
const MIN_SAMPLES = 1;
const MAX_SAMPLES = 4;
const MIN_STEPS = 10;
const MAX_STEPS = 100;
const MIN_GUIDANCE_SCALE = 1;
const MAX_GUIDANCE_SCALE = 20;
const MIN_STRENGTH = 0.1;
const MAX_STRENGTH = 1.0;

// Valid aspect ratios and resolutions for Grok Imagine img2img
const VALID_ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"];
const VALID_RESOLUTIONS = ["1k", "2k"];

// Security middleware
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
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", limiter);

// Body parser with size limit
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

/**
 * Validation for text2img endpoint
 */
const validateGenerate = [
  body("prompt")
    .trim()
    .notEmpty()
    .withMessage("Prompt is required")
    .isLength({ max: MAX_PROMPT_LENGTH })
    .withMessage("Prompt too long"),
  body("negativePrompt")
    .optional()
    .trim()
    .isLength({ max: MAX_PROMPT_LENGTH })
    .withMessage("Negative prompt too long"),
  body("width")
    .optional()
    .isInt({ min: MIN_IMAGE_DIMENSION, max: MAX_IMAGE_DIMENSION })
    .withMessage(`Width must be between ${MIN_IMAGE_DIMENSION} and ${MAX_IMAGE_DIMENSION}`),
  body("height")
    .optional()
    .isInt({ min: MIN_IMAGE_DIMENSION, max: MAX_IMAGE_DIMENSION })
    .withMessage(`Height must be between ${MIN_IMAGE_DIMENSION} and ${MAX_IMAGE_DIMENSION}`),
  body("samples")
    .optional()
    .isInt({ min: MIN_SAMPLES, max: MAX_SAMPLES })
    .withMessage(`Samples must be between ${MIN_SAMPLES} and ${MAX_SAMPLES}`),
  body("steps")
    .optional()
    .isInt({ min: MIN_STEPS, max: MAX_STEPS })
    .withMessage(`Steps must be between ${MIN_STEPS} and ${MAX_STEPS}`),
  body("guidanceScale")
    .optional()
    .isFloat({ min: MIN_GUIDANCE_SCALE, max: MAX_GUIDANCE_SCALE })
    .withMessage(`Guidance scale must be between ${MIN_GUIDANCE_SCALE} and ${MAX_GUIDANCE_SCALE}`),
  body("enhancePrompt").optional().isBoolean(),
];

/**
 * Validation for img2img endpoint (Grok Imagine v7)
 */
const validateImg2Img = [
  body("prompt")
    .trim()
    .notEmpty()
    .withMessage("Prompt is required")
    .isLength({ max: MAX_PROMPT_LENGTH })
    .withMessage("Prompt too long"),
  body("initImage")
    .trim()
    .notEmpty()
    .withMessage("Init image URL is required for image-to-image"),
  body("aspectRatio")
    .optional()
    .isIn(VALID_ASPECT_RATIOS)
    .withMessage(`Aspect ratio must be one of: ${VALID_ASPECT_RATIOS.join(", ")}`),
  body("resolution")
    .optional()
    .isIn(VALID_RESOLUTIONS)
    .withMessage(`Resolution must be one of: ${VALID_RESOLUTIONS.join(", ")}`),
  body("strength")
    .optional()
    .isFloat({ min: MIN_STRENGTH, max: MAX_STRENGTH })
    .withMessage(`Strength must be between ${MIN_STRENGTH} and ${MAX_STRENGTH}`),
];

/**
 * Proxy endpoint for ModelsLab text-to-image API (v6)
 */
app.post("/api/generate", validateGenerate, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { prompt, negativePrompt, width, height, samples, steps, guidanceScale, enhancePrompt } = req.body;

  try {
    const body = {
      key: API_KEY,
      model_id: TEXT2IMG_MODEL,
      prompt: prompt,
      negative_prompt: negativePrompt || "",
      width: width || "512",
      height: height || "512",
      samples: samples || "1",
      num_inference_steps: steps || "30",
      guidance_scale: guidanceScale || 7.5,
      safety_checker: "no",
      enhance_prompt: enhancePrompt ? "yes" : "no",
      seed: null,
      webhook: null,
      track_id: null,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(`${API_V6_BASE}/images/text2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (data.status === "error") {
      throw new Error(data.message || "ModelsLab API error");
    }

    if (data.status === "processing") {
      return res.json({
        status: "processing",
        fetchUrl: data.fetch_result || null,
        id: data.id,
        eta: data.eta,
      });
    }

    res.json({
      status: "success",
      images: data.output || [],
      generationTime: data.generationTime,
      meta: data.meta || {},
    });
  } catch (err) {
    console.error("Text2Img API Error:", err.message);
    if (err.name === "AbortError") {
      return res.status(408).json({ error: "Request timeout" });
    }
    res.status(500).json({ error: "Failed to generate image. Please try again." });
  }
});

/**
 * Proxy endpoint for ModelsLab Grok Imagine image-to-image API (v7)
 */
app.post("/api/img2img", validateImg2Img, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { prompt, initImage, aspectRatio, resolution, strength } = req.body;

  try {
    const body = {
      key: API_KEY,
      model_id: IMG2IMG_MODEL,
      prompt: prompt,
      init_image: [initImage],
      aspect_ratio: aspectRatio || "1:1",
      resolution: resolution || "2k",
      strength: strength || 0.7,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(`${API_V7_BASE}/images/image-to-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (data.status === "error") {
      throw new Error(data.message || "ModelsLab API error");
    }

    if (data.status === "processing") {
      return res.json({
        status: "processing",
        fetchUrl: data.fetch_result || null,
        id: data.id,
        eta: data.eta,
      });
    }

    res.json({
      status: "success",
      images: data.output || [],
      generationTime: data.generationTime,
      meta: data.meta || {},
    });
  } catch (err) {
    console.error("Img2Img API Error:", err.message);
    if (err.name === "AbortError") {
      return res.status(408).json({ error: "Request timeout" });
    }
    res.status(500).json({ error: "Failed to transform image. Please try again." });
  }
});

/**
 * Poll endpoint for processing images
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

    const response = await fetch(`${API_V6_BASE}/images/fetch/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: API_KEY }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Fetch request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (data.status === "error") {
      throw new Error(data.message || "Fetch failed");
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
      return res.status(408).json({ error: "Request timeout" });
    }
    res.status(500).json({ error: "Failed to fetch image status. Please try again." });
  }
});

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Image Editor running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
