(function () {
  "use strict";

  // --- DOM Elements ---
  const canvas = document.getElementById("editor-canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const canvasWrapper = document.getElementById("canvas-wrapper");
  const fileInput = document.getElementById("file-input");
  const canvasSizeEl = document.getElementById("canvas-size");
  const cursorPosEl = document.getElementById("cursor-pos");
  const zoomLevelEl = document.getElementById("zoom-level");

  // Header buttons
  const btnNew = document.getElementById("btn-new");
  const btnOpen = document.getElementById("btn-open");
  const btnSave = document.getElementById("btn-save");
  const btnUndo = document.getElementById("btn-undo");
  const btnRedo = document.getElementById("btn-redo");

  // Tool options
  const colorPicker = document.getElementById("color-picker");
  const brushSizeInput = document.getElementById("brush-size");
  const brushSizeVal = document.getElementById("brush-size-val");
  const opacityInput = document.getElementById("opacity");
  const opacityVal = document.getElementById("opacity-val");

  // Canvas action buttons
  const btnResize = document.getElementById("btn-resize");
  const btnFlipH = document.getElementById("btn-flip-h");
  const btnFlipV = document.getElementById("btn-flip-v");
  const btnRotateCW = document.getElementById("btn-rotate-cw");
  const btnRotateCCW = document.getElementById("btn-rotate-ccw");
  const btnClear = document.getElementById("btn-clear");

  // AI elements
  const aiProvider = document.getElementById("ai-provider");
  const aiModel = document.getElementById("ai-model");
  const aiApiKey = document.getElementById("ai-api-key");
  const aiPrompt = document.getElementById("ai-prompt");
  const btnAiGenerate = document.getElementById("btn-ai-generate");
  const btnAiApply = document.getElementById("btn-ai-apply");
  const aiStatus = document.getElementById("ai-status");
  const aiPreview = document.getElementById("ai-preview");

  // Modal
  const modalOverlay = document.getElementById("modal-overlay");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const modalCancel = document.getElementById("modal-cancel");
  const modalConfirm = document.getElementById("modal-confirm");

  // --- State ---
  let currentTool = "brush";
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let shapeStartX = 0;
  let shapeStartY = 0;
  let undoStack = [];
  let redoStack = [];
  let aiGeneratedImage = null;
  let cropStart = null;
  let cropEnd = null;
  let isCropping = false;

  // --- Initialize ---
  function init() {
    clearCanvas("#ffffff");
    saveState();
    updateCanvasSize();
  }

  // --- Undo / Redo ---
  function saveState() {
    undoStack.push(canvas.toDataURL());
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (undoStack.length <= 1) return;
    redoStack.push(undoStack.pop());
    restoreState(undoStack[undoStack.length - 1]);
  }

  function redo() {
    if (redoStack.length === 0) return;
    const state = redoStack.pop();
    undoStack.push(state);
    restoreState(state);
  }

  function restoreState(dataUrl) {
    const img = new Image();
    img.onload = function () {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      updateCanvasSize();
    };
    img.src = dataUrl;
  }

  // --- Canvas helpers ---
  function clearCanvas(color) {
    ctx.fillStyle = color || "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function updateCanvasSize() {
    canvasSizeEl.textContent = `${canvas.width} x ${canvas.height}`;
  }

  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  // --- Tool selection ---
  document.querySelectorAll(".tool-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document
        .querySelectorAll(".tool-btn")
        .forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      currentTool = btn.dataset.tool;
      canvas.style.cursor =
        currentTool === "eyedropper" ? "crosshair" :
        currentTool === "text" ? "text" :
        currentTool === "fill" ? "cell" :
        "crosshair";
    });
  });

  // --- Option updates ---
  brushSizeInput.addEventListener("input", function () {
    brushSizeVal.textContent = brushSizeInput.value;
  });

  opacityInput.addEventListener("input", function () {
    opacityVal.textContent = opacityInput.value + "%";
  });

  // --- Drawing ---
  let snapshotBeforeShape = null;

  canvas.addEventListener("mousedown", function (e) {
    const pos = getCanvasCoords(e);

    if (currentTool === "eyedropper") {
      pickColor(pos.x, pos.y);
      return;
    }

    if (currentTool === "fill") {
      floodFill(Math.round(pos.x), Math.round(pos.y), colorPicker.value);
      saveState();
      return;
    }

    if (currentTool === "text") {
      addText(pos.x, pos.y);
      return;
    }

    isDrawing = true;
    lastX = pos.x;
    lastY = pos.y;
    shapeStartX = pos.x;
    shapeStartY = pos.y;

    if (currentTool === "crop") {
      cropStart = { x: pos.x, y: pos.y };
      isCropping = true;
    }

    if (["line", "rect", "circle"].includes(currentTool)) {
      snapshotBeforeShape = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    if (currentTool === "brush" || currentTool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  });

  canvas.addEventListener("mousemove", function (e) {
    const pos = getCanvasCoords(e);
    cursorPosEl.textContent = `${Math.round(pos.x)}, ${Math.round(pos.y)}`;

    if (!isDrawing) return;

    const size = parseInt(brushSizeInput.value);
    const opacity = parseInt(opacityInput.value) / 100;

    ctx.globalAlpha = opacity;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (currentTool === "brush") {
      ctx.strokeStyle = colorPicker.value;
      ctx.globalCompositeOperation = "source-over";
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    } else if (currentTool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    } else if (currentTool === "line") {
      ctx.putImageData(snapshotBeforeShape, 0, 0);
      ctx.strokeStyle = colorPicker.value;
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.moveTo(shapeStartX, shapeStartY);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (currentTool === "rect") {
      ctx.putImageData(snapshotBeforeShape, 0, 0);
      ctx.strokeStyle = colorPicker.value;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeRect(
        shapeStartX,
        shapeStartY,
        pos.x - shapeStartX,
        pos.y - shapeStartY
      );
    } else if (currentTool === "circle") {
      ctx.putImageData(snapshotBeforeShape, 0, 0);
      ctx.strokeStyle = colorPicker.value;
      ctx.globalCompositeOperation = "source-over";
      const rx = Math.abs(pos.x - shapeStartX) / 2;
      const ry = Math.abs(pos.y - shapeStartY) / 2;
      const cx = shapeStartX + (pos.x - shapeStartX) / 2;
      const cy = shapeStartY + (pos.y - shapeStartY) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (currentTool === "crop" && isCropping) {
      // Draw crop overlay
      if (snapshotBeforeShape) {
        ctx.putImageData(snapshotBeforeShape, 0, 0);
      }
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      const cx = Math.min(shapeStartX, pos.x);
      const cy = Math.min(shapeStartY, pos.y);
      const cw = Math.abs(pos.x - shapeStartX);
      const ch = Math.abs(pos.y - shapeStartY);
      // Clear the crop region to show original
      ctx.clearRect(cx, cy, cw, ch);
      if (snapshotBeforeShape) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.putImageData(snapshotBeforeShape, 0, 0);
        ctx.drawImage(tempCanvas, cx, cy, cw, ch, cx, cy, cw, ch);
      }
      // Draw crop border
      ctx.strokeStyle = "#7c6ff7";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(cx, cy, cw, ch);
      ctx.setLineDash([]);
      cropEnd = { x: pos.x, y: pos.y };
    }

    lastX = pos.x;
    lastY = pos.y;
  });

  canvas.addEventListener("mouseup", function (e) {
    if (!isDrawing) return;
    isDrawing = false;

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (currentTool === "crop" && isCropping && cropStart && cropEnd) {
      isCropping = false;
      const x = Math.min(cropStart.x, cropEnd.x);
      const y = Math.min(cropStart.y, cropEnd.y);
      const w = Math.abs(cropEnd.x - cropStart.x);
      const h = Math.abs(cropEnd.y - cropStart.y);
      if (w > 5 && h > 5) {
        // Restore original first
        ctx.putImageData(snapshotBeforeShape, 0, 0);
        const imgData = ctx.getImageData(x, y, w, h);
        canvas.width = w;
        canvas.height = h;
        ctx.putImageData(imgData, 0, 0);
        updateCanvasSize();
      } else {
        ctx.putImageData(snapshotBeforeShape, 0, 0);
      }
      cropStart = null;
      cropEnd = null;
    }

    snapshotBeforeShape = null;
    saveState();
  });

  canvas.addEventListener("mouseleave", function () {
    if (isDrawing && (currentTool === "brush" || currentTool === "eraser")) {
      isDrawing = false;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      saveState();
    }
  });

  // --- Color picker (eyedropper) ---
  function pickColor(x, y) {
    const pixel = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    const hex =
      "#" +
      ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2])
        .toString(16)
        .slice(1);
    colorPicker.value = hex;
  }

  // --- Text tool ---
  function addText(x, y) {
    showModal("Add Text", '<label>Text<input id="text-input" type="text" placeholder="Enter text" /></label><label>Font size<input id="text-size" type="number" value="24" min="8" max="200" /></label>', function () {
      const text = document.getElementById("text-input").value;
      const fontSize = parseInt(document.getElementById("text-size").value) || 24;
      if (!text) return;
      ctx.globalAlpha = parseInt(opacityInput.value) / 100;
      ctx.fillStyle = colorPicker.value;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillText(text, x, y);
      ctx.globalAlpha = 1;
      saveState();
    });
  }

  // --- Flood fill ---
  function floodFill(startX, startY, fillColor) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    const startIdx = (startY * width + startX) * 4;
    const startR = data[startIdx];
    const startG = data[startIdx + 1];
    const startB = data[startIdx + 2];
    const startA = data[startIdx + 3];

    // Parse fill color
    const r = parseInt(fillColor.slice(1, 3), 16);
    const g = parseInt(fillColor.slice(3, 5), 16);
    const b = parseInt(fillColor.slice(5, 7), 16);

    if (startR === r && startG === g && startB === b && startA === 255) return;

    const tolerance = 10;
    const stack = [[startX, startY]];
    const visited = new Uint8Array(width * height);

    function matches(idx) {
      return (
        Math.abs(data[idx] - startR) <= tolerance &&
        Math.abs(data[idx + 1] - startG) <= tolerance &&
        Math.abs(data[idx + 2] - startB) <= tolerance &&
        Math.abs(data[idx + 3] - startA) <= tolerance
      );
    }

    while (stack.length > 0) {
      const [cx, cy] = stack.pop();
      const pixelIdx = cy * width + cx;

      if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
      if (visited[pixelIdx]) continue;

      const idx = pixelIdx * 4;
      if (!matches(idx)) continue;

      visited[pixelIdx] = 1;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;

      stack.push([cx + 1, cy]);
      stack.push([cx - 1, cy]);
      stack.push([cx, cy + 1]);
      stack.push([cx, cy - 1]);
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // --- Filters ---
  document.querySelectorAll(".filter-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyFilter(btn.dataset.filter);
    });
  });

  function applyFilter(filter) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    switch (filter) {
      case "grayscale":
        for (let i = 0; i < data.length; i += 4) {
          const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          data[i] = data[i + 1] = data[i + 2] = avg;
        }
        break;

      case "sepia":
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
          data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
          data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
        }
        break;

      case "invert":
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i];
          data[i + 1] = 255 - data[i + 1];
          data[i + 2] = 255 - data[i + 2];
        }
        break;

      case "blur":
        applyBoxBlur(imageData, 3);
        break;

      case "brightness":
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] + 30);
          data[i + 1] = Math.min(255, data[i + 1] + 30);
          data[i + 2] = Math.min(255, data[i + 2] + 30);
        }
        break;

      case "contrast":
        const factor = 1.5;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
          data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
          data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
        }
        break;
    }

    ctx.putImageData(imageData, 0, 0);
    saveState();
  }

  function applyBoxBlur(imageData, radius) {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const copy = new Uint8ClampedArray(data);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const idx = (ny * w + nx) * 4;
              r += copy[idx];
              g += copy[idx + 1];
              b += copy[idx + 2];
              count++;
            }
          }
        }
        const idx = (y * w + x) * 4;
        data[idx] = r / count;
        data[idx + 1] = g / count;
        data[idx + 2] = b / count;
      }
    }
  }

  // --- Header buttons ---
  btnNew.addEventListener("click", function () {
    showModal("New Canvas", '<label>Width<input id="new-width" type="number" value="800" min="1" max="4000" /></label><label>Height<input id="new-height" type="number" value="600" min="1" max="4000" /></label>', function () {
      const w = parseInt(document.getElementById("new-width").value) || 800;
      const h = parseInt(document.getElementById("new-height").value) || 600;
      canvas.width = w;
      canvas.height = h;
      clearCanvas("#ffffff");
      undoStack = [];
      redoStack = [];
      saveState();
      updateCanvasSize();
    });
  });

  btnOpen.addEventListener("click", function () {
    fileInput.click();
  });

  fileInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      const img = new Image();
      img.onload = function () {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        saveState();
        updateCanvasSize();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    fileInput.value = "";
  });

  btnSave.addEventListener("click", function () {
    const link = document.createElement("a");
    link.download = "image.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  btnUndo.addEventListener("click", undo);
  btnRedo.addEventListener("click", redo);

  // --- Canvas actions ---
  btnResize.addEventListener("click", function () {
    showModal("Resize Canvas", '<label>Width<input id="resize-width" type="number" value="' + canvas.width + '" min="1" max="4000" /></label><label>Height<input id="resize-height" type="number" value="' + canvas.height + '" min="1" max="4000" /></label>', function () {
      const w = parseInt(document.getElementById("resize-width").value);
      const h = parseInt(document.getElementById("resize-height").value);
      if (!w || !h) return;
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      tempCanvas.getContext("2d").putImageData(imgData, 0, 0);
      canvas.width = w;
      canvas.height = h;
      clearCanvas("#ffffff");
      ctx.drawImage(tempCanvas, 0, 0, w, h);
      saveState();
      updateCanvasSize();
    });
  });

  btnFlipH.addEventListener("click", function () {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCanvas.getContext("2d").putImageData(imgData, 0, 0);
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
    saveState();
  });

  btnFlipV.addEventListener("click", function () {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCanvas.getContext("2d").putImageData(imgData, 0, 0);
    ctx.save();
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
    saveState();
  });

  btnRotateCW.addEventListener("click", function () {
    rotateCanvas(90);
  });

  btnRotateCCW.addEventListener("click", function () {
    rotateCanvas(-90);
  });

  function rotateCanvas(degrees) {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCanvas.getContext("2d").putImageData(imgData, 0, 0);

    const oldW = canvas.width;
    const oldH = canvas.height;
    canvas.width = oldH;
    canvas.height = oldW;

    ctx.save();
    if (degrees === 90) {
      ctx.translate(canvas.width, 0);
    } else {
      ctx.translate(0, canvas.height);
    }
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
    saveState();
    updateCanvasSize();
  }

  btnClear.addEventListener("click", function () {
    clearCanvas("#ffffff");
    saveState();
  });

  // --- AI Integration ---
  aiProvider.addEventListener("change", function () {
    if (aiProvider.value === "openai") {
      aiModel.innerHTML =
        '<option value="dall-e-3">DALL-E 3</option><option value="dall-e-2">DALL-E 2</option>';
    } else {
      aiModel.innerHTML =
        '<option value="stable-diffusion-xl">Stable Diffusion XL</option>';
    }
  });

  btnAiGenerate.addEventListener("click", async function () {
    const key = aiApiKey.value.trim();
    const prompt = aiPrompt.value.trim();

    if (!key) {
      setAiStatus("Please enter your API key.", "error");
      return;
    }
    if (!prompt) {
      setAiStatus("Please enter a prompt.", "error");
      return;
    }

    setAiStatus('<span class="spinner"></span> Generating image...', "");
    btnAiGenerate.disabled = true;
    aiPreview.innerHTML = "";
    btnAiApply.disabled = true;

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: key,
          provider: aiProvider.value,
          model: aiModel.value,
          prompt: prompt,
          image: null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "API request failed");
      }

      aiGeneratedImage = data.image;
      aiPreview.innerHTML =
        '<img src="' + data.image + '" alt="Generated image" />';
      btnAiApply.disabled = false;
      setAiStatus("Image generated successfully!", "success");
    } catch (err) {
      setAiStatus("Error: " + err.message, "error");
    } finally {
      btnAiGenerate.disabled = false;
    }
  });

  btnAiApply.addEventListener("click", function () {
    if (!aiGeneratedImage) return;
    const img = new Image();
    img.onload = function () {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      saveState();
      updateCanvasSize();
      setAiStatus("Applied to canvas.", "success");
    };
    img.src = aiGeneratedImage;
  });

  function setAiStatus(msg, type) {
    aiStatus.innerHTML = msg;
    aiStatus.className = "ai-status" + (type ? " " + type : "");
  }

  // --- Modal ---
  let modalCallback = null;

  function showModal(title, bodyHtml, onConfirm) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalCallback = onConfirm;
    modalOverlay.classList.remove("hidden");
    const firstInput = modalBody.querySelector("input");
    if (firstInput) firstInput.focus();
  }

  function hideModal() {
    modalOverlay.classList.add("hidden");
    modalCallback = null;
  }

  modalCancel.addEventListener("click", hideModal);
  modalConfirm.addEventListener("click", function () {
    if (modalCallback) modalCallback();
    hideModal();
  });

  modalOverlay.addEventListener("click", function (e) {
    if (e.target === modalOverlay) hideModal();
  });

  // --- Keyboard shortcuts ---
  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "y") {
      e.preventDefault();
      redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      btnSave.click();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "o") {
      e.preventDefault();
      btnOpen.click();
    }

    // Tool shortcuts
    const toolKeys = {
      b: "brush",
      e: "eraser",
      l: "line",
      r: "rect",
      c: "circle",
      t: "text",
      g: "fill",
      i: "eyedropper",
      k: "crop",
    };
    if (!e.ctrlKey && !e.metaKey && toolKeys[e.key]) {
      const btn = document.querySelector('[data-tool="' + toolKeys[e.key] + '"]');
      if (btn) btn.click();
    }
  });

  // --- Init ---
  init();
})();
