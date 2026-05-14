"use client";

import { useEffect, useRef, useState } from "react";

const clamp = (value, min = 0, max = 255) => Math.max(min, Math.min(max, value));

const getLuma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

const GEMINI_LOGO_ANCHOR = {
  x: 0.955,
  y: 0.93,
  radius: 0.043,
};

const SHINE_SOUND_URL =
  "https://www.myinstants.com/media/sounds/shine-brightness-sound-effect.mp3";

const playGeneratedShineSound = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const audioContext = new AudioContext();
  const masterGain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  const delay = audioContext.createDelay();
  const delayGain = audioContext.createGain();
  const now = audioContext.currentTime;
  const minGain = 0.00001;
  const notes = [
    { frequency: 659.25, start: 0, duration: 0.72, gain: 0.12 },
    { frequency: 987.77, start: 0.11, duration: 0.78, gain: 0.1 },
    { frequency: 1318.51, start: 0.23, duration: 0.85, gain: 0.075 },
    { frequency: 1975.53, start: 0.42, duration: 0.64, gain: 0.045 },
  ];

  filter.type = "highpass";
  filter.frequency.setValueAtTime(420, now);
  delay.delayTime.setValueAtTime(0.16, now);
  delayGain.gain.setValueAtTime(0.18, now);
  masterGain.gain.setValueAtTime(minGain, now);
  masterGain.gain.linearRampToValueAtTime(0.16, now + 0.08);
  masterGain.gain.setValueAtTime(0.16, now + 1.25);
  masterGain.gain.linearRampToValueAtTime(minGain, now + 1.65);
  filter.connect(masterGain);
  filter.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(masterGain);
  masterGain.connect(audioContext.destination);

  notes.forEach(({ frequency, start, duration, gain: noteGain }) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startsAt = now + start;
    const endsAt = startsAt + duration;

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, startsAt + duration * 0.45);
    gain.gain.setValueAtTime(minGain, startsAt);
    gain.gain.linearRampToValueAtTime(noteGain, startsAt + 0.06);
    gain.gain.setValueAtTime(noteGain, Math.max(startsAt + 0.06, endsAt - 0.18));
    gain.gain.linearRampToValueAtTime(minGain, endsAt);

    oscillator.connect(gain);
    gain.connect(filter);
    oscillator.start(startsAt);
    oscillator.stop(endsAt + 0.08);
  });

  const shimmer = audioContext.createOscillator();
  const shimmerGain = audioContext.createGain();

  shimmer.type = "sine";
  shimmer.frequency.setValueAtTime(2600, now + 0.18);
  shimmer.frequency.exponentialRampToValueAtTime(4200, now + 1.05);
  shimmerGain.gain.setValueAtTime(minGain, now + 0.18);
  shimmerGain.gain.linearRampToValueAtTime(0.02, now + 0.32);
  shimmerGain.gain.setValueAtTime(0.02, now + 0.95);
  shimmerGain.gain.linearRampToValueAtTime(minGain, now + 1.3);
  shimmer.connect(shimmerGain);
  shimmerGain.connect(filter);
  shimmer.start(now + 0.18);
  shimmer.stop(now + 1.38);

  window.setTimeout(() => audioContext.close(), 1850);
};

const playShineSound = () => {
  const audio = new Audio(SHINE_SOUND_URL);

  audio.volume = 0.7;
  audio.preload = "auto";
  audio.play().catch(() => {
    playGeneratedShineSound();
  });
};

