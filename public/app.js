(function () {
  "use strict";

  // Constants
  const MAX_POLL_ATTEMPTS = 30;
  const POLL_INTERVAL = 3000; // 3 seconds
  const KEYBOARD_SHORTCUT = { key: "Enter", modifier: "ctrlKey" };

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
  /**
   * Sets the status message with appropriate styling
   * @param {string} msg - The message to display
   * @param {string} type - The type of message (error, success, or empty for default)
   */
  function setStatus(msg, type) {
    statusEl.innerHTML = msg;
    statusEl.className = "status" + (type ? " " + type : "");
  }

  // --- Poll for results ---
  /**
   * Polls the server for image generation results
   * @param {string} apiKey - The ModelsLab API key
   * @param {string} id - The generation ID
   * @param {number} maxAttempts - Maximum number of polling attempts
   * @returns {Promise<Array>} Array of image URLs
   * @throws {Error} If polling times out or fails
   */
  async function pollForResults(apiKey, id, maxAttempts) {
    const attempts = maxAttempts || MAX_POLL_ATTEMPTS;
    for (let i = 0; i < attempts; i++) {
      await new Promise(function (resolve) { setTimeout(resolve, POLL_INTERVAL); });

      setStatus('<span class="spinner"></span> Processing... (attempt ' + (i + 1) + "/" + attempts + ")", "");

      try {
        const response = await fetch("/api/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: apiKey, id: id }),
        });

        if (!response.ok) {
          throw new Error("Network response was not ok");
        }

        const data = await response.json();

        if (data.status === "success" && data.images && data.images.length > 0) {
          return data.images;
        }

        if (data.status === "error" || data.error) {
          throw new Error(data.error || "Processing failed");
        }
      } catch (err) {
        if (i === attempts - 1) throw err;
        // Continue polling on network errors unless it's the last attempt
      }
    }

    throw new Error("Timed out waiting for image generation");
  }

  // --- Display images ---
  /**
   * Displays generated images in the image grid
   * @param {Array<string>} imageUrls - Array of image URLs to display
   */
  function displayImages(imageUrls) {
    imageGrid.innerHTML = "";

    if (!imageUrls || imageUrls.length === 0) {
      imageGrid.innerHTML = '<div class="placeholder">No images generated</div>';
      return;
    }

    imageUrls.forEach(function (url, index) {
      const card = document.createElement("div");
      card.className = "image-card";

      const img = document.createElement("img");
      img.src = url;
      img.alt = "Generated image " + (index + 1);
      img.loading = "lazy";

      // Add error handling for image loading
      img.onerror = function () {
        card.innerHTML = '<div class="image-error">Failed to load image</div>';
      };

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
  /**
   * Handles the image generation process
   */
  btnGenerate.addEventListener("click", async function () {
    const apiKey = apiKeyInput.value.trim();
    const prompt = promptInput.value.trim();

    // Validation
    if (!apiKey) {
      setStatus("Please enter your ModelsLab API key.", "error");
      apiKeyInput.focus();
      return;
    }
    if (!prompt) {
      setStatus("Please enter a prompt.", "error");
      promptInput.focus();
      return;
    }

    setStatus('<span class="spinner"></span> Generating image...', "");
    btnGenerate.disabled = true;

    try {
      const requestBody = {
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
      };

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
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
      console.error("Generation error:", err);
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
