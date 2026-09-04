"use client";

import {
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

type CornerIndex = 0 | 1 | 2 | 3;

const CORNER_NAMES = [
  "Top left",
  "Top right",
  "Bottom right",
  "Bottom left",
];

export default function DocumentScanner({
  documentName,
  onComplete,
  onClose,
}: DocumentScannerProps) {
  const videoRef =
    useRef<HTMLVideoElement>(null);

  const canvasRef =
    useRef<HTMLCanvasElement>(null);

  const imageRef =
    useRef<HTMLImageElement>(null);

  const previewContainerRef =
    useRef<HTMLDivElement>(null);

  const [stream, setStream] =
    useState<MediaStream | null>(null);

  const [capturedImage, setCapturedImage] =
    useState<string | null>(null);

  const [processedImage, setProcessedImage] =
    useState<string | null>(null);

  const [corners, setCorners] =
    useState<Point[] | null>(null);

  const [originalCorners, setOriginalCorners] =
    useState<Point[] | null>(null);

  const [processing, setProcessing] =
    useState(false);

  const [opencvReady, setOpencvReady] =
    useState(false);

  const [draggingCorner, setDraggingCorner] =
    useState<CornerIndex | null>(null);

  const [message, setMessage] =
    useState(
      "Loading scanner engine..."
    );

  const [resolution, setResolution] =
    useState<ResolutionPreset>(
      "medium"
    );

  /*
   * Start OpenCV loading check.
   */
  useEffect(() => {
    waitForOpenCV();

    return () => {
      stopCamera();
    };
  }, []);

  /*
   * Wait for OpenCV because the script
   * in layout.tsx is loaded asynchronously.
   */
  function waitForOpenCV() {
    let attempts = 0;

    const check = () => {
      const cv =
        (window as any).cv;

      if (cv) {
        setOpencvReady(true);

        setMessage(
          "Position the document inside the frame."
        );

        startCamera();

        return;
      }

      attempts++;

      /*
       * Try for approximately 20 seconds.
       */
      if (attempts < 100) {
        setTimeout(
          check,
          200
        );
      } else {
        setMessage(
          "Unable to load the document scanner engine. Please refresh the page."
        );
      }
    };

    check();
  }

  async function startCamera() {
    try {
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices
          .getUserMedia
      ) {
        setMessage(
          "Camera is not supported on this device."
        );

        return;
      }

      const mediaStream =
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

      setStream(
        mediaStream
      );

      const video =
        videoRef.current;

      if (video) {
        video.srcObject =
          mediaStream;

        await video.play();
      }
    } catch (error) {
      console.error(
        error
      );

      setMessage(
        "Camera permission was denied. Please allow camera access."
      );
    }
  }

  function stopCamera() {
    if (!stream) {
      return;
    }

    stream
      .getTracks()
      .forEach(
        (track) => {
          track.stop();
        }
      );

    setStream(null);
  }

  /*
   * Capture image from camera.
   */
  function capturePhoto() {
    if (!opencvReady) {
      setMessage(
        "Scanner engine is still loading..."
      );

      return;
    }

    const video =
      videoRef.current;

    if (
      !video ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      setMessage(
        "Camera is not ready yet."
      );

      return;
    }

    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.width =
      video.videoWidth;

    canvas.height =
      video.videoHeight;

    const context =
      canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const imageData =
      canvas.toDataURL(
        "image/jpeg",
        0.95
      );

    setCapturedImage(
      imageData
    );

    stopCamera();

    detectCorners(
      imageData
    );
  }

  /*
   * Detect document automatically.
   */
  async function detectCorners(
    imageData: string
  ) {
    setProcessing(true);

    setMessage(
      "Detecting document edges..."
    );

    try {
      const image =
        new Image();

      image.src =
        imageData;

      await new Promise<void>(
        (
          resolve,
          reject
        ) => {
          image.onload =
            () => resolve();

          image.onerror =
            () =>
              reject(
                new Error(
                  "Unable to load captured image."
                )
              );
        }
      );

      const cv =
        (window as any).cv;

      if (!cv) {
        throw new Error(
          "OpenCV is not available."
        );
      }

      const detected =
        detectDocumentCorners(
          cv,
          image
        );

      /*
       * Automatic detection failed.
       */
      if (!detected) {
        setCorners(null);

        setOriginalCorners(
          null
        );

        setProcessedImage(
          imageData
        );

        setMessage(
          "Document edges could not be detected. You can use the original image."
        );

        return;
      }

      /*
       * Store both the original
       * detection and editable corners.
       */
      setCorners(
        detected
      );

      setOriginalCorners(
        detected.map(
          (point) => ({
            ...point,
          })
        )
      );

      /*
       * Do NOT crop immediately.
       *
       * First show the user the
       * detected corners.
       */
      setProcessedImage(
        imageData
      );

      setMessage(
        "Check the four corners. Drag them if needed, then tap Apply Crop."
      );
    } catch (error) {
      console.error(
        error
      );

      setCorners(null);

      setOriginalCorners(
        null
      );

      setProcessedImage(
        imageData
      );

      setMessage(
        "Automatic detection failed. You can use the original image."
      );
    } finally {
      setProcessing(false);
    }
  }

  /*
   * Convert pointer position from
   * displayed image coordinates to
   * original image coordinates.
   */
  function getImageCoordinates(
    event:
      | React.PointerEvent
      | PointerEvent
  ): Point | null {
    const image =
      imageRef.current;

    if (!image) {
      return null;
    }

    const rect =
      image.getBoundingClientRect();

    if (
      rect.width === 0 ||
      rect.height === 0
    ) {
      return null;
    }

    const naturalWidth =
      image.naturalWidth;

    const naturalHeight =
      image.naturalHeight;

    if (
      !naturalWidth ||
      !naturalHeight
    ) {
      return null;
    }

    const x =
      ((event.clientX -
        rect.left) /
        rect.width) *
      naturalWidth;

    const y =
      ((event.clientY -
        rect.top) /
        rect.height) *
      naturalHeight;

    return {
      x: Math.max(
        0,
        Math.min(
          naturalWidth,
          x
        )
      ),
      y: Math.max(
        0,
        Math.min(
          naturalHeight,
          y
        )
      ),
    };
  }

  /*
   * Start dragging a corner.
   */
  function handleCornerPointerDown(
    index: CornerIndex,
    event: React.PointerEvent
  ) {
    event.preventDefault();
    event.stopPropagation();

    setDraggingCorner(
      index
    );

    const target =
      event.currentTarget as HTMLElement;

    target.setPointerCapture(
      event.pointerId
    );
  }

  /*
   * Move selected corner.
   */
  function handlePointerMove(
    event: React.PointerEvent
  ) {
    if (
      draggingCorner === null ||
      !corners
    ) {
      return;
    }

    const point =
      getImageCoordinates(
        event
      );

    if (!point) {
      return;
    }

    setCorners(
      (previous) => {
        if (!previous) {
          return null;
        }

        return previous.map(
          (
            corner,
            index
          ) =>
            index ===
            draggingCorner
              ? point
              : corner
        );
      }
    );
  }

  function handlePointerUp() {
    setDraggingCorner(
      null
    );
  }

  /*
   * Reset corners to OpenCV's
   * original detection.
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
      "Corners reset to automatic detection."
    );
  }

  /*
   * Apply crop using current corners.
   */
  async function applyCrop() {
    if (
      !capturedImage ||
      !corners
    ) {
      /*
       * No detected corners means
       * original image is already being used.
       */
      setProcessedImage(
        capturedImage
      );

      setMessage(
        "Using the original image."
      );

      return;
    }

    setProcessing(true);

    setMessage(
      "Cropping and straightening document..."
    );

    try {
      const image =
        new Image();

      image.src =
        capturedImage;

      await new Promise<void>(
        (
          resolve,
          reject
        ) => {
          image.onload =
            () => resolve();

          image.onerror =
            () =>
              reject(
                new Error(
                  "Unable to load image."
                )
              );
        }
      );

      const cv =
        (window as any).cv;

      if (!cv) {
        throw new Error(
          "OpenCV is unavailable."
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

      setMessage(
        "Document cropped and straightened successfully."
      );
    } catch (error) {
      console.error(
        error
      );

      setMessage(
        "Unable to crop the document."
      );
    } finally {
      setProcessing(false);
    }
  }

  /*
   * Use current processed image.
   */
  async function finish() {
    if (!processedImage) {
      return;
    }

    setProcessing(true);

    try {
      const response =
        await fetch(
          processedImage
        );

      const blob =
        await response.blob();

      const file =
        new File(
          [blob],
          `${documentName.replace(
            /\s+/g,
            "_"
          )}.jpg`,
          {
            type: "image/jpeg",
          }
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

      onClose();
    } catch (error) {
      console.error(
        error
      );

      setMessage(
        "Unable to process this document."
      );
    } finally {
      setProcessing(false);
    }
  }

  /*
   * Download compressed document.
   */
  async function downloadCompressed() {
    if (!processedImage) {
      return;
    }

    try {
      const response =
        await fetch(
          processedImage
        );

      const blob =
        await response.blob();

      const compressed =
        await compressImage(
          blob,
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

      link.href =
        url;

      link.download =
        `${documentName.replace(
          /\s+/g,
          "_"
        )}_${resolution}.jpg`;

      document.body.appendChild(
        link
      );

      link.click();

      link.remove();

      URL.revokeObjectURL(
        url
      );
    } catch (error) {
      console.error(
        error
      );

      setMessage(
        "Unable to download compressed document."
      );
    }
  }

  /*
   * Retake photograph.
   */
  function retake() {
    stopCamera();

    setCapturedImage(
      null
    );

    setProcessedImage(
      null
    );

    setCorners(
      null
    );

    setOriginalCorners(
      null
    );

    setDraggingCorner(
      null
    );

    setMessage(
      "Position the document inside the frame."
    );

    startCamera();
  }

  /*
   * If no automatic corners were
   * detected, allow the user to
   * continue with original image.
   */
  const hasDetectedCorners =
    !!corners;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="relative flex h-full w-full flex-col">

        {/* HEADER */}

        <div className="flex items-center justify-between bg-black px-4 py-4 text-white">
          <div>
            <p className="text-xs text-gray-400">
              DOCUMENT SCANNER
            </p>

            <h2 className="text-lg font-semibold">
              {documentName}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-full bg-white/10 px-4 py-2 text-sm"
          >
            Close
          </button>
        </div>

        {/* CAMERA */}

        {!capturedImage ? (
          <>
            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-contain"
              />

              {/* CAMERA FRAME */}

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[62vw] max-h-[420px] w-[88vw] max-w-[760px] rounded-xl border-2 border-white">

                  <div className="absolute -left-1 -top-1 h-8 w-8 border-l-4 border-t-4 border-blue-400" />

                  <div className="absolute -right-1 -top-1 h-8 w-8 border-r-4 border-t-4 border-blue-400" />

                  <div className="absolute -bottom-1 -left-1 h-8 w-8 border-b-4 border-l-4 border-blue-400" />

                  <div className="absolute -bottom-1 -right-1 h-8 w-8 border-b-4 border-r-4 border-blue-400" />

                </div>
              </div>

              {/* MESSAGE */}

              <div className="absolute bottom-5 left-1/2 max-w-[90%] -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-center text-xs text-white">
                {message}
              </div>
            </div>

            {/* CAPTURE BUTTON */}

            <div className="bg-black px-6 py-6">
              <button
                type="button"
                onClick={
                  capturePhoto
                }
                disabled={
                  !opencvReady
                }
                className="mx-auto block h-20 w-20 rounded-full border-8 border-white bg-gray-300 disabled:opacity-40"
                aria-label="Capture document"
              />
            </div>

            <canvas
              ref={canvasRef}
              className="hidden"
            />
          </>
        ) : (

          /* CAPTURED IMAGE */

          <div
            className="flex flex-1 flex-col overflow-auto bg-[#F5F8FA]"
            onPointerMove={
              handlePointerMove
            }
            onPointerUp={
              handlePointerUp
            }
            onPointerCancel={
              handlePointerUp
            }
          >

            {/* INSTRUCTION */}

            <div className="px-5 py-4">

              <h3 className="text-lg font-semibold text-[#152A3D]">
                Adjust Document
              </h3>

              <p className="text-sm text-[#5D7186]">
                {corners
                  ? "Drag the four blue corners so they match the document edges."
                  : message}
              </p>

            </div>

            {/* IMAGE + CORNERS */}

            <div
              ref={
                previewContainerRef
              }
              className="relative mx-5 overflow-hidden rounded-xl border bg-black shadow-sm touch-none"
            >

              <img
                ref={imageRef}
                src={
                  capturedImage
                }
                alt="Captured document"
                className="block max-h-[58vh] w-full object-contain"
                draggable={false}
              />

              {/* CORNER OVERLAY */}

              {corners &&
                imageRef.current && (
                  <>
                    {/* POLYGON */}

                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox={`0 0 ${imageRef.current.naturalWidth} ${imageRef.current.naturalHeight}`}
                      preserveAspectRatio="none"
                    >
                      <polygon
                        points={corners
                          .map(
                            (point) =>
                              `${point.x},${point.y}`
                          )
                          .join(
                            " "
                          )}
                        fill="rgba(15,76,129,0.15)"
                        stroke="white"
                        strokeWidth={
                          Math.max(
                            imageRef.current.naturalWidth /
                              400,
                            4
                          )
                        }
                        strokeDasharray="12 8"
                      />
                    </svg>

                    {/* DRAG HANDLES */}

                    {corners.map(
                      (
                        point,
                        index
                      ) => {
                        const left =
                          `${
                            (point.x /
                              imageRef.current!.naturalWidth) *
                            100
                          }%`;

                        const top =
                          `${
                            (point.y /
                              imageRef.current!.naturalHeight) *
                            100
                          }%`;

                        return (
                          <button
                            key={
                              index
                            }
                            type="button"
                            aria-label={
                              CORNER_NAMES[
                                index
                              ]
                            }
                            onPointerDown={(
                              event
                            ) =>
                              handleCornerPointerDown(
                                index as CornerIndex,
                                event
                              )
                            }
                            className={`absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-[#0F4C81] shadow-lg ${
                              draggingCorner ===
                              index
                                ? "scale-125"
                                : ""
                            }`}
                            style={{
                              left,
                              top,
                              touchAction:
                                "none",
                            }}
                          />
                        );
                      }
                    )}
                  </>
                )}

            </div>

            {/* STATUS */}

            <div className="px-5 py-3">

              <div className="rounded-lg border bg-white px-4 py-3">

                <p className="text-sm font-medium text-[#152A3D]">
                  {message}
                </p>

                {corners && (
                  <p className="mt-1 text-xs text-[#5D7186]">
                    Four corners detected automatically.
                    Adjust them if necessary.
                  </p>
                )}

              </div>

            </div>

            {/* CONTROLS */}

            {!processing && (
              <>

                {/* CORNER CONTROLS */}

                {corners && (
                  <div className="px-5 pb-3">

                    <div className="grid grid-cols-2 gap-3">

                      <button
                        type="button"
                        onClick={
                          resetCorners
                        }
                        className="rounded-lg border border-[#D7E1E8] bg-white px-4 py-3 text-sm font-medium"
                      >
                        Reset Corners
                      </button>

                      <button
                        type="button"
                        onClick={
                          applyCrop
                        }
                        className="rounded-lg bg-[#0F4C81] px-4 py-3 text-sm font-semibold text-white"
                      >
                        Apply Crop
                      </button>

                    </div>

                  </div>
                )}

                {/* COMPRESSION */}

                <div className="px-5 py-3">

                  <p className="mb-2 text-sm font-medium text-[#152A3D]">
                    Compression
                  </p>

                  <div className="grid grid-cols-2 gap-3">

                    <button
                      type="button"
                      onClick={() =>
                        setResolution(
                          "high"
                        )
                      }
                      className={`rounded-lg border px-4 py-3 text-sm ${
                        resolution ===
                        "high"
                          ? "border-[#0F4C81] bg-[#0F4C81] text-white"
                          : "border-[#D7E1E8] bg-white"
                      }`}
                    >
                      <strong className="block">
                        High
                      </strong>

                      <span className="text-xs opacity-80">
                        Better quality
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setResolution(
                          "medium"
                        )
                      }
                      className={`rounded-lg border px-4 py-3 text-sm ${
                        resolution ===
                        "medium"
                          ? "border-[#0F4C81] bg-[#0F4C81] text-white"
                          : "border-[#D7E1E8] bg-white"
                      }`}
                    >
                      <strong className="block">
                        Medium
                      </strong>

                      <span className="text-xs opacity-80">
                        Smaller file
                      </span>
                    </button>

                  </div>

                </div>

                {/* ACTIONS */}

                <div className="mt-auto grid gap-3 border-t bg-white p-5 sm:grid-cols-3">

                  <button
                    type="button"
                    onClick={
                      retake
                    }
                    className="rounded-lg border border-[#D7E1E8] px-4 py-3 text-sm font-medium"
                  >
                    Retake
                  </button>

                  <button
                    type="button"
                    onClick={
                      downloadCompressed
                    }
                    disabled={
                      !processedImage
                    }
                    className="rounded-lg border border-[#0F4C81] px-4 py-3 text-sm font-medium text-[#0F4C81] disabled:opacity-40"
                  >
                    Download Compressed
                  </button>

                  <button
                    type="button"
                    onClick={
                      finish
                    }
                    disabled={
                      !processedImage ||
                      !!corners
                    }
                    className="rounded-lg bg-[#0F4C81] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Use Document
                  </button>

                </div>

              </>
            )}

            {/* PROCESSING */}

            {processing && (
              <div className="border-t bg-white px-5 py-6 text-center">

                <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-[#0F4C81] border-t-transparent" />

                <p className="text-sm font-medium text-[#0F4C81]">
                  Processing document...
                </p>

              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
