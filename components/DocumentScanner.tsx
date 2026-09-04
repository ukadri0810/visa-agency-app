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

type Step =
  | "camera"
  | "crop"
  | "preview";

const FALLBACK_MARGIN = 0.04;

function orderCorners(
  points: Point[]
): Point[] {
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

function createFallbackCorners(
  width: number,
  height: number
): Point[] {
  const marginX =
    width * FALLBACK_MARGIN;

  const marginY =
    height * FALLBACK_MARGIN;

  return [
    {
      x: marginX,
      y: marginY,
    },
    {
      x: width - marginX,
      y: marginY,
    },
    {
      x: width - marginX,
      y: height - marginY,
    },
    {
      x: marginX,
      y: height - marginY,
    },
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

  const animationRef =
    useRef<number | null>(null);

  const imageRef =
    useRef<HTMLImageElement | null>(null);

  const [step, setStep] =
    useState<Step>("camera");

  const [corners, setCorners] =
    useState<Point[] | null>(null);

  const [
    originalCorners,
    setOriginalCorners,
  ] =
    useState<Point[] | null>(null);

  const [imageSize, setImageSize] =
    useState({
      width: 0,
      height: 0,
    });

  const [capturedImage, setCapturedImage] =
    useState<string | null>(null);

  const [processedImage, setProcessedImage] =
    useState<string | null>(null);

  const [activeCorner, setActiveCorner] =
    useState<number | null>(null);

  const [cameraReady, setCameraReady] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [resolution, setResolution] =
    useState<ResolutionPreset>("medium");

  /*
   * ------------------------------------------------
   * STOP CAMERA
   * ------------------------------------------------
   */

  const stopCamera =
    useCallback(() => {
      if (
        animationRef.current !==
        null
      ) {
        cancelAnimationFrame(
          animationRef.current
        );

        animationRef.current =
          null;
      }

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
   * ------------------------------------------------
   * WAIT FOR OPENCV
   * ------------------------------------------------
   */

  const waitForOpenCV =
    useCallback(async () => {
      for (
        let i = 0;
        i < 100;
        i++
      ) {
        if (
          typeof window !==
            "undefined" &&
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
        "OpenCV failed to load."
      );
    }, []);

  /*
   * ------------------------------------------------
   * START CAMERA
   * ------------------------------------------------
   */

  const startCamera =
    useCallback(async () => {
      try {
        stopCamera();

        setLoading(true);
        setMessage(
          "Starting camera..."
        );

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

        const video =
          videoRef.current;

        if (!video) {
          throw new Error(
            "Video element unavailable."
          );
        }

        video.srcObject =
          stream;

        await video.play();

        setCameraReady(true);
        setMessage("");
      } catch (error) {
        console.error(error);

        setMessage(
          "Camera access failed. Please allow camera permission."
        );
      } finally {
        setLoading(false);
      }
    }, [stopCamera]);

  /*
   * ------------------------------------------------
   * START CAMERA ON OPEN
   * ------------------------------------------------
   */

  useEffect(() => {
    if (step === "camera") {
      startCamera();
    }

    return () => {
      stopCamera();
    };
  }, [
    step,
    startCamera,
    stopCamera,
  ]);

  /*
   * ------------------------------------------------
   * CAPTURE
   *
   * IMPORTANT:
   * We capture directly from VIDEO.
   * We do NOT continuously draw the
   * camera into the same canvas.
   * ------------------------------------------------
   */

  async function captureImage() {
    const video =
      videoRef.current;

    if (
      !video ||
      !cameraReady ||
      loading
    ) {
      return;
    }

    try {
      setLoading(true);

      setMessage(
        "Capturing document..."
      );

      /*
       * Freeze camera processing first.
       */

      stopCamera();

      const width =
        video.videoWidth;

      const height =
        video.videoHeight;

      if (!width || !height) {
        throw new Error(
          "Camera image is not ready."
        );
      }

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

      /*
       * Draw ONE frame.
       */

      ctx.drawImage(
        video,
        0,
        0,
        width,
        height
      );

      const dataUrl =
        canvas.toDataURL(
          "image/jpeg",
          0.95
        );

      setCapturedImage(
        dataUrl
      );

      /*
       * Load captured image.
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

          setMessage(
            "Detecting document edges..."
          );

          let detectedCorners:
            Point[] | null =
            null;

          try {
            const cv =
              await waitForOpenCV();

            detectedCorners =
              detectDocumentCorners(
                cv,
                image
              );
          } catch (error) {
            console.error(
              "OpenCV error:",
              error
            );
          }

          const finalCorners =
            detectedCorners
              ? orderCorners(
                  detectedCorners
                )
              : createFallbackCorners(
                  image.naturalWidth,
                  image.naturalHeight
                );

          setCorners(
            finalCorners
          );

          setOriginalCorners(
            finalCorners
          );

          setStep("crop");

          if (detectedCorners) {
            setMessage(
              "Document detected. Adjust the four corners if needed."
            );
          } else {
            setMessage(
              "Automatic detection was not available. Adjust the four corners manually."
            );
          }

          setLoading(false);
        };

      image.onerror = () => {
        setLoading(false);

        setMessage(
          "Unable to load the captured image."
        );
      };

      image.src = dataUrl;
    } catch (error) {
      console.error(
        "Capture error:",
        error
      );

      setLoading(false);

      setMessage(
        "Unable to capture the document."
      );

      /*
       * Restart camera if capture failed.
       */

      await startCamera();
    }
  }

  /*
   * ------------------------------------------------
   * DRAW CROP EDITOR
   * ------------------------------------------------
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

      canvas.width =
        imageSize.width;

      canvas.height =
        imageSize.height;

      const ctx =
        canvas.getContext("2d");

      if (!ctx) return;

      /*
       * Draw original image.
       */

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
        canvas.width,
        canvas.height
      );

      /*
       * Dark overlay.
       */

      ctx.save();

      ctx.fillStyle =
        "rgba(0,0,0,0.48)";

      ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      /*
       * Cut the document area
       * out of the dark overlay.
       */

      ctx.globalCompositeOperation =
        "destination-out";

      ctx.beginPath();

      ctx.moveTo(
        corners[0].x,
        corners[0].y
      );

      ctx.lineTo(
        corners[1].x,
        corners[1].y
      );

      ctx.lineTo(
        corners[2].x,
        corners[2].y
      );

      ctx.lineTo(
        corners[3].x,
        corners[3].y
      );

      ctx.closePath();

      ctx.fill();

      ctx.restore();

      /*
       * White document border.
       */

      ctx.save();

      ctx.beginPath();

      ctx.moveTo(
        corners[0].x,
        corners[0].y
      );

      ctx.lineTo(
        corners[1].x,
        corners[1].y
      );

      ctx.lineTo(
        corners[2].x,
        corners[2].y
      );

      ctx.lineTo(
        corners[3].x,
        corners[3].y
      );

      ctx.closePath();

      ctx.strokeStyle =
        "#ffffff";

      ctx.lineWidth =
        Math.max(
          5,
          imageSize.width / 400
        );

      ctx.stroke();

      /*
       * Draw lines from each corner.
       */

      ctx.fillStyle =
        "#0F4C81";

      ctx.strokeStyle =
        "#ffffff";

      corners.forEach(
        (point, index) => {
          const radius =
            Math.max(
              24,
              imageSize.width / 45
            );

          ctx.beginPath();

          ctx.arc(
            point.x,
            point.y,
            radius,
            0,
            Math.PI * 2
          );

          ctx.fill();

          ctx.lineWidth = 5;

          ctx.stroke();

          /*
           * Corner number.
           */

          ctx.fillStyle =
            "#ffffff";

          ctx.font =
            "bold 20px sans-serif";

          ctx.textAlign =
            "center";

          ctx.textBaseline =
            "middle";

          ctx.fillText(
            String(index + 1),
            point.x,
            point.y
          );

          ctx.fillStyle =
            "#0F4C81";
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
   * ------------------------------------------------
   * GET IMAGE COORDINATE FROM TOUCH
   * ------------------------------------------------
   */

  function getCanvasPoint(
    event:
      React.PointerEvent<HTMLCanvasElement>
  ): Point | null {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect =
      canvas.getBoundingClientRect();

    if (
      rect.width === 0 ||
      rect.height === 0
    ) {
      return null;
    }

    const scaleX =
      canvas.width /
      rect.width;

    const scaleY =
      canvas.height /
      rect.height;

    return {
      x:
        (event.clientX -
          rect.left) *
        scaleX,

      y:
        (event.clientY -
          rect.top) *
        scaleY,
    };
  }

  /*
   * ------------------------------------------------
   * FIND CORNER
   * ------------------------------------------------
   */

  function findCorner(
    point: Point
  ): number | null {
    if (!corners) {
      return null;
    }

    let closest =
      -1;

    let minDistance =
      Infinity;

    /*
     * Large touch target.
     */

    const threshold =
      Math.max(
        100,
        imageSize.width * 0.12
      );

    corners.forEach(
      (corner, index) => {
        const distance =
          Math.hypot(
            point.x -
              corner.x,
            point.y -
              corner.y
          );

        if (
          distance <
            minDistance &&
          distance <
            threshold
        ) {
          minDistance =
            distance;

          closest =
            index;
        }
      }
    );

    return closest === -1
      ? null
      : closest;
  }

  /*
   * ------------------------------------------------
   * POINTER DOWN
   * ------------------------------------------------
   */

  function handlePointerDown(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    event.preventDefault();

    const point =
      getCanvasPoint(event);

    if (!point) return;

    const index =
      findCorner(point);

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

  /*
   * ------------------------------------------------
   * POINTER MOVE
   * ------------------------------------------------
   */

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

  /*
   * ------------------------------------------------
   * POINTER UP
   * ------------------------------------------------
   */

  function handlePointerUp(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    setActiveCorner(null);

    try {
      canvasRef.current?.releasePointerCapture(
        event.pointerId
      );
    } catch {
      // Ignore.
    }
  }

  /*
   * ------------------------------------------------
   * RESET
   * ------------------------------------------------
   */

  function resetCorners() {
    if (!originalCorners) {
      return;
    }

    setCorners(
      originalCorners.map(
        (point) => ({
          ...point,
        })
      )
    );

    setMessage(
      "Corners reset."
    );
  }

  /*
   * ------------------------------------------------
   * APPLY CROP
   * ------------------------------------------------
   */

  async function applyCrop() {
    if (
      !capturedImage ||
      !corners ||
      !imageRef.current
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

      const croppedCanvas =
        warpToRect(
          cv,
          imageRef.current,
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
        "Document straightened successfully."
      );
    } catch (error) {
      console.error(
        "Crop error:",
        error
      );

      setMessage(
        "Could not straighten the document. Please adjust the corners and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * ------------------------------------------------
   * RETAKE
   * ------------------------------------------------
   */

  async function retake() {
    stopCamera();

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
  }

  /*
   * ------------------------------------------------
   * DATA URL TO FILE
   * ------------------------------------------------
   */

  async function dataUrlToFile(
    dataUrl: string
  ) {
    const response =
      await fetch(dataUrl);

    const blob =
      await response.blob();

    return new File(
      [blob],
      `${documentName
        .replace(
          /[^a-z0-9]+/gi,
          "_"
        )
        .toLowerCase()}_scanned.jpg`,
      {
        type: "image/jpeg",
      }
    );
  }

  /*
   * ------------------------------------------------
   * FINISH
   * ------------------------------------------------
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
          processedImage
        );

      const compressed =
        await compressImage(
          file,
          resolution
        );

      stopCamera();

      onComplete(
        file,
        compressed
      );
    } catch (error) {
      console.error(
        "Finish error:",
        error
      );

      setMessage(
        "Unable to save document."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * ------------------------------------------------
   * DOWNLOAD
   * ------------------------------------------------
   */

  async function downloadCompressed() {
    if (!processedImage) {
      return;
    }

    try {
      setLoading(true);

      const file =
        await dataUrlToFile(
          processedImage
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
        document.createElement(
          "a"
        );

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
        error
      );

      setMessage(
        "Unable to download image."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * ------------------------------------------------
   * CLOSE
   * ------------------------------------------------
   */

  function closeScanner() {
    stopCamera();
    onClose();
  }

  /*
   * ------------------------------------------------
   * UI
   * ------------------------------------------------
   */

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="flex h-full flex-col">
        {/* HEADER */}

        <header className="flex shrink-0 items-center justify-between bg-[#0F4C81] px-4 py-4 text-white">
          <div>
            <p className="text-xs opacity-70">
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
            className="rounded-full px-3 py-1 text-2xl"
            aria-label="Close"
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
              className="h-full w-full object-cover"
            />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-[68%] w-[88%] max-w-2xl rounded-xl border-2 border-white">
                <div className="absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-4 py-2 text-xs text-white">
                  Fit the document inside the frame
                </div>

                <div className="absolute -left-1 -top-1 h-9 w-9 border-l-4 border-t-4 border-white" />

                <div className="absolute -right-1 -top-1 h-9 w-9 border-r-4 border-t-4 border-white" />

                <div className="absolute -bottom-1 -left-1 h-9 w-9 border-b-4 border-l-4 border-white" />

                <div className="absolute -bottom-1 -right-1 h-9 w-9 border-b-4 border-r-4 border-white" />
              </div>
            </div>

            {message && (
              <div className="absolute left-4 right-4 top-4 rounded-lg bg-black/70 px-4 py-3 text-center text-sm text-white">
                {message}
              </div>
            )}
          </div>
        )}

        {/* CROP */}

        {step === "crop" && (
          <div className="flex min-h-0 flex-1 flex-col bg-[#111]">
            <div className="shrink-0 px-4 py-3 text-center text-sm text-white">
              Drag the blue circles to the four corners of your document.
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2">
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
                className="block max-h-full max-w-full rounded-lg"
                style={{
                  width:
                    "100%",
                  height:
                    "auto",
                  touchAction:
                    "none",
                }}
              />
            </div>

            <div className="shrink-0 bg-white p-4">
              {message && (
                <p className="mb-3 text-center text-xs text-[#5D7186]">
                  {message}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={
                    resetCorners
                  }
                  disabled={loading}
                  className="rounded-lg border border-[#0F4C81] px-4 py-3 text-sm font-semibold text-[#0F4C81]"
                >
                  Reset
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
                className="mt-3 w-full rounded-lg border px-4 py-3 text-sm"
              >
                Retake Photo
              </button>
            </div>
          </div>
        )}

        {/* PREVIEW */}

        {step === "preview" && (
          <div className="flex min-h-0 flex-1 flex-col bg-[#111]">
            <div className="shrink-0 px-4 py-3 text-center text-white">
              <p className="text-sm font-semibold">
                Final Preview
              </p>

              <p className="mt-1 text-xs opacity-60">
                Check the document before saving.
              </p>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
              {processedImage && (
                <img
                  src={processedImage}
                  alt="Scanned document"
                  className="max-h-full max-w-full rounded-lg object-contain"
                />
              )}
            </div>

            <div className="shrink-0 bg-white p-4">
              {message && (
                <p className="mb-3 text-center text-xs text-[#5D7186]">
                  {message}
                </p>
              )}

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
                      : ""
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
                      : ""
                  }`}
                >
                  Medium
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={
                    downloadCompressed
                  }
                  disabled={loading}
                  className="rounded-lg border border-[#0F4C81] px-4 py-3 text-sm font-semibold text-[#0F4C81]"
                >
                  Download
                </button>

                <button
                  type="button"
                  onClick={
                    finish
                  }
                  disabled={loading}
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
                className="mt-3 w-full rounded-lg border px-4 py-3 text-sm"
              >
                Retake Photo
              </button>
            </div>
          </div>
        )}

        {/* CAPTURE BUTTON */}

        {step === "camera" && (
          <div className="shrink-0 bg-black px-4 py-5">
            <div className="flex justify-center">
              <button
                type="button"
                onClick={
                  captureImage
                }
                disabled={
                  !cameraReady ||
                  loading
                }
                className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-transparent disabled:opacity-40"
                aria-label="Take photo"
              >
                <span className="h-14 w-14 rounded-full bg-white" />
              </button>
            </div>

            {loading && (
              <p className="mt-3 text-center text-xs text-white/70">
                {message}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
