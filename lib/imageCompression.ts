export type ResolutionPreset = "high" | "medium";

const PRESETS: Record<ResolutionPreset, { maxDimension: number; quality: number }> = {
  high: { maxDimension: 2000, quality: 0.9 },
  medium: { maxDimension: 1200, quality: 0.7 },
};

export async function compressImage(file: File | Blob, preset: ResolutionPreset): Promise<Blob> {
  const { maxDimension, quality } = PRESETS[preset];
  const bitmap = await createImageBitmap(file);

  let { width, height } = bitmap;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
      "image/jpeg",
      quality
    );
  });
}
