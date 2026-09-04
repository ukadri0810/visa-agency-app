export interface Point {
  x: number;
  y: number;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function orderCorners(points: Point[]): Point[] {
  const sums = points.map((p) => p.x + p.y);
  const diffs = points.map((p) => p.x - p.y);

  const topLeft = points[sums.indexOf(Math.min(...sums))];
  const bottomRight = points[sums.indexOf(Math.max(...sums))];
  const topRight = points[diffs.indexOf(Math.max(...diffs))];
  const bottomLeft = points[diffs.indexOf(Math.min(...diffs))];

  return [topLeft, topRight, bottomRight, bottomLeft];
}

export function detectDocumentCorners(
  cv: any,
  imgElement: HTMLImageElement
): Point[] | null {
  const src = cv.imread(imgElement);

  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edged = new cv.Mat();
  const dilated = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edged, 50, 150);

  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  cv.dilate(edged, dilated, kernel);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.findContours(
    dilated,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  let bestArea = 0;
  let bestPoints: Point[] | null = null;

  const imageArea = src.rows * src.cols;

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);

    const area = cv.contourArea(contour);

    if (area < imageArea * 0.08) {
      contour.delete();
      continue;
    }

    const perimeter = cv.arcLength(contour, true);
    const approximation = new cv.Mat();

    cv.approxPolyDP(
      contour,
      approximation,
      0.02 * perimeter,
      true
    );

    if (approximation.rows === 4 && area > bestArea) {
      const points: Point[] = [];

      for (let j = 0; j < 4; j++) {
        points.push({
          x: approximation.data32S[j * 2],
          y: approximation.data32S[j * 2 + 1],
        });
      }

      bestArea = area;
      bestPoints = orderCorners(points);
    }

    approximation.delete();
    contour.delete();
  }

  src.delete();
  gray.delete();
  blurred.delete();
  edged.delete();
  dilated.delete();
  kernel.delete();
  contours.delete();
  hierarchy.delete();

  if (!bestPoints) return null;

  return bestPoints;
}

export function warpToRect(
  cv: any,
  imgElement: HTMLImageElement,
  corners: Point[]
): HTMLCanvasElement {
  const src = cv.imread(imgElement);

  const [tl, tr, br, bl] = orderCorners(corners);

  const widthTop = distance(tl, tr);
  const widthBottom = distance(bl, br);
  const heightLeft = distance(tl, bl);
  const heightRight = distance(tr, br);

  const outputWidth = Math.round(
    Math.max(widthTop, widthBottom)
  );

  const outputHeight = Math.round(
    Math.max(heightLeft, heightRight)
  );

  const width = Math.min(Math.max(outputWidth, 800), 2400);
  const height = Math.min(Math.max(outputHeight, 500), 1800);

  const srcPoints = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    [
      tl.x,
      tl.y,
      tr.x,
      tr.y,
      br.x,
      br.y,
      bl.x,
      bl.y,
    ]
  );

  const dstPoints = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    [
      0,
      0,
      width,
      0,
      width,
      height,
      0,
      height,
    ]
  );

  const matrix = cv.getPerspectiveTransform(
    srcPoints,
    dstPoints
  );

  const destination = new cv.Mat();

  cv.warpPerspective(
    src,
    destination,
    matrix,
    new cv.Size(width, height)
  );

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  cv.imshow(canvas, destination);

  src.delete();
  srcPoints.delete();
  dstPoints.delete();
  matrix.delete();
  destination.delete();

  return canvas;
}
