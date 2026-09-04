export interface Point {
  x: number;
  y: number;
}

function distance(
  a: Point,
  b: Point
) {
  return Math.hypot(
    a.x - b.x,
    a.y - b.y
  );
}

function orderCorners(
  points: Point[]
): Point[] {
  if (points.length !== 4) {
    return points;
  }

  const sums = points.map(
    (p) => p.x + p.y
  );

  const diffs = points.map(
    (p) => p.x - p.y
  );

  const topLeft =
    points[
      sums.indexOf(
        Math.min(...sums)
      )
    ];

  const bottomRight =
    points[
      sums.indexOf(
        Math.max(...sums)
      )
    ];

  const topRight =
    points[
      diffs.indexOf(
        Math.max(...diffs)
      )
    ];

  const bottomLeft =
    points[
      diffs.indexOf(
        Math.min(...diffs)
      )
    ];

  return [
    topLeft,
    topRight,
    bottomRight,
    bottomLeft,
  ];
}

export function detectDocumentCorners(
  cv: any,
  imgElement: HTMLImageElement
): Point[] | null {
  const src =
    cv.imread(imgElement);

  const gray =
    new cv.Mat();

  const blurred =
    new cv.Mat();

  const edged =
    new cv.Mat();

  const dilated =
    new cv.Mat();

  const kernel =
    cv.Mat.ones(
      5,
      5,
      cv.CV_8U
    );

  const contours =
    new cv.MatVector();

  const hierarchy =
    new cv.Mat();

  try {
    /*
     * Convert to grayscale.
     */
    cv.cvtColor(
      src,
      gray,
      cv.COLOR_RGBA2GRAY
    );

    /*
     * Reduce camera noise.
     */
    cv.GaussianBlur(
      gray,
      blurred,
      new cv.Size(5, 5),
      0
    );

    /*
     * Detect edges.
     */
    cv.Canny(
      blurred,
      edged,
      50,
      150
    );

    /*
     * Strengthen document edges.
     */
    cv.dilate(
      edged,
      dilated,
      kernel
    );

    /*
     * Find external contours.
     */
    cv.findContours(
      dilated,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    const imageArea =
      src.rows * src.cols;

    let bestScore = 0;

    let bestPoints:
      Point[] | null = null;

    for (
      let i = 0;
      i < contours.size();
      i++
    ) {
      const contour =
        contours.get(i);

      try {
        const area =
          cv.contourArea(
            contour
          );

        /*
         * Ignore very small objects.
         */
        if (
          area <
          imageArea * 0.05
        ) {
          continue;
        }

        /*
         * Ignore contours that are
         * unrealistically large.
         */
        if (
          area >
          imageArea * 0.98
        ) {
          continue;
        }

        const perimeter =
          cv.arcLength(
            contour,
            true
          );

        /*
         * Try multiple approximation
         * tolerances for better detection.
         */
        let approximation:
          any = null;

        const tolerances = [
          0.015,
          0.02,
          0.025,
          0.03,
          0.04,
        ];

        for (
          const tolerance of tolerances
        ) {
          const candidate =
            new cv.Mat();

          cv.approxPolyDP(
            contour,
            candidate,
            tolerance *
              perimeter,
            true
          );

          if (
            candidate.rows === 4
          ) {
            approximation =
              candidate;

            break;
          }

          candidate.delete();
        }

        if (
          !approximation
        ) {
          continue;
        }

        const points: Point[] =
          [];

        for (
          let j = 0;
          j < 4;
          j++
        ) {
          points.push({
            x:
              approximation.data32S[
                j * 2
              ],
            y:
              approximation.data32S[
                j * 2 + 1
              ],
          });
        }

        approximation.delete();

        const ordered =
          orderCorners(
            points
          );

        /*
         * Calculate rectangularity.
         *
         * A document should have
         * reasonably long edges.
         */
        const widthTop =
          distance(
            ordered[0],
            ordered[1]
          );

        const widthBottom =
          distance(
            ordered[3],
            ordered[2]
          );

        const heightLeft =
          distance(
            ordered[0],
            ordered[3]
          );

        const heightRight =
          distance(
            ordered[1],
            ordered[2]
          );

        const averageWidth =
          (widthTop +
            widthBottom) /
          2;

        const averageHeight =
          (heightLeft +
            heightRight) /
          2;

        if (
          averageWidth < 100 ||
          averageHeight < 100
        ) {
          continue;
        }

        /*
         * Prefer larger documents.
         */
        const areaScore =
          area /
          imageArea;

        /*
         * Slightly reward contours
         * that have a good rectangular
         * shape.
         */
        const widthRatio =
          Math.min(
            widthTop,
            widthBottom
          ) /
          Math.max(
            widthTop,
            widthBottom
          );

        const heightRatio =
          Math.min(
            heightLeft,
            heightRight
          ) /
          Math.max(
            heightLeft,
            heightRight
          );

        const shapeScore =
          (widthRatio +
            heightRatio) /
          2;

        const score =
          areaScore *
          0.7 +
          shapeScore *
          0.3;

        if (
          score > bestScore
        ) {
          bestScore =
            score;

          bestPoints =
            ordered;
        }
      } finally {
        contour.delete();
      }
    }

    return bestPoints;
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
  imgElement: HTMLImageElement,
  corners: Point[]
): HTMLCanvasElement {
  const src =
    cv.imread(imgElement);

  const [
    tl,
    tr,
    br,
    bl,
  ] = orderCorners(
    corners
  );

  const widthTop =
    distance(
      tl,
      tr
    );

  const widthBottom =
    distance(
      bl,
      br
    );

  const heightLeft =
    distance(
      tl,
      bl
    );

  const heightRight =
    distance(
      tr,
      br
    );

  const outputWidth =
    Math.round(
      Math.max(
        widthTop,
        widthBottom
      )
    );

  const outputHeight =
    Math.round(
      Math.max(
        heightLeft,
        heightRight
      )
    );

  /*
   * Keep output within sensible
   * browser/mobile limits.
   */
  const width =
    Math.min(
      Math.max(
        outputWidth,
        800
      ),
      2400
    );

  const height =
    Math.min(
      Math.max(
        outputHeight,
        500
      ),
      1800
    );

  const srcPoints =
    cv.matFromArray(
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

  const dstPoints =
    cv.matFromArray(
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

  const matrix =
    cv.getPerspectiveTransform(
      srcPoints,
      dstPoints
    );

  const destination =
    new cv.Mat();

  cv.warpPerspective(
    src,
    destination,
    matrix,
    new cv.Size(
      width,
      height
    ),
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    width;

  canvas.height =
    height;

  cv.imshow(
    canvas,
    destination
  );

  src.delete();
  srcPoints.delete();
  dstPoints.delete();
  matrix.delete();
  destination.delete();

  return canvas;
}
