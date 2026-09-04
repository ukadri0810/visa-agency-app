"use client";

import {
  useRef,
  useState,
} from "react";

import DocumentScanner from "@/components/DocumentScanner";

import {
  ResolutionPreset,
  compressImage,
} from "@/lib/imageCompression";

type DocumentKey =
  | "passportFront"
  | "passportBack"
  | "panCard";

interface DocumentSlot {
  file: File | null;
  compressed: Blob | null;
  previewUrl: string | null;
  compressedSize: number;
}

const DOCUMENTS: {
  key: DocumentKey;
  label: string;
}[] = [
  {
    key: "passportFront",
    label: "Passport — Front",
  },
  {
    key: "passportBack",
    label: "Passport — Back",
  },
  {
    key: "panCard",
    label: "PAN Card",
  },
];

const EMPTY: DocumentSlot = {
  file: null,
  compressed: null,
  previewUrl: null,
  compressedSize: 0,
};

export default function Home() {
  const [customerName, setCustomerName] =
    useState("");

  const [documents, setDocuments] =
    useState<Record<DocumentKey, DocumentSlot>>({
      passportFront: { ...EMPTY },
      passportBack: { ...EMPTY },
      panCard: { ...EMPTY },
    });

  const [scanner, setScanner] =
    useState<DocumentKey | null>(null);

  const [resolution, setResolution] =
    useState<ResolutionPreset>("medium");

  const [status, setStatus] =
    useState("");

  const inputRefs =
    useRef<Record<
      DocumentKey,
      HTMLInputElement | null
    >>({
      passportFront: null,
      passportBack: null,
      panCard: null,
    });

  function updateDocument(
    key: DocumentKey,
    file: File,
    compressed: Blob
  ) {
    setDocuments((previous) => {
      if (previous[key].previewUrl) {
        URL.revokeObjectURL(
          previous[key].previewUrl!
        );
      }

      return {
        ...previous,
        [key]: {
          file,
          compressed,
          previewUrl:
            URL.createObjectURL(file),
          compressedSize:
            compressed.size,
        },
      };
    });

    setStatus("");
  }

  async function handleFile(
    key: DocumentKey,
    file: File
  ) {
    if (!file.type.startsWith("image/")) {
      setStatus(
        "Please select an image file."
      );
      return;
    }

    setStatus("Compressing image...");

    try {
      const compressed =
        await compressImage(
          file,
          resolution
        );

      updateDocument(
        key,
        file,
        compressed
      );

      setStatus(
        "Document uploaded successfully."
      );
    } catch {
      setStatus(
        "Unable to process this image."
      );
    }
  }

  async function changeCompression(
    preset: ResolutionPreset
  ) {
    setResolution(preset);

    const updated = {
      ...documents,
    };

    for (const item of DOCUMENTS) {
      const slot = updated[item.key];

      if (!slot.file) continue;

      const compressed =
        await compressImage(
          slot.file,
          preset
        );

      updated[item.key] = {
        ...slot,
        compressed,
        compressedSize:
          compressed.size,
      };
    }

    setDocuments(updated);
  }

  function downloadCompressed(
    key: DocumentKey
  ) {
    const compressed =
      documents[key].compressed;

    if (!compressed) return;

    const url =
      URL.createObjectURL(
        compressed
      );

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      `${key}_${resolution}.jpg`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
  }

  function removeDocument(
    key: DocumentKey
  ) {
    const slot = documents[key];

    if (slot.previewUrl) {
      URL.revokeObjectURL(
        slot.previewUrl
      );
    }

    setDocuments({
      ...documents,
      [key]: { ...EMPTY },
    });

    const input =
      inputRefs.current[key];

    if (input) {
      input.value = "";
    }
  }

  function fileSize(bytes: number) {
    if (!bytes) return "0 KB";

    return `${(
      bytes / 1024
    ).toFixed(0)} KB`;
  }

  const allUploaded =
    DOCUMENTS.every(
      (item) =>
        documents[item.key].file
    );

  return (
    <main className="min-h-screen bg-[#F5F8FA]">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-5 py-6">
          <p className="text-sm text-[#5D7186]">
            Document Preparation
          </p>

          <h1 className="text-2xl font-semibold text-[#0F4C81]">
            Visa Application Documents
          </h1>

          <p className="mt-2 text-sm text-[#5D7186]">
            Capture documents using your mobile
            camera. The document edges are
            automatically detected, cropped and
            straightened before uploading.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-8">
        <section className="rounded-xl border bg-white">
          <div className="border-b px-5 py-4">
            <span className="text-sm font-semibold text-[#0F4C81]">
              1
            </span>

            <h2 className="mt-1 text-lg font-semibold">
              Customer information
            </h2>
          </div>

          <div className="p-5">
            <label className="mb-2 block text-sm text-[#5D7186]">
              Customer name
            </label>

            <input
              value={customerName}
              onChange={(event) =>
                setCustomerName(
                  event.target.value
                )
              }
              placeholder="Enter customer name"
              className="w-full rounded-lg border bg-[#F5F8FA] px-4 py-3 outline-none focus:border-[#0F4C81]"
            />
          </div>
        </section>

        <section className="mt-6 rounded-xl border bg-white">
          <div className="border-b px-5 py-4">
            <span className="text-sm font-semibold text-[#0F4C81]">
              2
            </span>

            <h2 className="mt-1 text-lg font-semibold">
              Capture documents
            </h2>

            <p className="mt-1 text-sm text-[#5D7186]">
              Use the camera for automatic document
              scanning or select an existing image.
            </p>
          </div>

          <div className="grid gap-5 p-5 md:grid-cols-3">
            {DOCUMENTS.map(
              (document) => {
                const slot =
                  documents[
                    document.key
                  ];

                return (
                  <div
                    key={document.key}
                    className="overflow-hidden rounded-xl border"
                  >
                    <div className="border-b bg-[#F5F8FA] px-4 py-3">
                      <p className="text-sm font-semibold">
                        {document.label}
                      </p>
                    </div>

                    <div className="flex aspect-[4/3] items-center justify-center bg-[#FBFCFD]">
                      {slot.previewUrl ? (
                        <img
                          src={
                            slot.previewUrl
                          }
                          alt={
                            document.label
                          }
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="px-5 text-center">
                          <p className="text-sm text-[#5D7186]">
                            No document captured
                          </p>
                        </div>
                      )}
                    </div>

                    {slot.file && (
                      <div className="border-t bg-white px-4 py-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#5D7186]">
                            Original
                          </span>

                          <span>
                            {fileSize(
                              slot.file.size
                            )}
                          </span>
                        </div>

                        <div className="mt-1 flex items-center justify-between text-xs">
                          <span className="text-[#5D7186]">
                            Compressed
                          </span>

                          <span className="font-semibold text-[#0F4C81]">
                            {fileSize(
                              slot.compressedSize
                            )}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 border-t">
                      <button
                        type="button"
                        onClick={() =>
                          setScanner(
                            document.key
                          )
                        }
                        className="border-r px-3 py-3 text-sm font-semibold text-[#0F4C81]"
                      >
                        📷 Scan
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          inputRefs.current[
                            document.key
                          ]?.click()
                        }
                        className="px-3 py-3 text-sm font-medium"
                      >
                        {slot.file
                          ? "Replace"
                          : "Choose file"}
                      </button>
                    </div>

                    {slot.file && (
                      <div className="grid grid-cols-2 border-t">
                        <button
                          type="button"
                          onClick={() =>
                            downloadCompressed(
                              document.key
                            )
                          }
                          className="border-r px-3 py-3 text-xs font-semibold text-[#0F4C81]"
                        >
                          Download
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            removeDocument(
                              document.key
                            )
                          }
                          className="px-3 py-3 text-xs text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    )}

                    <input
                      ref={(element) => {
                        inputRefs.current[
                          document.key
                        ] = element;
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file =
                          event.target.files?.[0];

                        if (file) {
                          handleFile(
                            document.key,
                            file
                          );
                        }
                      }}
                    />
                  </div>
                );
              }
            )}
          </div>
        </section>

        <section className="mt-6 rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">
            Compression
          </h2>

          <p className="mt-1 text-sm text-[#5D7186]">
            Choose the quality you want for the
            compressed documents.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() =>
                changeCompression("high")
              }
              className={`rounded-lg border p-4 text-left ${
                resolution === "high"
                  ? "border-[#0F4C81] bg-[#0F4C81] text-white"
                  : ""
              }`}
            >
              <strong className="block">
                High Resolution
              </strong>

              <span className="text-xs opacity-80">
                Better quality, larger file
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                changeCompression("medium")
              }
              className={`rounded-lg border p-4 text-left ${
                resolution === "medium"
                  ? "border-[#0F4C81] bg-[#0F4C81] text-white"
                  : ""
              }`}
            >
              <strong className="block">
                Medium Resolution
              </strong>

              <span className="text-xs opacity-80">
                Smaller file, easier upload
              </span>
            </button>
          </div>
        </section>

        {status && (
          <div className="mt-4 rounded-lg border bg-white px-4 py-3 text-sm text-[#5D7186]">
            {status}
          </div>
        )}

        <section className="mt-6 rounded-xl border bg-white p-5">
          <button
            type="button"
            disabled={
              !customerName.trim() ||
              !allUploaded
            }
            className="w-full rounded-lg bg-[#0F4C81] px-5 py-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Generate Visa Documents PDF
          </button>

          <p className="mt-3 text-center text-xs text-[#5D7186]">
            All documents are processed inside
            your browser.
          </p>
        </section>
      </div>

      {scanner && (
        <DocumentScanner
          documentName={
            DOCUMENTS.find(
              (item) =>
                item.key === scanner
            )?.label ?? "Document"
          }
          onComplete={(
            file,
            compressed
          ) => {
            updateDocument(
              scanner,
              file,
              compressed
            );
          }}
          onClose={() =>
            setScanner(null)
          }
        />
      )}
    </main>
  );
}
