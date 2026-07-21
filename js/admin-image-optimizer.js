(() => {
  "use strict";

  const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
  const DEFAULTS = Object.freeze({
    maxInputBytes: 10 * 1024 * 1024,
    maxDimension: 1600,
    minDimension: 720,
    targetBytes: 420 * 1024,
    qualities: [0.82, 0.76, 0.7, 0.64, 0.58],
  });

  function canvasToWebp(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Браузер не смог оптимизировать изображение"));
        if (blob.type !== "image/webp") return reject(new Error("Браузер не поддерживает конвертацию в WebP"));
        resolve(blob);
      }, "image/webp", quality);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Не удалось подготовить изображение к загрузке"));
      reader.readAsDataURL(blob);
    });
  }

  function createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function drawImage(source, width, height) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Не удалось подготовить изображение");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function resizeCanvas(source, width, height) {
    return drawImage(source, width, height);
  }

  async function decodeImage(file) {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        // Fall back to HTMLImageElement for browsers with partial bitmap support.
      }
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = objectUrl;
      await image.decode();
      return image;
    } catch {
      throw new Error("Не удалось прочитать изображение");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function prepare(file, overrides = {}) {
    const options = { ...DEFAULTS, ...overrides };
    if (!file) throw new Error("Файл не выбран");
    if (!SUPPORTED_TYPES.has(file.type)) throw new Error("Поддерживаются JPG, PNG, WebP и AVIF");
    if (file.size > options.maxInputBytes) throw new Error("Файл больше 10 МБ");

    const decoded = await decodeImage(file);
    const sourceWidth = Number(decoded.width || decoded.naturalWidth || 0);
    const sourceHeight = Number(decoded.height || decoded.naturalHeight || 0);
    if (!sourceWidth || !sourceHeight) throw new Error("Не удалось определить размер изображения");

    const initialScale = Math.min(1, options.maxDimension / Math.max(sourceWidth, sourceHeight));
    let canvas = drawImage(decoded, sourceWidth * initialScale, sourceHeight * initialScale);
    decoded.close?.();

    let lastBlob = null;
    while (true) {
      for (const quality of options.qualities) {
        lastBlob = await canvasToWebp(canvas, quality);
        if (lastBlob.size <= options.targetBytes) return blobToDataUrl(lastBlob);
      }

      const longestSide = Math.max(canvas.width, canvas.height);
      if (longestSide <= options.minDimension) return blobToDataUrl(lastBlob);

      const nextLongestSide = Math.max(options.minDimension, Math.round(longestSide * 0.82));
      const scale = nextLongestSide / longestSide;
      canvas = resizeCanvas(canvas, canvas.width * scale, canvas.height * scale);
    }
  }

  window.AdminImageOptimizer = Object.freeze({ prepare });
})();
