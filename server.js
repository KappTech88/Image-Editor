const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "50mb" }));

// Proxy endpoint for ModelsLab text-to-image API
app.post("/api/generate", async (req, res) => {
  const {
    apiKey, prompt, negativePrompt, model,
    width, height, samples, steps, guidanceScale, enhancePrompt,
  } = req.body;

  if (!apiKey || !prompt) {
    return res.status(400).json({ error: "Missing required fields: apiKey and prompt are required" });
  }

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

    const response = await fetch("https://modelslab.com/api/v6/images/text2img", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

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
    res.status(500).json({ error: err.message });
  }
});

// Proxy endpoint for ModelsLab image-to-image API
app.post("/api/img2img", async (req, res) => {
  const {
    apiKey, prompt, negativePrompt, model,
    initImage, strength, width, height,
    samples, steps, guidanceScale, enhancePrompt,
  } = req.body;

  if (!apiKey || !prompt || !initImage) {
    return res.status(400).json({
      error: "Missing required fields: apiKey, prompt, and initImage are required",
    });
  }

  try {
    const body = {
      key: apiKey,
      model_id: model || "flux",
      prompt: prompt,
      negative_prompt: negativePrompt || "",
      init_image: initImage,
      strength: strength || 0.7,
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

    const response = await fetch("https://modelslab.com/api/v6/images/img2img", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

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
    res.status(500).json({ error: err.message });
  }
});

// Poll endpoint for processing images
app.post("/api/fetch", async (req, res) => {
  const { apiKey, id } = req.body;

  if (!apiKey || !id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const response = await fetch("https://modelslab.com/api/v6/images/fetch/" + id, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: apiKey }),
    });

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
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`AI Image Editor running at http://localhost:${PORT}`);
});
