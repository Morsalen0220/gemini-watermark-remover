# Gemini Watermark Remover

A browser-based Next.js tool for removing supported Gemini watermark logos from images.

The main removal flow uses the `@pilio/gemini-watermark-remover` SDK, which applies calibrated Gemini alpha maps and reverse alpha blending. The app also includes manual fallback tools for logo fill and clone-style cleanup.

## Features

- Large before/after image preview
- Calibrated Gemini watermark removal
- Premium scanning and shine effects during processing
- Sound effect on removal
- Manual fill and clone fallback tools
- Canvas-only export as PNG

## Tech Stack

- Next.js
- React
- Canvas API
- OpenCV.js fallback cleanup
- `@pilio/gemini-watermark-remover`
- Tailwind CSS

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Notes

- Best results come from original Gemini exports that match the SDK's supported watermark patterns.
- Cropped, resized, compressed, or screenshot images may need the manual Fill or Clone tools.
- The shine sound currently loads from MyInstants with a generated Web Audio fallback.
