export type ResolutionPreset = "high" | "medium";

const PRESETS: Record<
  ResolutionPreset,
  {
    maxDimension: number;
    quality: number;
  }
> = {
  high: {
    maxDimension: 2200,
    quality: 0.88,
  },

  medium: {
    maxDimension: 1400,
    quality: 0.68,
  },
};

export async function compressImage(
  file: File | Blob,
  preset: ResolutionPreset
): Promise<Blob> {
  const settings = PRESETS[preset];

  const bitmap = await createImageBitmap(file);

  let width = bitmap.width;
  let height = bitmap.height;

  const largestSide = Math.max(width, height);

  if (largestSide > settings.maxDimension) {
    const scale =
      settings.maxDimension / largestSide;

    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new Error("Canvas is not supported.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.drawImage(
    bitmap,
    0,
    0,
    width,
    height
  );

  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new Error("Unable to compress image.")
          );
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      settings.quality
    );
  });
}