export default function UploadImage() {
  const [imageName, setImageName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [status, setStatus] = useState("Upload a Gemini image to begin.");
  const [isProcessing, setIsProcessing] = useState(false);
  const [shineBurstKey, setShineBurstKey] = useState(0);
  const [activeView, setActiveView] = useState("before");
  const [settings, setSettings] = useState({
    brushSize: 34,
    brushSoftness: 0.55,
  });
  const [cloneMode, setCloneMode] = useState("off");
  const [cloneSource, setCloneSource] = useState(null);
  const [fillMode, setFillMode] = useState(false);

  const originalCanvasRef = useRef(null);
  const resultCanvasRef = useRef(null);
  const sourceImageRef = useRef(null);
  const uploadInputRef = useRef(null);
  const isPaintingRef = useRef(false);
  const strokeSourceRef = useRef(null);
  const cloneOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const drawImageToCanvases = (src) => {
    const image = new Image();
    image.onload = () => {
      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.round(image.naturalWidth * scale);
      const height = Math.round(image.naturalHeight * scale);

      [originalCanvasRef.current, resultCanvasRef.current].forEach((canvas) => {
        const context = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
      });

      sourceImageRef.current = image;
      setStatus("Ready for detection.");
    };
    image.src = src;
  };

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (imageUrl) URL.revokeObjectURL(imageUrl);

    const nextUrl = URL.createObjectURL(file);
    setImageUrl(nextUrl);
    setImageName(file.name);
    setActiveView("before");
    setStatus("Loading image...");
    drawImageToCanvases(nextUrl);
  };

  const openUploadPicker = () => {
    uploadInputRef.current?.click();
  };

  const buildBackgroundEstimate = (imageData) => {
    const cv = window.cv;

    if (!cv?.matFromImageData) {
      return null;
    }

    const source = cv.matFromImageData(imageData);
    const blurred = new cv.Mat();
    const size = new cv.Size(41, 41);

    cv.GaussianBlur(source, blurred, size, 0, 0, cv.BORDER_DEFAULT);
    const background = new ImageData(
      new Uint8ClampedArray(blurred.data),
      imageData.width,
      imageData.height
    );

    source.delete();
    blurred.delete();

    return background;
  };

  const smoothMask = (mask, width, height) => {
    const cv = window.cv;

    if (!cv?.Mat) {
      return mask;
    }

    const maskMat = new cv.Mat(height, width, cv.CV_8UC1);
    const closed = new cv.Mat();
    const smoothed = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));

    maskMat.data.set(mask);
    cv.morphologyEx(maskMat, closed, cv.MORPH_CLOSE, kernel);
    cv.GaussianBlur(closed, smoothed, new cv.Size(7, 7), 0);

    const nextMask = new Uint8ClampedArray(smoothed.data);

    maskMat.delete();
    closed.delete();
    smoothed.delete();
    kernel.delete();

    return nextMask;
  };

  const addGeminiShapeToMask = (mask, width, height, centerX, centerY, logoSize) => {
    const minX = Math.max(0, centerX - logoSize);
    const maxX = Math.min(width - 1, centerX + logoSize);
    const minY = Math.max(0, centerY - logoSize);
    const maxY = Math.min(height - 1, centerY + logoSize);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distanceX = Math.abs(x - centerX) / logoSize;
        const distanceY = Math.abs(y - centerY) / logoSize;
        const diamond = distanceX + distanceY;
        const horizontalArm = distanceX <= 0.95 && distanceY <= 0.22;
        const verticalArm = distanceX <= 0.24 && distanceY <= 0.95;
        const brightCore = diamond <= 0.72;
        const softHalo = diamond <= 1.08 && distanceX <= 0.82 && distanceY <= 0.82;

        if (brightCore || horizontalArm || verticalArm || softHalo) {
          mask[y * width + x] = 255;
        }
      }
    }
  };

  const findGeminiLogoCenter = (imageData, background) => {
    const { width, height } = imageData;
    const source = imageData.data;
    const bg = background.data;
    const startX = Math.floor(width * 0.78);
    const startY = Math.floor(height * 0.68);
    const endX = width - 1;
    const endY = height - 1;
    let bestScore = 0;
    let bestPoint = {
      x: Math.round(width * GEMINI_LOGO_ANCHOR.x),
      y: Math.round(height * GEMINI_LOGO_ANCHOR.y),
    };

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const index = (y * width + x) * 4;
        const r = source[index];
        const g = source[index + 1];
        const b = source[index + 2];
        const luma = getLuma(r, g, b);
        const bgLuma = getLuma(bg[index], bg[index + 1], bg[index + 2]);
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
        const edgeDistance = Math.abs(x - width * 0.95) + Math.abs(y - height * 0.92);
        const contrast = Math.abs(luma - bgLuma);
        const score =
          saturation <= 92 && luma >= 55 && luma <= 245
            ? contrast * 3 + Math.max(0, 180 - edgeDistance * 0.18)
            : 0;

        if (score > bestScore) {
          bestScore = score;
          bestPoint = { x, y };
        }
      }
    }

    return bestPoint;
  };

  const buildGeminiLogoMask = (imageData, background, centerOverride = null) => {
    const { width, height } = imageData;
    const source = imageData.data;
    const bg = background.data;
    const mask = new Uint8ClampedArray(width * height);
    const logoSize = Math.max(22, Math.round(Math.min(width, height) * GEMINI_LOGO_ANCHOR.radius));
    const detectedCenter = centerOverride || findGeminiLogoCenter(imageData, background);
    const centerX = detectedCenter.x;
    const centerY = detectedCenter.y;
    const minX = Math.max(0, centerX - logoSize);
    const maxX = Math.min(width - 1, centerX + logoSize);
    const minY = Math.max(0, centerY - logoSize);
    const maxY = Math.min(height - 1, centerY + logoSize);
    let detected = 0;

    addGeminiShapeToMask(mask, width, height, centerX, centerY, logoSize);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const index = (y * width + x) * 4;
        const pixelIndex = y * width + x;
        const r = source[index];
        const g = source[index + 1];
        const b = source[index + 2];
        const luma = getLuma(r, g, b);
        const bgLuma = getLuma(bg[index], bg[index + 1], bg[index + 2]);
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
        const contrast = Math.abs(luma - bgLuma);
        const distanceX = Math.abs(x - centerX) / logoSize;
        const distanceY = Math.abs(y - centerY) / logoSize;
        const diamondDistance = distanceX + distanceY * 0.72;
        const isNeutralLogoPixel = saturation <= 70 && contrast >= 5 && luma >= 45 && luma <= 245;
        const isSparkleShape = diamondDistance <= 1.08 || (distanceX <= 0.36 && distanceY <= 0.9);

        if (!isNeutralLogoPixel || !isSparkleShape) continue;

        mask[pixelIndex] = 255;
        detected += 1;
      }
    }

    if (detected < 20) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const distanceX = Math.abs(x - centerX) / logoSize;
          const distanceY = Math.abs(y - centerY) / logoSize;
          const diamondDistance = distanceX + distanceY * 0.72;

          if (diamondDistance <= 0.82 || (distanceX <= 0.28 && distanceY <= 0.72)) {
            mask[y * width + x] = 220;
            detected += 1;
          }
        }
      }
    }

    return { mask, detected, center: detectedCenter };
  };

  const inpaintMaskedPixels = (imageData, mask) => {
    const cv = window.cv;

    if (!cv?.inpaint || !cv?.matFromImageData) {
      return imageData;
    }

    const sourceRgba = cv.matFromImageData(imageData);
    const sourceRgb = new cv.Mat();
    const maskMat = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC1);
    const hardMask = new cv.Mat();
    const expandedMask = new cv.Mat();
    const outputRgb = new cv.Mat();
    const outputRgba = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));

    cv.cvtColor(sourceRgba, sourceRgb, cv.COLOR_RGBA2RGB);
    maskMat.data.set(mask);
    cv.threshold(maskMat, hardMask, 24, 255, cv.THRESH_BINARY);
    cv.dilate(hardMask, expandedMask, kernel, new cv.Point(-1, -1), 2);
    cv.inpaint(sourceRgb, expandedMask, outputRgb, 5, cv.INPAINT_TELEA);
    cv.cvtColor(outputRgb, outputRgba, cv.COLOR_RGB2RGBA);

    const cleanedImage = new ImageData(
      new Uint8ClampedArray(outputRgba.data),
      imageData.width,
      imageData.height
    );

    sourceRgba.delete();
    sourceRgb.delete();
    maskMat.delete();
    hardMask.delete();
    expandedMask.delete();
    outputRgb.delete();
    outputRgba.delete();
    kernel.delete();

    return cleanedImage;
  };

  const removeWatermark = async () => {
    const originalCanvas = originalCanvasRef.current;
    const resultCanvas = resultCanvasRef.current;

    if (!sourceImageRef.current || !originalCanvas || !resultCanvas) {
      setStatus("Upload an image first.");
      return;
    }

    playShineSound();
    setShineBurstKey((current) => current + 1);
    setIsProcessing(true);
    setStatus("Running calibrated Gemini reverse-alpha engine...");

    try {
      const { removeWatermarkFromImageDataSync } = await import(
        "@pilio/gemini-watermark-remover/image-data"
      );
      const originalContext = originalCanvas.getContext("2d", { willReadFrequently: true });
      const resultContext = resultCanvas.getContext("2d", { willReadFrequently: true });
      const { width, height } = originalCanvas;
      const imageData = originalContext.getImageData(0, 0, width, height);
      const result = removeWatermarkFromImageDataSync(imageData, {
        adaptiveMode: "auto",
        maxPasses: 4,
      });
      const meta = result.meta;

      resultContext.putImageData(result.imageData, 0, 0);
      setActiveView("after");

      if (meta?.applied) {
        const confidence = meta.detection?.adaptiveConfidence;
        const confidenceText = Number.isFinite(confidence)
          ? ` Confidence ${(confidence * 100).toFixed(0)}%.`
          : "";
        setStatus(`Official engine removed Gemini watermark.${confidenceText}`);
      } else {
        setStatus("Official engine did not detect a supported Gemini watermark. Try Fill Logo.");
      }
    } catch (error) {
      console.error(error);
      setStatus("Official engine failed here. Try Fill Logo or check console.");
    } finally {
      setIsProcessing(false);
    }
  };

  const fillGeminiLogoAtPoint = (point) => {
    const canvas = resultCanvasRef.current;
    const originalCanvas = originalCanvasRef.current;
    if (!canvas || !originalCanvas) return;

    const resultContext = canvas.getContext("2d", { willReadFrequently: true });
    const originalContext = originalCanvas.getContext("2d", { willReadFrequently: true });
    const imageData = resultContext.getImageData(0, 0, canvas.width, canvas.height);
    const originalData = originalContext.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
    const background = buildBackgroundEstimate(originalData) || originalData;
    const geminiLogo = buildGeminiLogoMask(imageData, background, point);
    const cleanedImage = inpaintMaskedPixels(imageData, smoothMask(geminiLogo.mask, canvas.width, canvas.height));

    resultContext.putImageData(cleanedImage, 0, 0);
    setActiveView("after");
    setStatus(`Content-aware filled Gemini mark at ${point.x}, ${point.y}.`);
  };

  const resetPreview = () => {
    if (!sourceImageRef.current || !originalCanvasRef.current || !resultCanvasRef.current) return;

    const context = resultCanvasRef.current.getContext("2d");
    context.clearRect(0, 0, resultCanvasRef.current.width, resultCanvasRef.current.height);
    context.drawImage(
      originalCanvasRef.current,
      0,
      0,
      resultCanvasRef.current.width,
      resultCanvasRef.current.height
    );
    setActiveView("before");
    setStatus("Preview reset.");
  };

  const downloadImage = () => {
    const canvas = resultCanvasRef.current;
    if (!canvas || !sourceImageRef.current) return;

    const link = document.createElement("a");
    link.download = imageName ? `clean-${imageName.replace(/\.[^.]+$/, "")}.png` : "clean-image.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: Number(value) }));
  };

  const getCanvasPoint = (event, canvas) => {
    const rect = canvas.getBoundingClientRect();

    return {
      x: Math.round(((event.clientX - rect.left) / rect.width) * canvas.width),
      y: Math.round(((event.clientY - rect.top) / rect.height) * canvas.height),
    };
  };

  const paintCloneStamp = (targetPoint) => {
    const canvas = resultCanvasRef.current;
    const sourceImage = strokeSourceRef.current;
    if (!canvas || !sourceImage) return;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    const output = context.getImageData(0, 0, canvas.width, canvas.height);
    const radius = Math.max(4, settings.brushSize / 2);
    const edgeStart = radius * settings.brushSoftness;
    const offset = cloneOffsetRef.current;
    const minX = Math.max(0, Math.floor(targetPoint.x - radius));
    const maxX = Math.min(canvas.width - 1, Math.ceil(targetPoint.x + radius));
    const minY = Math.max(0, Math.floor(targetPoint.y - radius));
    const maxY = Math.min(canvas.height - 1, Math.ceil(targetPoint.y + radius));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - targetPoint.x;
        const dy = y - targetPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > radius) continue;

        const sourceX = Math.round(x - offset.x);
        const sourceY = Math.round(y - offset.y);
        if (sourceX < 0 || sourceX >= canvas.width || sourceY < 0 || sourceY >= canvas.height) {
          continue;
        }

        const targetIndex = (y * canvas.width + x) * 4;
        const sourceIndex = (sourceY * canvas.width + sourceX) * 4;
        const fade =
          distance <= edgeStart ? 1 : clamp(1 - (distance - edgeStart) / (radius - edgeStart), 0, 1);

        output.data[targetIndex] =
          sourceImage.data[sourceIndex] * fade + output.data[targetIndex] * (1 - fade);
        output.data[targetIndex + 1] =
          sourceImage.data[sourceIndex + 1] * fade + output.data[targetIndex + 1] * (1 - fade);
        output.data[targetIndex + 2] =
          sourceImage.data[sourceIndex + 2] * fade + output.data[targetIndex + 2] * (1 - fade);
      }
    }

    context.putImageData(output, 0, 0);
  };

  const handleCanvasPointerDown = (event) => {
    const canvas = resultCanvasRef.current;
    if (!canvas || !sourceImageRef.current) return;

    const point = getCanvasPoint(event, canvas);

    if (fillMode) {
      fillGeminiLogoAtPoint(point);
      setFillMode(false);
      return;
    }

    if (cloneMode === "pick") {
      setCloneSource(point);
      setCloneMode("paint");
      setStatus(`Clone source set at ${point.x}, ${point.y}.`);
      return;
    }

    if (cloneMode !== "paint" || !cloneSource) return;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    strokeSourceRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
    cloneOffsetRef.current = {
      x: point.x - cloneSource.x,
      y: point.y - cloneSource.y,
    };
    isPaintingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    paintCloneStamp(point);
  };

  const handleCanvasPointerMove = (event) => {
    if (!isPaintingRef.current || cloneMode !== "paint") return;

    paintCloneStamp(getCanvasPoint(event, resultCanvasRef.current));
  };

  const stopCloneStroke = (event) => {
    if (resultCanvasRef.current?.hasPointerCapture?.(event.pointerId)) {
      resultCanvasRef.current.releasePointerCapture(event.pointerId);
    }

    isPaintingRef.current = false;
    strokeSourceRef.current = null;
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#090d0c] text-[#f8fbf6]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(245,199,107,0.16),transparent_30%),radial-gradient(circle_at_78%_0%,rgba(103,232,171,0.14),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_28%)]" />
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b9d8bd]">
              Calibrated Gemini reverse-alpha engine
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-white drop-shadow-[0_10px_34px_rgba(103,232,171,0.12)] sm:text-5xl">
              Gemini Watermark Remover
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveView("before")}
              disabled={!imageUrl}
              className={`rounded px-5 py-3 text-sm font-bold transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                activeView === "before"
                  ? "bg-white text-[#090d0c] shadow-[0_16px_38px_rgba(255,255,255,0.18)]"
                  : "border border-white/15 bg-white/[0.07] text-white backdrop-blur hover:border-white/40 hover:bg-white/[0.12]"
              }`}
            >
              Before
            </button>
            <button
              type="button"
              onClick={() => setActiveView("after")}
              disabled={!imageUrl}
              className={`rounded px-5 py-3 text-sm font-bold transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                activeView === "after"
                  ? "bg-[#d7ff78] text-[#090d0c] shadow-[0_16px_38px_rgba(215,255,120,0.22)]"
                  : "border border-white/15 bg-white/[0.07] text-white backdrop-blur hover:border-[#d7ff78]/70 hover:bg-white/[0.12]"
              }`}
            >
              After
            </button>
            <label className="inline-flex cursor-pointer items-center justify-center rounded border border-[#d7ff78]/70 bg-[linear-gradient(135deg,#f6ffae,#6ff0b2)] px-5 py-3 text-sm font-bold text-[#090d0c] shadow-[0_16px_40px_rgba(111,240,178,0.22)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_52px_rgba(215,255,120,0.28)]">
              Upload
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="sr-only"
              />
            </label>
          </div>
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[1fr_310px]">
          <div className="flex min-h-[520px] flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#dfe9df]">
                {activeView === "before" ? "Original image" : "Clean result"}
              </p>
              {imageName && (
                <p className="max-w-[55vw] truncate text-sm text-[#90a096]">{imageName}</p>
              )}
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded border border-white/10 bg-[#121816] shadow-[0_32px_110px_rgba(0,0,0,0.46)] ring-1 ring-white/[0.03]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(215,255,120,0.13),transparent_34%),radial-gradient(circle_at_15%_80%,rgba(103,232,171,0.1),transparent_34%)]" />
              {!imageUrl && (
                <button
                  type="button"
                  onClick={openUploadPicker}
                  className="relative z-10 flex min-h-[520px] w-full flex-col items-center justify-center gap-3 px-6 text-center transition duration-200 hover:bg-white/[0.03] focus:outline-none focus:ring-2 focus:ring-[#d7ff78]/70 focus:ring-offset-2 focus:ring-offset-[#121816]"
                >
                  <div className="h-14 w-14 rounded-full border border-[#d7ff78]/40 bg-[#d7ff78]/10 shadow-[0_0_42px_rgba(215,255,120,0.2)]" />
                  <p className="text-lg font-bold text-white">Upload a Gemini image</p>
                  <p className="max-w-md text-sm text-[#90a096]">
                    The preview will appear here with before and after controls.
                  </p>
                </button>
              )}

              <canvas
                ref={originalCanvasRef}
                className={`max-h-[72vh] max-w-full object-contain ${
                  imageUrl && activeView === "before" ? "block" : "hidden"
                }`}
              />

              <canvas
                ref={resultCanvasRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={stopCloneStroke}
                onPointerCancel={stopCloneStroke}
                className={`max-h-[72vh] max-w-full object-contain ${
                  imageUrl && activeView === "after" ? "block" : "hidden"
                } ${cloneMode === "off" && !fillMode ? "" : "cursor-crosshair touch-none"}`}
              />

              {shineBurstKey > 0 && (
                <div
                  key={shineBurstKey}
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                >
                  <div className="absolute left-[16%] top-[16%] h-28 w-28 animate-[sparklePop_1.35s_cubic-bezier(0.22,1,0.36,1)_both] rounded-full bg-[#d7ff78]/22 blur-2xl" />
                  <div className="absolute right-[16%] top-[24%] h-20 w-20 animate-[sparklePop_1.35s_0.18s_cubic-bezier(0.22,1,0.36,1)_both] rounded-full bg-white/28 blur-2xl" />
                  <div className="absolute bottom-[18%] left-[34%] h-24 w-24 animate-[sparklePop_1.45s_0.34s_cubic-bezier(0.22,1,0.36,1)_both] rounded-full bg-[#67e8ab]/20 blur-2xl" />
                  <div className="absolute inset-0 animate-[prismFlash_1.7s_cubic-bezier(0.22,1,0.36,1)_both] bg-[conic-gradient(from_90deg_at_50%_50%,transparent,rgba(215,255,120,0.18),rgba(255,255,255,0.3),rgba(103,232,171,0.18),transparent)]" />
                  <div className="absolute inset-0 animate-[soundWaveSweep_1.65s_cubic-bezier(0.22,1,0.36,1)_both] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.48)_0%,rgba(215,255,120,0.3)_8%,transparent_30%)]" />
                  <div className="absolute inset-0 animate-[soundShineSlice_1.55s_cubic-bezier(0.22,1,0.36,1)_both] bg-[linear-gradient(120deg,transparent_0%,transparent_39%,rgba(255,255,255,0.78)_47%,rgba(215,255,120,0.42)_51%,transparent_62%,transparent_100%)] bg-[length:280%_100%]" />
                </div>
              )}

              {isProcessing && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#07110c]/25">
                  <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(215,255,120,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,171,0.14)_1px,transparent_1px)] [background-size:44px_44px]" />
                  <div className="absolute inset-x-0 top-0 h-36 animate-[scanLine_2.35s_cubic-bezier(0.45,0,0.2,1)_infinite] bg-gradient-to-b from-transparent via-[#d7ff78]/72 to-transparent shadow-[0_0_44px_rgba(215,255,120,0.7)]" />
                  <div className="absolute inset-0 animate-[shineSweep_2.8s_cubic-bezier(0.4,0,0.2,1)_infinite] bg-[linear-gradient(112deg,transparent_0%,transparent_34%,rgba(255,255,255,0.55)_45%,rgba(215,255,120,0.28)_50%,transparent_62%,transparent_100%)] bg-[length:250%_100%]" />
                  <div className="absolute bottom-5 left-1/2 w-[min(420px,80%)] -translate-x-1/2 rounded border border-white/20 bg-[#101413]/90 p-3 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur">
                    <div className="flex items-center justify-between gap-3 text-sm font-bold">
                      <span>Scanning watermark</span>
                      <span className="text-[#d7ff78]">Reverse alpha</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded bg-white/10">
                      <div className="h-full w-1/2 animate-[progressPulse_1.9s_cubic-bezier(0.45,0,0.2,1)_infinite] rounded bg-[#d7ff78] shadow-[0_0_20px_rgba(215,255,120,0.78)]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded border border-white/10 bg-white/[0.065] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.26)] backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b9d8bd]">
                Actions
              </p>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={removeWatermark}
                  disabled={!imageUrl || isProcessing}
                  className="rounded border border-[#d7ff78]/70 bg-[linear-gradient(135deg,#f6ffae,#67e8ab)] px-5 py-3 text-sm font-black text-[#090d0c] shadow-[0_16px_42px_rgba(103,232,171,0.23)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(215,255,120,0.32)] active:translate-y-0 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-none disabled:bg-white/20 disabled:text-white/45 disabled:shadow-none"
                >
                  {isProcessing ? "Processing..." : "Remove Watermark"}
                </button>
                <button
                  type="button"
                  onClick={downloadImage}
                  disabled={!imageUrl || isProcessing}
                  className="rounded border border-[#b7c7ff]/25 bg-[#dce5ff]/12 px-5 py-3 text-sm font-bold text-white shadow-[0_12px_30px_rgba(0,0,0,0.16)] transition duration-200 hover:-translate-y-0.5 hover:border-[#b7c7ff]/55 hover:bg-[#dce5ff]/18 hover:shadow-[0_18px_42px_rgba(183,199,255,0.12)] disabled:cursor-not-allowed disabled:text-white/45 disabled:shadow-none"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={resetPreview}
                  disabled={!imageUrl || isProcessing}
                  className="rounded border border-white/15 bg-transparent px-5 py-3 text-sm font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:border-white/45 hover:bg-white/[0.08] hover:shadow-[0_12px_26px_rgba(0,0,0,0.18)] disabled:cursor-not-allowed disabled:text-white/35 disabled:shadow-none"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="rounded border border-white/10 bg-white/[0.065] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.26)] backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b9d8bd]">
                Manual tools
              </p>
              <label className="mt-4 block text-sm font-medium">
                Clone brush size
                <input
                  type="range"
                  min="8"
                  max="90"
                  value={settings.brushSize}
                  onChange={(event) => updateSetting("brushSize", event.target.value)}
                  className="mt-2 w-full accent-[#2d6a4f]"
                />
                <span className="text-xs text-[#94a79a]">{settings.brushSize}px</span>
              </label>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCloneMode("pick");
                    setFillMode(false);
                    setActiveView("after");
                    setStatus("Click a clean source area, then paint over the mark.");
                  }}
                  disabled={!imageUrl || isProcessing}
                  className="rounded border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:border-[#d7ff78]/60 hover:bg-white/[0.16] hover:shadow-[0_12px_26px_rgba(0,0,0,0.18)] disabled:cursor-not-allowed disabled:text-white/35 disabled:shadow-none"
                >
                  Clone
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFillMode(true);
                    setCloneMode("off");
                    setActiveView("after");
                    setStatus("Click the center of the Gemini logo for content-aware fill.");
                  }}
                  disabled={!imageUrl || isProcessing}
                  className="rounded border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:border-[#d7ff78]/60 hover:bg-white/[0.16] hover:shadow-[0_12px_26px_rgba(0,0,0,0.18)] disabled:cursor-not-allowed disabled:text-white/35 disabled:shadow-none"
                >
                  Fill
                </button>
              </div>
            </div>

            <div className="rounded border border-white/10 bg-white/[0.065] p-4 text-sm text-[#dfe9df] shadow-[0_24px_60px_rgba(0,0,0,0.26)] backdrop-blur-xl">
              {status}
            </div>
          </aside>
        </section>

        <footer className="mt-auto border-t border-white/10 pt-4 text-center text-sm text-[#9fb0a5]">
          <p>
            Developed by{" "}
            <span className="font-semibold text-[#d7ff78]">Morsalen</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://wa.me/8801762783339"
              target="_blank"
              rel="noreferrer"
              className="rounded border border-white/10 px-3 py-2 text-[#dfe9df] transition hover:border-[#d7ff78]/60 hover:text-[#d7ff78]"
            >
              WhatsApp
            </a>
            <a
              href="https://www.facebook.com/morsalen0220/"
              target="_blank"
              rel="noreferrer"
              className="rounded border border-white/10 px-3 py-2 text-[#dfe9df] transition hover:border-[#d7ff78]/60 hover:text-[#d7ff78]"
            >
              Facebook
            </a>
          </div>
        </footer>
      </section>
    </main>
  );
}
