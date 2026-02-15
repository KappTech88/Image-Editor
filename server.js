require("dotenv").config();
const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");

const app = express();
const PORT = process.env.PORT || 3001;

// Constants
const API_BASE_URL = "https://modelslab.com/api/v6";
const FETCH_TIMEOUT = 30000; // 30 seconds
const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL = 3000; // 3 seconds
const MAX_PROMPT_LENGTH = 1000; // Maximum characters for prompts

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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", limiter);

// Body parser with size limit (increased to support base64 image uploads)
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

/**
 * Shared validation rules for both text2img and img2img
 */
const sharedValidation = [
  body("apiKey").trim().notEmpty().withMessage("API key is required"),
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
  body("model").optional().trim(),
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
 * Validation middleware for generate endpoint (text2img)
 */
const validateGenerate = [...sharedValidation];

/**
 * Validation middleware for img2img endpoint
 */
const validateImg2Img = [
  ...sharedValidation,
  body("initImage")
    .trim()
    .notEmpty()
    .withMessage("Init image URL is required for image-to-image"),
  body("strength")
    .optional()
    .isFloat({ min: MIN_STRENGTH, max: MAX_STRENGTH })
    .withMessage(`Strength must be between ${MIN_STRENGTH} and ${MAX_STRENGTH}`),
];

/**
 * Proxy endpoint for ModelsLab text-to-image API
 */
app.post("/api/generate", validateGenerate, async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { apiKey, prompt, negativePrompt, model, width, height, samples, steps, guidanceScale, enhancePrompt } = req.body;

  try {
    const body = {
      key: apiKey,
      model_id: model || "flux",
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

    const response = await fetch(`${API_BASE_URL}/images/text2img`, {
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

    // If processing, return the fetch URL so client can poll
    if (data.status === "processing") {
      return res.json({
        status: "processing",
        fetchUrl: data.fetch_result || null,
        id: data.id,
        eta: data.eta,
      });
    }

    // Success - return image URLs
    res.json({
      status: "success",
      images: data.output || [],
      generationTime: data.generationTime,
      meta: data.meta || {},
    });
  } catch (err) {
    console.error("API Error:", err.message);
    if (err.name === "AbortError") {
      return res.status(408).json({ error: "Request timeout" });
    }
    res.status(500).json({ error: "Failed to generate image. Please check your API key and try again." });
  }
});

/**
 * Proxy endpoint for ModelsLab image-to-image API
 */
app.post("/api/img2img", validateImg2Img, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const {
    apiKey, prompt, negativePrompt, model, width, height,
    samples, steps, guidanceScale, enhancePrompt, initImage, strength,
  } = req.body;

  try {
    const body = {
      key: apiKey,
      model_id: model || "flux",
      prompt: prompt,
      negative_prompt: negativePrompt || "",
      init_image: initImage,
      width: width || "512",
      height: height || "512",
      samples: samples || "1",
      num_inference_steps: steps || "30",
      guidance_scale: guidanceScale || 7.5,
      strength: strength || 0.7,
      safety_checker: "no",
      enhance_prompt: enhancePrompt ? "yes" : "no",
      seed: null,
      webhook: null,
      track_id: null,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(`${API_BASE_URL}/images/img2img`, {
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
    res.status(500).json({ error: "Failed to transform image. Please check your API key and try again." });
  }
});

/**
 * Validation middleware for fetch endpoint
 */
const validateFetch = [
  body("apiKey").trim().notEmpty().withMessage("API key is required"),
  body("id").trim().notEmpty().withMessage("ID is required"),
];

/**
 * Poll endpoint for processing images
 */
app.post("/api/fetch", validateFetch, async (req, res) => {
  // Validate request
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { apiKey, id } = req.body;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(`${API_BASE_URL}/images/fetch/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: apiKey }),
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
