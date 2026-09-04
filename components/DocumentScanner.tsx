"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  detectDocumentCorners,
  warpToRect,
  Point,
} from "@/lib/edgeDetection";

import {
  compressImage,
  ResolutionPreset,
} from "@/lib/imageCompression";

interface DocumentScannerProps {
  documentName: string;
  onComplete: (
    file: File,
    compressed: Blob
  ) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    cv: any;
  }
}

type ScannerStep =
  | "camera"
  | "crop"
  | "preview";

const HANDLE_RADIUS = 18;

function distance(a: Point, b: Point) {
  return Math.hypot(
    a.x - b.x,
    a.y - b.y
  );
}

function orderCorners(points: Point[]): Point[] {
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

export default function DocumentScanner({
  documentName,
  onComplete,
  onClose,
}: DocumentScannerProps) {
  const videoRef =
    useRef<HTMLVideoElement | null>(null);

  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  const imageRef =
    useRef<HTMLImageElement | null>(null);

  const animationRef =
    useRef<number | null>(null);

  const [step, setStep] =
    useState<ScannerStep>("camera");

  const [capturedImage, setCapturedImage] =
    useState<string | null>(null);

  const [processedImage, setProcessedImage] =
    useState<string | null>(null);

  const [corners, setCorners] =
    useState<Point[] | null>(null);

  const [originalCorners, setOriginalCorners] =
    useState<Point[] | null>(null);

  const [activeCorner, setActiveCorner] =
    useState<number | null>(null);

  const [resolution, setResolution] =
    useState<ResolutionPreset>("medium");

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [cameraReady, setCameraReady] =
    useState(false);

  const [imageSize, setImageSize] =
    useState({
      width: 0,
      height: 0,
    });

  /*
   * --------------------------------------------------
   * OpenCV
   * --------------------------------------------------
   */

  const waitForOpenCV =
    useCallback(async () => {
      for (
        let attempt = 0;
        attempt < 100;
        attempt++
      ) {
        if (
          typeof window !== "undefined" &&
          window.cv &&
          window.cv.Mat
        ) {
          return window.cv;
        }

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              100
            )
        );
      }

      throw new Error(
        "OpenCV did not load."
      );
    }, []);

  /*
   * --------------------------------------------------
   * Stop camera
   * --------------------------------------------------
   */

  const stopCamera =
    useCallback(() => {
      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach((track) =>
            track.stop()
          );

        streamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject =
          null;
      }

      setCameraReady(false);
    }, []);

  /*
   * --------------------------------------------------
   * Start camera
   * --------------------------------------------------
   */

  const startCamera =
    useCallback(async () => {
      try {
        setLoading(true);
        setMessage(
          "Starting camera..."
        );

        stopCamera();

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              video: {
                facingMode: {
                  ideal: "environment",
                },
                width: {
                  ideal: 1920,
                },
                height: {
                  ideal: 1080,
                },
              },
              audio: false,
            }
          );

        streamRef.current =
          stream;

        if (!videoRef.current) {
          throw new Error(
            "Camera element unavailable."
          );
        }

        videoRef.current.srcObject =
          stream;

        await videoRef.current.play();

        setCameraReady(true);
        setMessage("");
      } catch (error) {
        console.error(
          "Camera error:",
          error
        );

        setMessage(
          "Unable to access the camera. Please allow camera permission or use an existing image."
        );
      } finally {
        setLoading(false);
      }
    }, [stopCamera]);

  /*
   * --------------------------------------------------
   * Initial camera
   * --------------------------------------------------
   */

  useEffect(() => {
    startCamera();

    return () => {
      stopCamera();

      if (
        animationRef.current
      ) {
        cancelAnimationFrame(
          animationRef.current
        );
      }
    };
  }, [
    startCamera,
    stopCamera,
  ]);

  /*
   * --------------------------------------------------
   * Draw camera frame
   * --------------------------------------------------
   */

  const drawCameraFrame =
    useCallback(() => {
      const video =
        videoRef.current;

      const canvas =
        canvasRef.current;

      if (
        !video ||
        !canvas ||
        step !== "camera"
      ) {
        return;
      }

      if (
        video.readyState <
        2
      ) {
        animationRef.current =
          requestAnimationFrame(
            drawCameraFrame
          );

        return;
      }

      const width =
        video.videoWidth;

      const height =
        video.videoHeight;

      if (!width || !height) {
        animationRef.current =
          requestAnimationFrame(
            drawCameraFrame
          );

        return;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx =
        canvas.getContext("2d");

      if (!ctx) return;

      ctx.drawImage(
        video,
        0,
        0,
        width,
        height
      );

      animationRef.current =
        requestAnimationFrame(
          drawCameraFrame
        );
    }, [step]);

  useEffect(() => {
    if (step === "camera") {
      animationRef.current =
        requestAnimationFrame(
          drawCameraFrame
        );
    }

    return () => {
      if (
        animationRef.current
      ) {
        cancelAnimationFrame(
          animationRef.current
        );
      }
    };
  }, [
    step,
    drawCameraFrame,
  ]);

  /*
   * --------------------------------------------------
   * Capture image
   * --------------------------------------------------
   */

  const captureImage =
    useCallback(async () => {
      const video =
        videoRef.current;

      if (
        !video ||
        !cameraReady
      ) {
        return;
      }

      try {
        setLoading(true);
        setMessage(
          "Capturing document..."
        );

        const width =
          video.videoWidth;

        const height =
          video.videoHeight;

        const canvas =
          document.createElement(
            "canvas"
          );

        canvas.width = width;
        canvas.height = height;

        const ctx =
          canvas.getContext("2d");

        if (!ctx) {
          throw new Error(
            "Canvas unavailable."
          );
        }

        ctx.drawImage(
          video,
          0,
          0,
          width,
          height
        );

        const imageData =
          canvas.toDataURL(
            "image/jpeg",
            0.95
          );

        setCapturedImage(
          imageData
        );

        setProcessedImage(
          null
        );

        /*
         * Load captured image
         */

        const image =
          new Image();

        image.onload =
          async () => {
            imageRef.current =
              image;

            setImageSize({
              width:
                image.naturalWidth,
              height:
                image.naturalHeight,
            });

            try {
              const cv =
                await waitForOpenCV();

              const detected =
                detectDocumentCorners(
                  cv,
                  image
                );

              if (detected) {
                const ordered =
                  orderCorners(
                    detected
                  );

                setCorners(
                  ordered
                );

                setOriginalCorners(
                  ordered
                );

                setMessage(
                  "Document detected. Adjust the corners if needed."
                );
              } else {
                /*
                 * If detection fails,
                 * use safe image boundaries.
                 */

                const marginX =
                  image.naturalWidth *
                  0.04;

                const marginY =
                  image.naturalHeight *
                  0.04;

                const fallback: Point[] =
                  [
                    {
                      x: marginX,
                      y: marginY,
                    },
                    {
                      x:
                        image.naturalWidth -
                        marginX,
                      y: marginY,
                    },
                    {
                      x:
                        image.naturalWidth -
                        marginX,
                      y:
                        image.naturalHeight -
                        marginY,
                    },
                    {
                      x: marginX,
                      y:
                        image.naturalHeight -
                        marginY,
                    },
                  ];

                setCorners(
                  fallback
                );

                setOriginalCorners(
                  fallback
                );

                setMessage(
                  "Document edges could not be detected automatically. Please adjust the corners manually."
                );
              }

              setStep("crop");
            } catch (error) {
              console.error(
                "Detection error:",
                error
              );

              const marginX =
                image.naturalWidth *
                0.04;

              const marginY =
                image.naturalHeight *
                0.04;

              const fallback: Point[] =
                [
                  {
                    x: marginX,
                    y: marginY,
                  },
                  {
                    x:
                      image.naturalWidth -
                      marginX,
                    y: marginY,
                  },
                  {
                    x:
                      image.naturalWidth -
                      marginX,
                    y:
                      image.naturalHeight -
                      marginY,
                  },
                  {
                    x: marginX,
                    y:
                      image.naturalHeight -
                      marginY,
                  },
                ];

              setCorners(
                fallback
              );

              setOriginalCorners(
                fallback
              );

              setStep("crop");

              setMessage(
                "Automatic detection was unavailable. Please position the corners manually."
              );
            }

            setLoading(false);
          };

        image.onerror = () => {
          setLoading(false);
          setMessage(
            "Unable to load captured image."
          );
        };

        image.src =
          imageData;
      } catch (error) {
        console.error(
          "Capture error:",
          error
        );

        setLoading(false);
        setMessage(
          "Unable to capture image."
        );
      }
    }, [
      cameraReady,
      waitForOpenCV,
    ]);

  /*
   * --------------------------------------------------
   * Draw crop editor
   * --------------------------------------------------
   */

  const drawCropEditor =
    useCallback(() => {
      const canvas =
        canvasRef.current;

      const image =
        imageRef.current;

      if (
        !canvas ||
        !image ||
        !corners ||
        !imageSize.width ||
        !imageSize.height
      ) {
        return;
      }

      /*
       * The canvas backing resolution is
       * exactly the same as the image.
       *
       * This is the important part that
       * prevents alignment problems.
       */

      canvas.width =
        imageSize.width;

      canvas.height =
        imageSize.height;

      const ctx =
        canvas.getContext("2d");

      if (!ctx) return;

      ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      ctx.drawImage(
        image,
        0,
        0,
        imageSize.width,
        imageSize.height
      );

      /*
       * Darken everything outside
       * the selected document.
       */

      ctx.save();

      ctx.beginPath();

      ctx.moveTo(
        corners[0].x,
        corners[0].y
      );

      corners
        .slice(1)
        .forEach((point) => {
          ctx.lineTo(
            point.x,
            point.y
          );
        });

      ctx.closePath();

      ctx.fillStyle =
        "rgba(0,0,0,0.42)";

      /*
       * Draw dark overlay first,
       * then cut document area out.
       */

      ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      ctx.globalCompositeOperation =
        "destination-out";

      ctx.fill();

      ctx.restore();

      /*
       * Document border
       */

      ctx.save();

      ctx.beginPath();

      ctx.moveTo(
        corners[0].x,
        corners[0].y
      );

      corners
        .slice(1)
        .forEach((point) => {
          ctx.lineTo(
            point.x,
            point.y
          );
        });

      ctx.closePath();

      ctx.strokeStyle =
        "#ffffff";

      ctx.lineWidth =
        Math.max(
          4,
          imageSize.width / 500
        );

      ctx.stroke();

      /*
       * Handles
       */

      corners.forEach(
        (point, index) => {
          ctx.beginPath();

          ctx.arc(
            point.x,
            point.y,
            Math.max(
              HANDLE_RADIUS,
              imageSize.width / 60
            ),
            0,
            Math.PI * 2
          );

          ctx.fillStyle =
            "#0F4C81";

          ctx.fill();

          ctx.strokeStyle =
            "#ffffff";

          ctx.lineWidth = 4;

          ctx.stroke();

          /*
           * Small number inside handle
           */

          ctx.fillStyle =
            "#ffffff";

          ctx.font =
            "bold 18px sans-serif";

          ctx.textAlign =
            "center";

          ctx.textBaseline =
            "middle";

          ctx.fillText(
            String(index + 1),
            point.x,
            point.y
          );
        }
      );

      ctx.restore();
    }, [
      corners,
      imageSize,
    ]);

  useEffect(() => {
    if (step === "crop") {
      drawCropEditor();
    }
  }, [
    step,
    corners,
    drawCropEditor,
  ]);

  /*
   * --------------------------------------------------
   * Find closest corner
   * --------------------------------------------------
   */

  function getCanvasPoint(
    event:
      | React.PointerEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ): Point | null {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect =
      canvas.getBoundingClientRect();

    /*
     * Convert displayed coordinates
     * back into the ORIGINAL image
     * coordinates.
     */

    const scaleX =
      canvas.width /
      rect.width;

    const scaleY =
      canvas.height /
      rect.height;

    let clientX = 0;
    let clientY = 0;

    if (
      "touches" in event
    ) {
      const touch =
        event.touches[0] ||
        event.changedTouches[0];

      if (!touch) {
        return null;
      }

      clientX =
        touch.clientX;

      clientY =
        touch.clientY;
    } else {
      clientX =
        event.clientX;

      clientY =
        event.clientY;
    }

    return {
      x:
        (clientX -
          rect.left) *
        scaleX,

      y:
        (clientY -
          rect.top) *
        scaleY,
    };
  }

  function findClosestCorner(
    point: Point
  ) {
    if (!corners) {
      return null;
    }

    let closestIndex =
      -1;

    let closestDistance =
      Infinity;

    const threshold =
      Math.max(
        80,
        imageSize.width *
          0.08
      );

    corners.forEach(
      (corner, index) => {
        const currentDistance =
          distance(
            point,
            corner
          );

        if (
          currentDistance <
            closestDistance &&
          currentDistance <
            threshold
        ) {
          closestDistance =
            currentDistance;

          closestIndex =
            index;
        }
      }
    );

    return closestIndex >= 0
      ? closestIndex
      : null;
  }

  /*
   * --------------------------------------------------
   * Pointer interaction
   * --------------------------------------------------
   */

  function handlePointerDown(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    event.preventDefault();

    const point =
      getCanvasPoint(event);

    if (!point) return;

    const index =
      findClosestCorner(point);

    if (
      index === null
    ) {
      return;
    }

    setActiveCorner(index);

    canvasRef.current?.setPointerCapture(
      event.pointerId
    );
  }

  function handlePointerMove(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    if (
      activeCorner === null ||
      !corners
    ) {
      return;
    }

    event.preventDefault();

    const point =
      getCanvasPoint(event);

    if (!point) return;

    /*
     * Keep the point inside
     * the actual image.
     */

    const safePoint: Point = {
      x: Math.max(
        0,
        Math.min(
          imageSize.width,
          point.x
        )
      ),

      y: Math.max(
        0,
        Math.min(
          imageSize.height,
          point.y
        )
      ),
    };

    setCorners(
      corners.map(
        (corner, index) =>
          index === activeCorner
            ? safePoint
            : corner
      )
    );
  }

  function handlePointerUp(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    setActiveCorner(null);

    try {
      canvasRef.current?.releasePointerCapture(
        event.pointerId
      );
    } catch {
      // Ignore pointer capture errors.
    }
  }

  /*
   * --------------------------------------------------
   * Reset corners
   * --------------------------------------------------
   */

  function resetCorners() {
    if (!originalCorners) {
      return;
    }

    setCorners([
      ...originalCorners.map(
        (point) => ({
          ...point,
        })
      ),
    ]);

    setMessage(
      "Corners reset to automatic detection."
    );
  }

  /*
   * --------------------------------------------------
   * Apply perspective crop
   * --------------------------------------------------
   */

  async function applyCrop() {
    if (
      !capturedImage ||
      !corners
    ) {
      return;
    }

    try {
      setLoading(true);
      setMessage(
        "Straightening document..."
      );

      const cv =
        await waitForOpenCV();

      const image =
        imageRef.current;

      if (!image) {
        throw new Error(
          "Image unavailable."
        );
      }

      const croppedCanvas =
        warpToRect(
          cv,
          image,
          corners
        );

      const result =
        croppedCanvas.toDataURL(
          "image/jpeg",
          0.95
        );

      setProcessedImage(
        result
      );

      setStep("preview");

      setMessage(
        "Document ready. Review the result before saving."
      );
    } catch (error) {
      console.error(
        "Crop error:",
        error
      );

      setMessage(
        "Unable to crop the document. Please adjust the corners and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * --------------------------------------------------
   * Retake
   * --------------------------------------------------
   */

  async function retake() {
    setCapturedImage(null);
    setProcessedImage(null);
    setCorners(null);
    setOriginalCorners(null);
    setImageSize({
      width: 0,
      height: 0,
    });
    setMessage("");
    setStep("camera");

    /*
     * Small delay allows the camera
     * view to render again.
     */

    setTimeout(() => {
      startCamera();
    }, 100);
  }

  /*
   * --------------------------------------------------
   * Convert data URL to File
   * --------------------------------------------------
   */

  async function dataUrlToFile(
    dataUrl: string,
    fileName: string
  ): Promise<File> {
    const response =
      await fetch(dataUrl);

    const blob =
      await response.blob();

    return new File(
      [blob],
      fileName,
      {
        type: "image/jpeg",
      }
    );
  }

  /*
   * --------------------------------------------------
   * Finish / save document
   * --------------------------------------------------
   */

  async function finish() {
    if (!processedImage) {
      return;
    }

    try {
      setLoading(true);
      setMessage(
        "Compressing document..."
      );

      const file =
        await dataUrlToFile(
          processedImage,
          `${documentName
            .replace(
              /[^a-z0-9]+/gi,
              "_"
            )
            .toLowerCase()}_scanned.jpg`
        );

      const compressed =
        await compressImage(
          file,
          resolution
        );

      onComplete(
        file,
        compressed
      );

      stopCamera();
    } catch (error) {
      console.error(
        "Finish error:",
        error
      );

      setMessage(
        "Unable to save the document."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * --------------------------------------------------
   * Download compressed image
   * --------------------------------------------------
   */

  async function downloadCompressed() {
    if (!processedImage) {
      return;
    }

    try {
      setLoading(true);

      const file =
        await dataUrlToFile(
          processedImage,
          `${documentName
            .replace(
              /[^a-z0-9]+/gi,
              "_"
            )
            .toLowerCase()}_scanned.jpg`
        );

      const compressed =
        await compressImage(
          file,
          resolution
        );

      const url =
        URL.createObjectURL(
          compressed
        );

      const link =
        document.createElement("a");

      link.href = url;

      link.download =
        `${documentName
          .replace(
            /[^a-z0-9]+/gi,
            "_"
          )
          .toLowerCase()}_${resolution}.jpg`;

      document.body.appendChild(
        link
      );

      link.click();

      link.remove();

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(
        "Download error:",
        error
      );

      setMessage(
        "Unable to download compressed document."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * --------------------------------------------------
   * Close
   * --------------------------------------------------
   */

  function closeScanner() {
    stopCamera();
    onClose();
  }

  /*
   * --------------------------------------------------
   * UI
   * --------------------------------------------------
   */

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="flex h-full flex-col">
        {/* HEADER */}

        <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0F4C81] px-4 py-4 text-white">
          <div>
            <p className="text-xs opacity-75">
              Document Scanner
            </p>

            <h2 className="text-base font-semibold">
              {documentName}
            </h2>
          </div>

          <button
            type="button"
            onClick={
              closeScanner
            }
            className="rounded-full px-3 py-2 text-xl leading-none"
            aria-label="Close scanner"
          >
            ×
          </button>
        </header>

        {/* CAMERA */}

        {step === "camera" && (
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="hidden"
            />

            <canvas
              ref={canvasRef}
              className="block max-h-full max-w-full object-contain"
            />

            {/* Camera guide */}

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-[68%] w-[88%] max-w-xl rounded-xl border-2 border-white/90">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-4 py-2 text-xs text-white">
                  Place document inside the frame
                </div>

                {/* Corner guides */}

                <div className="absolute -left-[2px] -top-[2px] h-8 w-8 border-l-4 border-t-4 border-white" />

                <div className="absolute -right-[2px] -top-[2px] h-8 w-8 border-r-4 border-t-4 border-white" />

                <div className="absolute -bottom-[2px] -left-[2px] h-8 w-8 border-b-4 border-l-4 border-white" />

                <div className="absolute -bottom-[2px] -right-[2px] h-8 w-8 border-b-4 border-r-4 border-white" />
              </div>
            </div>

            {/* Camera message */}

            {message && (
              <div className="absolute left-4 right-4 top-4 rounded-lg bg-black/70 px-4 py-3 text-center text-sm text-white">
                {message}
              </div>
            )}
          </div>
        )}

        {/* CROP EDITOR */}

        {step === "crop" && (
          <div className="flex min-h-0 flex-1 flex-col bg-[#111]">
            <div className="shrink-0 px-4 py-3 text-center text-sm text-white">
              Drag the four blue handles to match the document edges.
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-2 pb-3">
              <canvas
                ref={canvasRef}
                onPointerDown={
                  handlePointerDown
                }
                onPointerMove={
                  handlePointerMove
                }
                onPointerUp={
                  handlePointerUp
                }
                onPointerCancel={
                  handlePointerUp
                }
                onPointerLeave={
                  () => {
                    if (
                      activeCorner !==
                      null
                    ) {
                      return;
                    }
                  }
                }
                style={{
                  width:
                    "100%",
                  maxWidth:
                    "100%",
                  height:
                    "auto",
                  maxHeight:
                    "100%",
                  touchAction:
                    "none",
                  cursor:
                    activeCorner !==
                    null
                      ? "grabbing"
                      : "default",
                }}
                className="block rounded-lg"
              />
            </div>

            {message && (
              <div className="shrink-0 px-4 pb-2 text-center text-xs text-white/75">
                {message}
              </div>
            )}
          </div>
        )}

        {/* PREVIEW */}

        {step === "preview" && (
          <div className="flex min-h-0 flex-1 flex-col bg-[#111]">
            <div className="shrink-0 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-white">
                Preview
              </p>

              <p className="mt-1 text-xs text-white/60">
                This is the final straightened document.
              </p>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
              {processedImage && (
                <img
                  src={processedImage}
                  alt="Processed document preview"
                  className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                />
              )}
            </div>

            {message && (
              <div className="shrink-0 px-4 pb-2 text-center text-xs text-white/70">
                {message}
              </div>
            )}
          </div>
        )}

        {/* CONTROLS */}

        <div className="shrink-0 border-t border-white/10 bg-white p-4">
          {step === "camera" && (
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={
                  captureImage
                }
                disabled={
                  !cameraReady ||
                  loading
                }
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#0F4C81] bg-white shadow-lg disabled:opacity-40"
                aria-label="Capture document"
              >
                <span className="h-12 w-12 rounded-full bg-[#0F4C81]" />
              </button>
            </div>
          )}

          {step === "crop" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={
                    resetCorners
                  }
                  disabled={loading}
                  className="rounded-lg border border-[#0F4C81] px-4 py-3 text-sm font-semibold text-[#0F4C81]"
                >
                  Reset Corners
                </button>

                <button
                  type="button"
                  onClick={
                    applyCrop
                  }
                  disabled={
                    loading ||
                    !corners
                  }
                  className="rounded-lg bg-[#0F4C81] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Apply Crop
                </button>
              </div>

              <button
                type="button"
                onClick={
                  retake
                }
                disabled={loading}
                className="w-full rounded-lg border px-4 py-3 text-sm font-medium"
              >
                Retake Photo
              </button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-semibold text-[#5D7186]">
                  Compression
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setResolution(
                        "high"
                      )
                    }
                    className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                      resolution ===
                      "high"
                        ? "border-[#0F4C81] bg-[#0F4C81] text-white"
                        : "bg-white text-[#152A3D]"
                    }`}
                  >
                    High
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setResolution(
                        "medium"
                      )
                    }
                    className={`rounded-lg border px-3 py-3 text-sm font-semibold ${
                      resolution ===
                      "medium"
                        ? "border-[#0F4C81] bg-[#0F4C81] text-white"
                        : "bg-white text-[#152A3D]"
                    }`}
                  >
                    Medium
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={
                    downloadCompressed
                  }
                  disabled={
                    loading
                  }
                  className="rounded-lg border border-[#0F4C81] px-4 py-3 text-sm font-semibold text-[#0F4C81]"
                >
                  Download
                </button>

                <button
                  type="button"
                  onClick={
                    finish
                  }
                  disabled={
                    loading
                  }
                  className="rounded-lg bg-[#0F4C81] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Use Document
                </button>
              </div>

              <button
                type="button"
                onClick={
                  retake
                }
                disabled={loading}
                className="w-full rounded-lg border px-4 py-3 text-sm font-medium"
              >
                Retake Photo
              </button>
            </div>
          )}

          {loading && (
            <p className="mt-3 text-center text-xs text-[#5D7186]">
              Processing document...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
