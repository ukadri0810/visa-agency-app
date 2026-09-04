export interface Point {
  x: number;
  y: number;
}

export interface DetectionResult {
  corners: Point[] | null;
  confidence: number;
}

function orderCorners(pts: Point[]): Point[] {
  const sums = pts.map((p) => p.x + p.y);
  const diffs = pts.map((p) => p.x - p.y);
  const tl = pts[sums.indexOf(Math.min(...sums))];
  const br = pts[sums.indexOf(Math.max(...sums))];
  const tr = pts[diffs.indexOf(Math.max(...diffs))];
  const bl = pts[diffs.indexOf(Math.min(...diffs))];
  return [tl, tr, br, bl];
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polygonArea(points: Point[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

export function detectDocumentCorners(
  cv: any,
  source: HTMLImageElement | HTMLCanvasElement,
): DetectionResult {
  const src = cv.imread(source);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edged = new cv.Mat();
  const dilated = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edged, 50, 150);
    cv.dilate(edged, dilated, kernel);
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let best: Point[] | null = null;
    let bestScore = 0;
    const imageArea = src.rows * src.cols;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const approx = new cv.Mat();
      try {
        const peri = cv.arcLength(contour, true);
        cv.approxPolyDP(contour, approx, Math.max(2, 0.02 * peri), true);

        if (approx.rows === 4) {
          const area = Math.abs(cv.contourArea(approx));
          const areaRatio = area / imageArea;
          if (areaRatio >= 0.18 && areaRatio <= 0.98) {
            const points: Point[] = [];
            for (let j = 0; j < 4; j++) {
              points.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
            }
            const ordered = orderCorners(points);
            const edge1 = distance(ordered[0], ordered[1]);
            const edge2 = distance(ordered[1], ordered[2]);
            const edge3 = distance(ordered[2], ordered[3]);
            const edge4 = distance(ordered[3], ordered[0]);
            const rectangularity = Math.min(edge1, edge3) / Math.max(edge1, edge3) *
              (Math.min(edge2, edge4) / Math.max(edge2, edge4));
            const score = areaRatio * (0.55 + 0.45 * Math.max(0, Math.min(1, rectangularity)));
            if (score > bestScore) {
              bestScore = score;
              best = ordered;
            }
          }
        }
      } finally {
        approx.delete();
        contour.delete();
      }
    }

    return {
      corners: best,
      confidence: best ? Math.min(1, bestScore / 0.75) : 0,
    };
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edged.delete();
    dilated.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }
}

export function warpToRect(
  cv: any,
  source: HTMLImageElement | HTMLCanvasElement,
  corners: Point[],
  outWidth = 1600,
  outHeight = 1000,
): HTMLCanvasElement {
  const src = cv.imread(source);
  const ordered = orderCorners(corners);
  const topWidth = distance(ordered[0], ordered[1]);
  const bottomWidth = distance(ordered[3], ordered[2]);
  const leftHeight = distance(ordered[0], ordered[3]);
  const rightHeight = distance(ordered[1], ordered[2]);
  const ratio = Math.max(0.45, Math.min(1.8, ((topWidth + bottomWidth) / 2) / ((leftHeight + rightHeight) / 2)));
  const targetWidth = ratio >= 1 ? outWidth : outHeight;
  const targetHeight = ratio >= 1 ? outHeight : outWidth;

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    ordered[0].x, ordered[0].y,
    ordered[1].x, ordered[1].y,
    ordered[2].x, ordered[2].y,
    ordered[3].x, ordered[3].y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    targetWidth, 0,
    targetWidth, targetHeight,
    0, targetHeight,
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(targetWidth, targetHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  cv.imshow(canvas, dst);

  src.delete();
  srcTri.delete();
  dstTri.delete();
  M.delete();
  dst.delete();
  return canvas;
}

export function canvasToFile(canvas: HTMLCanvasElement, name: string, quality = 0.95): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Could not create captured image"));
      resolve(new File([blob], name, { type: "image/jpeg", lastModified: Date.now() }));
    }, "image/jpeg", quality);
  });
}
