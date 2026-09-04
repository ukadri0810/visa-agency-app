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

export default function DocumentScanner({
  documentName,
  onComplete,
  onClose,
}: DocumentScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stream, setStream] =
    useState<MediaStream | null>(null);

  const [capturedImage, setCapturedImage] =
    useState<string | null>(null);

  const [processedImage, setProcessedImage] =
    useState<string | null>(null);

  const [corners, setCorners] =
    useState<Point[] | null>(null);

  const [processing, setProcessing] =
    useState(false);

  const [message, setMessage] =
    useState("Position the document inside the frame.");

  const [resolution, setResolution] =
    useState<ResolutionPreset>("medium");

  useEffect(() => {
    startCamera();

    return () => {
      stopCamera();
    };
  }, []);

  async function startCamera() {
    try {
      const mediaStream =
        await navigator.mediaDevices.getUserMedia({
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
        });

      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject =
          mediaStream;

        await videoRef.current.play();
      }
    } catch {
      setMessage(
        "Camera permission was denied. Please allow camera access."
      );
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
  }

  function capturePhoto() {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) return;

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const imageData =
      canvas.toDataURL("image/jpeg", 0.95);

    setCapturedImage(imageData);

    stopCamera();

    autoCrop(imageData);
  }

  async function autoCrop(
    imageData: string
  ) {
    setProcessing(true);
    setMessage("Detecting document edges...");

    try {
      const img =
        new Image();

      img.src = imageData;

      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
      });

      const cv =
        (window as any).cv;

      if (!cv) {
        throw new Error(
          "Scanner engine is not ready."
        );
      }

      const detected =
        detectDocumentCorners(
          cv,
          img
        );

      if (!detected) {
        setMessage(
          "Document edges could not be detected. You can use the original image."
        );

        setProcessedImage(imageData);

        setProcessing(false);

        return;
      }

      setCorners(detected);

      const croppedCanvas =
        warpToRect(
          cv,
          img,
          detected
        );

      const result =
        croppedCanvas.toDataURL(
          "image/jpeg",
          0.95
        );

      setProcessedImage(result);

      setMessage(
        "Document detected and automatically cropped."
      );
    } catch (error) {
      console.error(error);

      setProcessedImage(imageData);

      setMessage(
        "Automatic cropping failed. You can use the original image."
      );
    } finally {
      setProcessing(false);
    }
  }

  async function finish() {
    if (!processedImage) return;

    setProcessing(true);

    try {
      const response =
        await fetch(processedImage);

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
      console.error(error);
      setMessage(
        "Unable to process this document."
      );
    } finally {
      setProcessing(false);
    }
  }

  function downloadCompressed() {
    if (!processedImage) return;

    fetch(processedImage)
      .then((response) => response.blob())
      .then(async (blob) => {
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

        link.href = url;

        link.download =
          `${documentName.replace(
            /\s+/g,
            "_"
          )}_${resolution}.jpg`;

        link.click();

        URL.revokeObjectURL(url);
      });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="relative flex h-full w-full flex-col">
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

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[62vw] max-h-[420px] w-[88vw] max-w-[760px] rounded-xl border-2 border-white">
                  <div className="absolute -left-1 -top-1 h-8 w-8 border-l-4 border-t-4 border-blue-400" />
                  <div className="absolute -right-1 -top-1 h-8 w-8 border-r-4 border-t-4 border-blue-400" />
                  <div className="absolute -bottom-1 -left-1 h-8 w-8 border-b-4 border-l-4 border-blue-400" />
                  <div className="absolute -bottom-1 -right-1 h-8 w-8 border-b-4 border-r-4 border-blue-400" />
                </div>
              </div>

              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-center text-xs text-white">
                {message}
              </div>
            </div>

            <div className="bg-black px-6 py-6">
              <button
                type="button"
                onClick={capturePhoto}
                className="mx-auto block h-20 w-20 rounded-full border-8 border-white bg-gray-300"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col overflow-auto bg-[#F5F8FA]">
            <div className="px-5 py-4">
              <h3 className="text-lg font-semibold text-[#152A3D]">
                Preview
              </h3>

              <p className="text-sm text-[#5D7186]">
                The document has been automatically
                detected and straightened.
              </p>
            </div>

            <div className="mx-5 overflow-hidden rounded-xl border bg-white shadow-sm">
              {processedImage && (
                <img
                  src={processedImage}
                  alt="Processed document preview"
                  className="block max-h-[55vh] w-full object-contain"
                />
              )}
            </div>

            {processing && (
              <p className="px-5 py-4 text-center text-sm text-[#0F4C81]">
                Processing document...
              </p>
            )}

            {!processing && (
              <>
                <div className="px-5 py-4">
                  <p className="mb-2 text-sm font-medium text-[#152A3D]">
                    Download compression
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setResolution("high")
                      }
                      className={`rounded-lg border px-4 py-3 text-sm ${
                        resolution === "high"
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
                        setResolution("medium")
                      }
                      className={`rounded-lg border px-4 py-3 text-sm ${
                        resolution === "medium"
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

                <div className="mt-auto grid gap-3 border-t bg-white p-5 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCapturedImage(null);
                      setProcessedImage(null);
                      setCorners(null);
                      startCamera();
                    }}
                    className="rounded-lg border border-[#D7E1E8] px-4 py-3 text-sm font-medium"
                  >
                    Retake
                  </button>

                  <button
                    type="button"
                    onClick={downloadCompressed}
                    className="rounded-lg border border-[#0F4C81] px-4 py-3 text-sm font-medium text-[#0F4C81]"
                  >
                    Download Compressed
                  </button>

                  <button
                    type="button"
                    onClick={finish}
                    className="rounded-lg bg-[#0F4C81] px-4 py-3 text-sm font-semibold text-white"
                  >
                    Use Document
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
