(function () {
  "use strict";

  var MAX_POLL_ATTEMPTS = 30;
  var POLL_INTERVAL = 3000;
  var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // State
  var uploadedImageUrl = null;

  // DOM
  var initImageUrlInput = document.getElementById("init-image-url");
  var initImageFileInput = document.getElementById("init-image-file");
  var uploadArea = document.getElementById("upload-area");
  var uploadPlaceholder = document.getElementById("upload-placeholder");
  var uploadPreview = document.getElementById("upload-preview");
  var previewImg = document.getElementById("preview-img");
  var removeImageBtn = document.getElementById("remove-image");
  var strengthInput = document.getElementById("strength");
  var strengthVal = document.getElementById("strength-val");
  var aspectRatioSelect = document.getElementById("aspect-ratio");
  var resolutionSelect = document.getElementById("resolution");
  var promptInput = document.getElementById("prompt");
  var btnEdit = document.getElementById("btn-edit");
  var statusEl = document.getElementById("status");
  var imageGrid = document.getElementById("image-grid");

  // Slider
  strengthInput.addEventListener("input", function () {
    strengthVal.textContent = strengthInput.value;
  });

  // Upload - click
  uploadArea.addEventListener("click", function (e) {
    if (e.target === removeImageBtn || removeImageBtn.contains(e.target)) return;
    initImageFileInput.click();
  });

  // Upload - file selected
  initImageFileInput.addEventListener("change", function () {
    if (initImageFileInput.files && initImageFileInput.files[0]) {
      handleFileUpload(initImageFileInput.files[0]);
    }
  });

  // Upload - drag and drop
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
    clearImage();
  });

  // URL input
  initImageUrlInput.addEventListener("change", function () {
    var url = initImageUrlInput.value.trim();
    if (url) {
      uploadedImageUrl = null;
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
      setStatus("File too large. Max 10MB.", "error");
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      uploadedImageUrl = e.target.result;
      previewImg.src = uploadedImageUrl;
      uploadPlaceholder.style.display = "none";
      uploadPreview.style.display = "";
      initImageUrlInput.value = "";
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    uploadedImageUrl = null;
    initImageFileInput.value = "";
    initImageUrlInput.value = "";
    previewImg.src = "";
    uploadPlaceholder.style.display = "";
    uploadPreview.style.display = "none";
  }

  function getInitImage() {
    var url = initImageUrlInput.value.trim();
    if (url) return url;
    if (uploadedImageUrl) return uploadedImageUrl;
    return null;
  }

  function setStatus(msg, type) {
    statusEl.innerHTML = msg;
    statusEl.className = "status" + (type ? " " + type : "");
  }

  // Poll for results
  async function pollForResults(id) {
    for (var i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await new Promise(function (r) { setTimeout(r, POLL_INTERVAL); });
      setStatus('<span class="spinner"></span> Processing... (' + (i + 1) + "/" + MAX_POLL_ATTEMPTS + ")", "");

      try {
        var res = await fetch("/api/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: id }),
        });
        if (!res.ok) throw new Error("Network error");
        var data = await res.json();

        if (data.status === "success" && data.images && data.images.length > 0) {
          return data.images;
        }
        if (data.status === "error" || data.error) {
          throw new Error(data.error || "Processing failed");
        }
      } catch (err) {
        if (i === MAX_POLL_ATTEMPTS - 1) throw err;
      }
    }
    throw new Error("Timed out waiting for result");
  }

  // Display result images
  function displayImages(urls) {
    imageGrid.innerHTML = "";
    if (!urls || urls.length === 0) {
      imageGrid.innerHTML = '<div class="placeholder">No images returned</div>';
      return;
    }

    urls.forEach(function (url, i) {
      var card = document.createElement("div");
      card.className = "image-card";

      var img = document.createElement("img");
      img.src = url;
      img.alt = "Edited image " + (i + 1);
      img.loading = "lazy";
      img.onerror = function () {
        card.innerHTML = '<div class="image-error">Failed to load image</div>';
      };

      var actions = document.createElement("div");
      actions.className = "image-actions";

      var dlBtn = document.createElement("a");
      dlBtn.href = url;
      dlBtn.download = "edited-image-" + (i + 1) + ".png";
      dlBtn.className = "download-btn";
      dlBtn.textContent = "Download";
      dlBtn.target = "_blank";

      var openBtn = document.createElement("a");
      openBtn.href = url;
      openBtn.target = "_blank";
      openBtn.className = "open-btn";
      openBtn.textContent = "Open";

      // Re-edit: use this result as the new source
      var reEditBtn = document.createElement("button");
      reEditBtn.className = "re-edit-btn";
      reEditBtn.textContent = "Re-edit";
      reEditBtn.addEventListener("click", function () {
        initImageUrlInput.value = url;
        uploadedImageUrl = null;
        previewImg.src = url;
        uploadPlaceholder.style.display = "none";
        uploadPreview.style.display = "";
        setStatus("Result set as source image. Update your prompt and click Edit again.", "success");
      });

      actions.appendChild(dlBtn);
      actions.appendChild(openBtn);
      actions.appendChild(reEditBtn);
      card.appendChild(img);
      card.appendChild(actions);
      imageGrid.appendChild(card);
    });
  }

  // Edit button
  btnEdit.addEventListener("click", async function () {
    var prompt = promptInput.value.trim();
    var initImage = getInitImage();

    if (!initImage) {
      setStatus("Please provide a source image (upload or paste URL).", "error");
      return;
    }
    if (!prompt) {
      setStatus("Please describe the edit you want.", "error");
      promptInput.focus();
      return;
    }

    setStatus('<span class="spinner"></span> Editing image...', "");
    btnEdit.disabled = true;

    try {
      var res = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          initImage: initImage,
          strength: parseFloat(strengthInput.value),
          aspectRatio: aspectRatioSelect.value,
          resolution: resolutionSelect.value,
        }),
      });

      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      var images;
      if (data.status === "processing") {
        setStatus('<span class="spinner"></span> Queued, polling for result...', "");
        images = await pollForResults(data.id);
      } else if (data.status === "success") {
        images = data.images;
      } else {
        throw new Error("Unexpected status: " + data.status);
      }

      if (images && images.length > 0) {
        displayImages(images);
        setStatus("Edit complete!", "success");
      } else {
        throw new Error("No images returned");
      }
    } catch (err) {
      console.error("Edit error:", err);
      setStatus("Error: " + err.message, "error");
    } finally {
      btnEdit.disabled = false;
    }
  });

  // Ctrl+Enter shortcut
  promptInput.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      btnEdit.click();
    }
  });
})();
