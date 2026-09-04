export interface Point {
  x: number;
  y: number;
}

export function detectDocumentCorners(cv: any, imgElement: HTMLImageElement): Point[] | null {
  const src = cv.imread(imgElement);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  const edged = new cv.Mat();
  cv.Canny(blurred, edged, 75, 200);
  const dilated = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  cv.dilate(edged, dilated, kernel);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  let maxArea = 0;
  let bestApprox: any = null;

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const peri = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, 0.02 * peri, true);

    if (approx.rows === 4) {
      const area = cv.contourArea(approx);
      if (area > maxArea) {
        maxArea = area;
        if (bestApprox) bestApprox.delete();
        bestApprox = approx;
      } else {
        approx.delete();
      }
    } else {
      approx.delete();
    }
    contour.delete();
  }

  let points: Point[] | null = null;
  if (bestApprox && maxArea > src.rows * src.cols * 0.1) {
    points = [];
    for (let i = 0; i < 4; i++) {
      points.push({ x: bestApprox.data32S[i * 2], y: bestApprox.data32S[i * 2 + 1] });
    }
    bestApprox.delete();
  }

  src.delete();
  gray.delete();
  blurred.delete();
  edged.delete();
  dilated.delete();
  kernel.delete();
  contours.delete();
  hierarchy.delete();

  return points;
}

function orderCorners(pts: Point[]): Point[] {
  const sorted = [...pts].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]]; // TL, TR, BR, BL
}

export function warpToRect(
  cv: any,
  imgElement: HTMLImageElement,
  corners: Point[],
  outWidth = 1000,
  outHeight = 630
): HTMLCanvasElement {
  const src = cv.imread(imgElement);
  const ordered = orderCorners(corners);

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    ordered[0].x, ordered[0].y,
    ordered[1].x, ordered[1].y,
    ordered[2].x, ordered[2].y,
    ordered[3].x, ordered[3].y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    outWidth, 0,
    outWidth, outHeight,
    0, outHeight,
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(outWidth, outHeight));

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  cv.imshow(canvas, dst);

  src.delete();
  srcTri.delete();
  dstTri.delete();
  M.delete();
  dst.delete();
  return canvas;
}
