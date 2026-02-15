(function () {
  "use strict";

  // --- State ---
  var currentMode = "txt2img";
  var initImageUrl = "";   // URL for img2img (from URL input or generated image)
  var initImageData = "";  // base64 data URL for preview (from file upload)

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
  var negativePromptInput = document.getElementById("negative-prompt");
  var btnGenerate = document.getElementById("btn-generate");
  var statusEl = document.getElementById("status");
  var imageGrid = document.getElementById("image-grid");

  // Mode tabs
  var modeTabs = document.querySelectorAll(".mode-tab");

  // Img2Img elements
  var strengthSection = document.getElementById("strength-section");
  var strengthInput = document.getElementById("strength");
  var strengthVal = document.getElementById("strength-val");
  var imgInputSection = document.getElementById("img-input-section");
  var imgSourceTabs = document.querySelectorAll(".img-source-tab");
  var uploadArea = document.getElementById("upload-area");
  var urlArea = document.getElementById("url-area");
  var dropZone = document.getElementById("drop-zone");
  var fileInput = document.getElementById("file-input");
  var imgUrlInput = document.getElementById("img-url");
  var btnLoadUrl = document.getElementById("btn-load-url");
  var imgPreview = document.getElementById("img-preview");
  var previewImg = document.getElementById("preview-img");
  var btnClearImg = document.getElementById("btn-clear-img");

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

  // --- Mode switching ---
  modeTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var mode = tab.getAttribute("data-mode");
      switchMode(mode);
    });
  });

  function switchMode(mode) {
    currentMode = mode;

    modeTabs.forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-mode") === mode);
    });

    var isImg2Img = mode === "img2img";
    imgInputSection.style.display = isImg2Img ? "block" : "none";
    strengthSection.style.display = isImg2Img ? "block" : "none";

    if (isImg2Img) {
      promptInput.placeholder = "Describe how you want to transform the image...";
      btnGenerate.textContent = "Transform Image";
    } else {
      promptInput.placeholder = "Describe the image you want to generate...";
      btnGenerate.textContent = "Generate Image";
    }
  }

  // --- Image source tabs ---
  imgSourceTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var source = tab.getAttribute("data-source");

      imgSourceTabs.forEach(function (t) {
        t.classList.toggle("active", t.getAttribute("data-source") === source);
      });

      uploadArea.style.display = source === "upload" ? "block" : "none";
      urlArea.style.display = source === "url" ? "flex" : "none";
    });
  });

  // --- File upload (drag and drop + file picker) ---
  dropZone.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", function () {
    dropZone.classList.remove("drag-over");
  });

  dropZone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropZone.classList.remove("drag-over");

    var files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith("image/")) {
      handleFileUpload(files[0]);
    }
  });

  fileInput.addEventListener("change", function () {
    if (fileInput.files.length > 0) {
      handleFileUpload(fileInput.files[0]);
    }
  });

  function handleFileUpload(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      initImageData = e.target.result;
      initImageUrl = "";
      showPreview(initImageData);
    };
    reader.readAsDataURL(file);
  }

  // --- URL loading ---
  btnLoadUrl.addEventListener("click", function () {
    loadImageUrl();
  });

  imgUrlInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      loadImageUrl();
    }
  });

  function loadImageUrl() {
    var url = imgUrlInput.value.trim();
    if (!url) return;

    initImageUrl = url;
    initImageData = "";
    showPreview(url);
  }

  // --- Preview ---
  function showPreview(src) {
    previewImg.src = src;
    imgPreview.style.display = "inline-block";
    uploadArea.style.display = "none";
    urlArea.style.display = "none";
  }

  btnClearImg.addEventListener("click", function () {
    clearImage();
  });

  function clearImage() {
    initImageUrl = "";
    initImageData = "";
    previewImg.src = "";
    imgPreview.style.display = "none";
    fileInput.value = "";
    imgUrlInput.value = "";

    // Show the active source input
    var activeSource = document.querySelector(".img-source-tab.active");
    var source = activeSource ? activeSource.getAttribute("data-source") : "upload";
    uploadArea.style.display = source === "upload" ? "block" : "none";
    urlArea.style.display = source === "url" ? "flex" : "none";
  }

  // --- Use generated image as img2img input ---
  function useAsInput(imageUrl) {
    initImageUrl = imageUrl;
    initImageData = "";
    switchMode("img2img");
    showPreview(imageUrl);
  }

  // --- Status helper ---
  function setStatus(msg, type) {
    statusEl.innerHTML = msg;
    statusEl.className = "status" + (type ? " " + type : "");
  }

  // --- Poll for results ---
  async function pollForResults(apiKey, id, maxAttempts) {
    var attempts = maxAttempts || 30;
    for (var i = 0; i < attempts; i++) {
      await new Promise(function (resolve) { setTimeout(resolve, 3000); });

      setStatus('<span class="spinner"></span> Processing... (attempt ' + (i + 1) + "/" + attempts + ")", "");

      try {
        var response = await fetch("/api/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: apiKey, id: id }),
        });

        var data = await response.json();

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
      var card = document.createElement("div");
      card.className = "image-card";

      var img = document.createElement("img");
      img.src = url;
      img.alt = "Generated image " + (index + 1);
      img.loading = "lazy";

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

      var useBtn = document.createElement("button");
      useBtn.className = "use-as-input-btn";
      useBtn.textContent = "Use as Input";
      useBtn.addEventListener("click", (function (imgUrl) {
        return function () {
          useAsInput(imgUrl);
        };
      })(url));

      actions.appendChild(downloadBtn);
      actions.appendChild(openBtn);
      actions.appendChild(useBtn);
      card.appendChild(img);
      card.appendChild(actions);
      imageGrid.appendChild(card);
    });
  }

  // --- Generate (text-to-image) ---
  async function generateTxt2Img(apiKey) {
    var response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: apiKey,
        prompt: promptInput.value.trim(),
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

    var data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "API request failed");
    }

    return data;
  }

  // --- Generate (image-to-image) ---
  async function generateImg2Img(apiKey) {
    var imageToSend = initImageUrl || initImageData;
    if (!imageToSend) {
      throw new Error("Please provide a source image.");
    }

    var response = await fetch("/api/img2img", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: apiKey,
        prompt: promptInput.value.trim(),
        negativePrompt: negativePromptInput.value.trim(),
        model: modelSelect.value,
        initImage: imageToSend,
        strength: parseFloat(strengthInput.value),
        width: imgWidth.value,
        height: imgHeight.value,
        samples: samplesSelect.value,
        steps: stepsInput.value,
        guidanceScale: parseFloat(guidanceInput.value),
        enhancePrompt: enhancePromptCheckbox.checked,
      }),
    });

    var data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "API request failed");
    }

    return data;
  }

  // --- Main generate handler ---
  btnGenerate.addEventListener("click", async function () {
    var apiKey = apiKeyInput.value.trim();
    var prompt = promptInput.value.trim();

    if (!apiKey) {
      setStatus("Please enter your ModelsLab API key.", "error");
      return;
    }
    if (!prompt) {
      setStatus("Please enter a prompt.", "error");
      return;
    }
    if (currentMode === "img2img" && !initImageUrl && !initImageData) {
      setStatus("Please provide a source image for image-to-image editing.", "error");
      return;
    }

    var actionLabel = currentMode === "img2img" ? "Transforming" : "Generating";
    setStatus('<span class="spinner"></span> ' + actionLabel + " image...", "");
    btnGenerate.disabled = true;

    try {
      var data;
      if (currentMode === "img2img") {
        data = await generateImg2Img(apiKey);
      } else {
        data = await generateTxt2Img(apiKey);
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
