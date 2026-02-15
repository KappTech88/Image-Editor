const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "50mb" }));

// Proxy endpoint for AI model requests to avoid CORS issues
app.post("/api/generate", async (req, res) => {
  const { apiKey, provider, prompt, image, model } = req.body;

  if (!apiKey || !provider || !prompt) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    let result;
    if (provider === "openai") {
      result = await callOpenAI(apiKey, prompt, image, model);
    } else if (provider === "stability") {
      result = await callStability(apiKey, prompt, image);
    } else {
      return res.status(400).json({ error: "Unsupported provider" });
    }
    res.json(result);
  } catch (err) {
    console.error("API Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

async function callOpenAI(apiKey, prompt, imageBase64, model) {
  const messages = [
    {
      role: "user",
      content: [],
    },
  ];

  if (imageBase64) {
    messages[0].content.push({
      type: "image_url",
      image_url: { url: imageBase64 },
    });
  }

  messages[0].content.push({ type: "text", text: prompt });

  // Use DALL-E for image generation/editing
  const body = {
    model: model || "dall-e-3",
    prompt: prompt,
    n: 1,
    size: "1024x1024",
    response_format: "b64_json",
  };

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      errData.error?.message || `OpenAI API error: ${response.status}`
    );
  }

  const data = await response.json();
  const b64 = data.data[0].b64_json;
  return { image: `data:image/png;base64,${b64}` };
}

async function callStability(apiKey, prompt, imageBase64) {
  const body = {
    text_prompts: [{ text: prompt, weight: 1 }],
    cfg_scale: 7,
    samples: 1,
    steps: 30,
  };

  const engine = "stable-diffusion-xl-1024-v1-0";
  const response = await fetch(
    `https://api.stability.ai/v1/generation/${engine}/text-to-image`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      errData.message || `Stability API error: ${response.status}`
    );
  }

  const data = await response.json();
  const b64 = data.artifacts[0].base64;
  return { image: `data:image/png;base64,${b64}` };
}

app.listen(PORT, () => {
  console.log(`Image Editor running at http://localhost:${PORT}`);
});
