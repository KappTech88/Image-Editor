(function () {
  "use strict";

  // --- DOM Elements ---
  const apiKeyInput = document.getElementById("api-key");
  const modelSelect = document.getElementById("model-select");
  const imgWidth = document.getElementById("img-width");
  const imgHeight = document.getElementById("img-height");
  const samplesSelect = document.getElementById("samples");
  const stepsInput = document.getElementById("steps");
  const stepsVal = document.getElementById("steps-val");
  const guidanceInput = document.getElementById("guidance");
  const guidanceVal = document.getElementById("guidance-val");
  const enhancePromptCheckbox = document.getElementById("enhance-prompt");
  const promptInput = document.getElementById("prompt");
  const negativePromptInput = document.getElementById("negative-prompt");
  const btnGenerate = document.getElementById("btn-generate");
  const statusEl = document.getElementById("status");
  const imageGrid = document.getElementById("image-grid");

  // --- Slider updates ---
  stepsInput.addEventListener("input", function () {
    stepsVal.textContent = stepsInput.value;
  });

  guidanceInput.addEventListener("input", function () {
    guidanceVal.textContent = guidanceInput.value;
  });

  // --- Status helper ---
  function setStatus(msg, type) {
    statusEl.innerHTML = msg;
    statusEl.className = "status" + (type ? " " + type : "");
  }

  // --- Poll for results ---
  async function pollForResults(apiKey, id, maxAttempts) {
    const attempts = maxAttempts || 30;
    for (let i = 0; i < attempts; i++) {
      await new Promise(function (resolve) { setTimeout(resolve, 3000); });

      setStatus('<span class="spinner"></span> Processing... (attempt ' + (i + 1) + "/" + attempts + ")", "");

      try {
        const response = await fetch("/api/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: apiKey, id: id }),
        });

        const data = await response.json();

        if (data.status === "success" && data.images && data.images.length > 0) {
          return data.images;
        }

        if (data.status === "error") {
          throw new Error(data.error || "Processing failed");
        }
      } catch (err) {
        if (i === attempts - 1) throw err;
      }
    }

    throw new Error("Timed out waiting for image generation");
  }

  // --- Display images ---
  function displayImages(imageUrls) {
    imageGrid.innerHTML = "";

    imageUrls.forEach(function (url, index) {
      const card = document.createElement("div");
      card.className = "image-card";

      const img = document.createElement("img");
      img.src = url;
      img.alt = "Generated image " + (index + 1);
      img.loading = "lazy";

      const actions = document.createElement("div");
      actions.className = "image-actions";

      const downloadBtn = document.createElement("a");
      downloadBtn.href = url;
      downloadBtn.download = "generated-image-" + (index + 1) + ".png";
      downloadBtn.className = "download-btn";
      downloadBtn.textContent = "Download";
      downloadBtn.target = "_blank";

      const openBtn = document.createElement("a");
      openBtn.href = url;
      openBtn.target = "_blank";
      openBtn.className = "open-btn";
      openBtn.textContent = "Open";

      actions.appendChild(downloadBtn);
      actions.appendChild(openBtn);
      card.appendChild(img);
      card.appendChild(actions);
      imageGrid.appendChild(card);
    });
  }

  // --- Generate ---
  btnGenerate.addEventListener("click", async function () {
    const apiKey = apiKeyInput.value.trim();
    const prompt = promptInput.value.trim();

    if (!apiKey) {
      setStatus("Please enter your ModelsLab API key.", "error");
      return;
    }
    if (!prompt) {
      setStatus("Please enter a prompt.", "error");
      return;
    }

    setStatus('<span class="spinner"></span> Generating image...', "");
    btnGenerate.disabled = true;

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey,
          prompt: prompt,
          negativePrompt: negativePromptInput.value.trim(),
          model: modelSelect.value,
          width: imgWidth.value,
          height: imgHeight.value,
          samples: samplesSelect.value,
          steps: stepsInput.value,
          guidanceScale: parseFloat(guidanceInput.value),
          enhancePrompt: enhancePromptCheckbox.checked,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "API request failed");
      }

      let images;

      if (data.status === "processing") {
        setStatus('<span class="spinner"></span> Image queued, polling for results...', "");
        images = await pollForResults(apiKey, data.id);
      } else if (data.status === "success") {
        images = data.images;
      } else {
        throw new Error("Unexpected response status: " + data.status);
      }

      if (images && images.length > 0) {
        displayImages(images);
        setStatus("Generated " + images.length + " image" + (images.length > 1 ? "s" : "") + " successfully!", "success");
      } else {
        throw new Error("No images returned");
      }
    } catch (err) {
      setStatus("Error: " + err.message, "error");
    } finally {
      btnGenerate.disabled = false;
    }
  });

  // --- Keyboard shortcut ---
  promptInput.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      btnGenerate.click();
    }
  });
})();
