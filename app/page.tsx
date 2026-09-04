"use client";

import { useCallback, useRef, useState } from "react";

type DocumentKey = "passportFront" | "passportBack" | "panCard";

interface DocumentSlot {
  file: File | null;
  previewUrl: string | null;
}

const DOCUMENT_LABELS: Record<DocumentKey, string> = {
  passportFront: "Passport — Front Page",
  passportBack: "Passport — Back Page",
  panCard: "PAN Card",
};

const EMPTY_SLOT: DocumentSlot = { file: null, previewUrl: null };

export default function Home() {
  const [customerName, setCustomerName] = useState("");
  const [documents, setDocuments] = useState<Record<DocumentKey, DocumentSlot>>({
    passportFront: { ...EMPTY_SLOT },
    passportBack: { ...EMPTY_SLOT },
    panCard: { ...EMPTY_SLOT },
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const inputRefs = useRef<Record<DocumentKey, HTMLInputElement | null>>({
    passportFront: null,
    passportBack: null,
    panCard: null,
  });

  const handleFileSelect = useCallback(
    (key: DocumentKey, file: File | null) => {
      setDocuments((prev) => {
        // Revoke the previous object URL before replacing it.
        if (prev[key].previewUrl) {
          URL.revokeObjectURL(prev[key].previewUrl);
        }
        if (!file) {
          return { ...prev, [key]: { ...EMPTY_SLOT } };
        }
        return {
          ...prev,
          [key]: { file, previewUrl: URL.createObjectURL(file) },
        };
      });
      setStatusMessage(null);
    },
    []
  );

  const handleRemove = useCallback(
    (key: DocumentKey) => {
      handleFileSelect(key, null);
      const input = inputRefs.current[key];
      if (input) input.value = "";
    },
    [handleFileSelect]
  );

  const handleClearSession = useCallback(() => {
    (Object.keys(documents) as DocumentKey[]).forEach((key) => {
      if (documents[key].previewUrl) {
        URL.revokeObjectURL(documents[key].previewUrl as string);
      }
      const input = inputRefs.current[key];
      if (input) input.value = "";
    });
    setDocuments({
      passportFront: { ...EMPTY_SLOT },
      passportBack: { ...EMPTY_SLOT },
      panCard: { ...EMPTY_SLOT },
    });
    setCustomerName("");
    setStatusMessage("Session cleared. No data was retained.");
  }, [documents]);

  const allDocumentsPresent = (Object.keys(documents) as DocumentKey[]).every(
    (key) => documents[key].file !== null
  );
  const canGenerate = customerName.trim().length > 0 && allDocumentsPresent;

  const handleGeneratePdf = useCallback(async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setStatusMessage(null);
    try {
      // PDF assembly logic will be implemented in lib/generatePdf.ts (next step)
      // and imported here, e.g.:
      // const { buildVisaDocumentsPdf } = await import("@/lib/generatePdf");
      // await buildVisaDocumentsPdf(customerName, documents);
      setStatusMessage("PDF generation will be wired up in the next step.");
    } finally {
      setIsGenerating(false);
    }
  }, [canGenerate, customerName, documents]);

  return (
    <main className="min-h-screen">
      <header className="border-b border-[#D7E1E8] bg-white">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <p className="font-sans text-sm text-[#5D7186]">Document Preparation</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-[#0F4C81] sm:text-3xl">
            Visa Application Documents
          </h1>
          <p className="mt-2 max-w-xl font-sans text-sm text-[#5D7186]">
            Every file stays in this browser tab. Nothing is uploaded, stored,
            or tracked — closing or clearing the session removes it all.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Step 1 — Customer name */}
        <section className="border border-[#D7E1E8] bg-white">
          <div className="flex items-baseline gap-3 border-b border-[#D7E1E8] px-5 py-4">
            <span className="font-serif text-sm font-semibold text-[#0F4C81]">
              1
            </span>
            <h2 className="font-serif text-lg font-semibold">
              Customer name
            </h2>
          </div>
          <div className="px-5 py-5">
            <label
              htmlFor="customerName"
              className="mb-2 block font-sans text-sm text-[#5D7186]"
            >
              Full name as it appears on the passport
            </label>
            <input
              id="customerName"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Ananya Sharma"
              className="w-full border border-[#D7E1E8] bg-[#F5F8FA] px-4 py-3 font-sans text-base text-[#152A3D] outline-none focus:border-[#0F4C81] focus:bg-white"
            />
          </div>
        </section>

        {/* Step 2 — Document uploads */}
        <section className="mt-6 border border-[#D7E1E8] bg-white">
          <div className="flex items-baseline gap-3 border-b border-[#D7E1E8] px-5 py-4">
            <span className="font-serif text-sm font-semibold text-[#0F4C81]">
              2
            </span>
            <h2 className="font-serif text-lg font-semibold">
              Upload documents
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 px-5 py-5 sm:grid-cols-2">
            {(Object.keys(DOCUMENT_LABELS) as DocumentKey[]).map((key) => {
              const slot = documents[key];
              return (
                <div key={key} className="border border-[#D7E1E8]">
                  <div className="border-b border-[#D7E1E8] bg-[#F5F8FA] px-4 py-2.5">
                    <p className="font-sans text-sm font-medium text-[#152A3D]">
                      {DOCUMENT_LABELS[key]}
                    </p>
                  </div>

                  <div className="flex aspect-[4/3] items-center justify-center bg-[#FBFCFD]">
                    {slot.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={slot.previewUrl}
                        alt={`${DOCUMENT_LABELS[key]} preview`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <p className="px-4 text-center font-sans text-sm text-[#5D7186]">
                        No file selected
                      </p>
                    )}
                  </div>

                  <div className="flex border-t border-[#D7E1E8]">
                    <button
                      type="button"
                      onClick={() => inputRefs.current[key]?.click()}
                      className="flex-1 border-r border-[#D7E1E8] px-3 py-2.5 font-sans text-sm font-medium text-[#0F4C81] hover:bg-[#F5F8FA]"
                    >
                      {slot.file ? "Replace" : "Choose file"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(key)}
                      disabled={!slot.file}
                      className="flex-1 px-3 py-2.5 font-sans text-sm font-medium text-[#5D7186] hover:bg-[#F5F8FA] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>

                  <input
                    ref={(el) => {
                      inputRefs.current[key] = el;
                    }}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) =>
                      handleFileSelect(key, e.target.files?.[0] ?? null)
                    }
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Step 3 — Actions */}
        <section className="mt-6 border border-[#D7E1E8] bg-white px-5 py-5">
          <div className="flex items-baseline gap-3 pb-4">
            <span className="font-serif text-sm font-semibold text-[#0F4C81]">
              3
            </span>
            <h2 className="font-serif text-lg font-semibold">
              Generate and download
            </h2>
          </div>

          {statusMessage && (
            <p className="mb-4 font-sans text-sm text-[#5D7186]">
              {statusMessage}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={!canGenerate || isGenerating}
              className="flex-1 bg-[#0F4C81] px-5 py-3 font-sans text-sm font-semibold text-white hover:bg-[#0A3A63] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isGenerating ? "Preparing PDF…" : "Generate PDF"}
            </button>
            <button
              type="button"
              onClick={handleClearSession}
              className="flex-1 border border-[#D7E1E8] px-5 py-3 font-sans text-sm font-medium text-[#152A3D] hover:bg-[#F5F8FA] sm:flex-none sm:px-6"
            >
              Clear session
            </button>
          </div>

          {!canGenerate && (
            <p className="mt-3 font-sans text-xs text-[#5D7186]">
              Enter the customer name and upload all three documents to
              enable PDF generation.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
