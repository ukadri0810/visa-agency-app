export type ResolutionPreset = "high" | "medium";

export const PRESETS: Record<ResolutionPreset, { maxDimension: number; quality: number; label: string; description: string }> = {
  high: { maxDimension: 2400, quality: 0.92, label: "High resolution", description: "Best for printing and archiving" },
  medium: { maxDimension: 1500, quality: 0.78, label: "Medium resolution", description: "Smaller file, faster sharing" },
};

export async function compressImage(file: File | Blob, preset: ResolutionPreset): Promise<Blob> {
  const { maxDimension, quality } = PRESETS[preset];
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas not supported");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
      "image/jpeg",
      quality,
    );
  });
}
