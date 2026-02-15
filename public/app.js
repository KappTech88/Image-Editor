(function () {
  "use strict";

  // Constants
  const MAX_POLL_ATTEMPTS = 30;
  const POLL_INTERVAL = 3000; // 3 seconds
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // --- State ---
  var currentMode = "text2img";
  var uploadedImageUrl = null; // Stores the URL from file upload (data URL) or pasted URL

  // --- DOM Elements ---
  var apiKeyInput = document.getElementById("api-key");
  var modelSelect = document.getElementById("model-select");
  var imgWidth = document.getElementById("img-width");
  var imgHeight = document.getElementById("img-height");
  var samplesSelect = document.getElementById("samples");
  var stepsInput = document.getElementById("steps");
  var stepsVal = document.getElementById("steps-val");
  var guidanceInput = document.getElementById("guidance");
  var guidanceVal = document.getElementById("guidance-val");
  var enhancePromptCheckbox = document.getElementById("enhance-prompt");
  var promptInput = document.getElementById("prompt");
  var btnGenerate = document.getElementById("btn-generate");
  var statusEl = document.getElementById("status");
  var imageGrid = document.getElementById("image-grid");

  // Mode toggle elements
  var modeBtns = document.querySelectorAll(".mode-btn");

  // Image-to-image elements
  var initImageSection = document.getElementById("init-image-section");
  var initImageUrlInput = document.getElementById("init-image-url");
  var initImageFileInput = document.getElementById("init-image-file");
  var uploadArea = document.getElementById("upload-area");
  var uploadPlaceholder = document.getElementById("upload-placeholder");
  var uploadPreview = document.getElementById("upload-preview");
  var previewImg = document.getElementById("preview-img");
  var removeImageBtn = document.getElementById("remove-image");
  var strengthInput = document.getElementById("strength");
  var strengthVal = document.getElementById("strength-val");

  // --- Slider updates ---
  stepsInput.addEventListener("input", function () {
    stepsVal.textContent = stepsInput.value;
  });

  guidanceInput.addEventListener("input", function () {
    guidanceVal.textContent = guidanceInput.value;
  });

  strengthInput.addEventListener("input", function () {
    strengthVal.textContent = strengthInput.value;
  });

  // --- Mode toggle ---
  modeBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mode = btn.getAttribute("data-mode");
      if (mode === currentMode) return;

      currentMode = mode;
      modeBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");

      // Toggle img2img-specific UI
      if (mode === "img2img") {
        initImageSection.style.display = "";
        btnGenerate.textContent = "Transform Image";
        promptInput.placeholder = "Describe how you want the image to be transformed...";
      } else {
        initImageSection.style.display = "none";
        btnGenerate.textContent = "Generate Image";
        promptInput.placeholder = "Describe the image you want to generate...";
      }
    });
  });

  // --- Image upload handling ---

  // Click to upload
  uploadArea.addEventListener("click", function (e) {
    if (e.target === removeImageBtn || removeImageBtn.contains(e.target)) return;
    initImageFileInput.click();
  });

  // File selected
  initImageFileInput.addEventListener("change", function () {
    if (initImageFileInput.files && initImageFileInput.files[0]) {
      handleFileUpload(initImageFileInput.files[0]);
    }
  });

  // Drag and drop
  uploadArea.addEventListener("dragover", function (e) {
    e.preventDefault();
    uploadArea.classList.add("drag-over");
  });

  uploadArea.addEventListener("dragleave", function () {
    uploadArea.classList.remove("drag-over");
  });

  uploadArea.addEventListener("drop", function (e) {
    e.preventDefault();
    uploadArea.classList.remove("drag-over");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  // Remove image
  removeImageBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    clearUploadedImage();
  });

  // URL input - update preview when URL is pasted
  initImageUrlInput.addEventListener("change", function () {
    var url = initImageUrlInput.value.trim();
    if (url) {
      uploadedImageUrl = null; // Clear file upload, use URL directly
      previewImg.src = url;
      uploadPlaceholder.style.display = "none";
      uploadPreview.style.display = "";
    }
  });

  function handleFileUpload(file) {
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
      setStatus("Please upload a PNG, JPEG, or WebP image.", "error");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setStatus("Image file is too large. Maximum size is 10MB.", "error");
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      uploadedImageUrl = e.target.result; // base64 data URL
      previewImg.src = uploadedImageUrl;
      uploadPlaceholder.style.display = "none";
      uploadPreview.style.display = "";
      initImageUrlInput.value = ""; // Clear URL input when file is uploaded
    };
    reader.readAsDataURL(file);
  }

  function clearUploadedImage() {
    uploadedImageUrl = null;
    initImageFileInput.value = "";
    previewImg.src = "";
    uploadPlaceholder.style.display = "";
    uploadPreview.style.display = "none";
  }

  // --- Status helper ---
  function setStatus(msg, type) {
    statusEl.innerHTML = msg;
    statusEl.className = "status" + (type ? " " + type : "");
  }

  // --- Poll for results ---
  async function pollForResults(apiKey, id, maxAttempts) {
    var attempts = maxAttempts || MAX_POLL_ATTEMPTS;
    for (var i = 0; i < attempts; i++) {
      await new Promise(function (resolve) { setTimeout(resolve, POLL_INTERVAL); });

      setStatus('<span class="spinner"></span> Processing... (attempt ' + (i + 1) + "/" + attempts + ")", "");

      try {
        var response = await fetch("/api/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: apiKey, id: id }),
        });

        if (!response.ok) {
          throw new Error("Network response was not ok");
        }

        var data = await response.json();

        if (data.status === "success" && data.images && data.images.length > 0) {
          return data.images;
        }

        if (data.status === "error" || data.error) {
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

    if (!imageUrls || imageUrls.length === 0) {
      imageGrid.innerHTML = '<div class="placeholder">No images generated</div>';
      return;
    }

    imageUrls.forEach(function (url, index) {
      var card = document.createElement("div");
      card.className = "image-card";

      var img = document.createElement("img");
      img.src = url;
      img.alt = "Generated image " + (index + 1);
      img.loading = "lazy";

      img.onerror = function () {
        card.innerHTML = '<div class="image-error">Failed to load image</div>';
      };

      var actions = document.createElement("div");
      actions.className = "image-actions";

      var downloadBtn = document.createElement("a");
      downloadBtn.href = url;
      downloadBtn.download = "generated-image-" + (index + 1) + ".png";
      downloadBtn.className = "download-btn";
      downloadBtn.textContent = "Download";
      downloadBtn.target = "_blank";

      var openBtn = document.createElement("a");
      openBtn.href = url;
      openBtn.target = "_blank";
      openBtn.className = "open-btn";
      openBtn.textContent = "Open";

      // "Use as Init Image" button for img2img workflow
      var useInitBtn = document.createElement("button");
      useInitBtn.className = "use-init-btn";
      useInitBtn.textContent = "Use as Init";
      useInitBtn.addEventListener("click", function () {
        // Switch to img2img mode
        currentMode = "img2img";
        modeBtns.forEach(function (b) {
          if (b.getAttribute("data-mode") === "img2img") {
            b.classList.add("active");
          } else {
            b.classList.remove("active");
          }
        });
        initImageSection.style.display = "";
        btnGenerate.textContent = "Transform Image";
        promptInput.placeholder = "Describe how you want the image to be transformed...";

        // Set the image URL
        initImageUrlInput.value = url;
        uploadedImageUrl = null;
        previewImg.src = url;
        uploadPlaceholder.style.display = "none";
        uploadPreview.style.display = "";

        // Scroll settings panel to show init image section
        initImageSection.scrollIntoView({ behavior: "smooth", block: "nearest" });

        setStatus("Image set as init image. Adjust prompt and strength, then click Transform.", "success");
      });

      actions.appendChild(downloadBtn);
      actions.appendChild(openBtn);
      actions.appendChild(useInitBtn);
      card.appendChild(img);
      card.appendChild(actions);
      imageGrid.appendChild(card);
    });
  }

  // --- Get the init image value (URL or uploaded data URL) ---
  function getInitImage() {
    var urlValue = initImageUrlInput.value.trim();
    if (urlValue) return urlValue;
    if (uploadedImageUrl) return uploadedImageUrl;
    return null;
  }

  // --- Generate ---
  btnGenerate.addEventListener("click", async function () {
    var apiKey = apiKeyInput.value.trim();
    var prompt = promptInput.value.trim();

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

    // img2img validation
    if (currentMode === "img2img") {
      var initImage = getInitImage();
      if (!initImage) {
        setStatus("Please provide an init image (upload a file or paste a URL).", "error");
        return;
      }
    }

    var actionText = currentMode === "img2img" ? "Transforming image..." : "Generating image...";
    setStatus('<span class="spinner"></span> ' + actionText, "");
    btnGenerate.disabled = true;

    try {
      var requestBody = {
        apiKey: apiKey,
        prompt: prompt,
        model: modelSelect.value,
        width: imgWidth.value,
        height: imgHeight.value,
        samples: samplesSelect.value,
        steps: stepsInput.value,
        guidanceScale: parseFloat(guidanceInput.value),
        enhancePrompt: enhancePromptCheckbox.checked,
      };

      var endpoint = "/api/generate";

      if (currentMode === "img2img") {
        requestBody.initImage = getInitImage();
        requestBody.strength = parseFloat(strengthInput.value);
        endpoint = "/api/img2img";
      }

      var response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      var data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "API request failed");
      }

      var images;

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
        var modeLabel = currentMode === "img2img" ? "transformed" : "generated";
        setStatus("Successfully " + modeLabel + " " + images.length + " image" + (images.length > 1 ? "s" : "") + "!", "success");
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
