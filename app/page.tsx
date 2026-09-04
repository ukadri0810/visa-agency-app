"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canvasToFile, detectDocumentCorners, warpToRect } from "@/lib/edgeDetection";
import { compressImage, PRESETS, ResolutionPreset } from "@/lib/imageCompression";
import { buildVisaDocumentsPdf } from "@/lib/generatePdf";
import { DOCUMENT_LABELS, DOCUMENT_ORDER, DocumentKey, DocumentSlot } from "@/lib/types";
import { loadOpenCv } from "@/lib/opencvLoader";

const EMPTY_SLOT: DocumentSlot = { file: null, previewUrl: null };

type CameraState = { key: DocumentKey; label: string } | null;

export default function Home() {
  const [customerName, setCustomerName] = useState("");
  const [documents, setDocuments] = useState<Record<DocumentKey, DocumentSlot>>({
    passportFront: { ...EMPTY_SLOT }, passportBack: { ...EMPTY_SLOT }, panCard: { ...EMPTY_SLOT },
  });
  const [camera, setCamera] = useState<CameraState>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resolution, setResolution] = useState<ResolutionPreset>("high");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRefs = useRef<Record<DocumentKey, HTMLInputElement | null>>({ passportFront: null, passportBack: null, panCard: null });

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera(null);
  }, []);

  const openCamera = useCallback(async (key: DocumentKey) => {
    setCameraError(null);
    setStatusMessage(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported by this browser.");
      await loadOpenCv();
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setCamera({ key, label: DOCUMENT_LABELS[key] });
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Could not open the camera. Please allow camera permission and try again.");
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!camera || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => undefined);
    return () => { video.pause(); };
  }, [camera]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    Object.values(documents).forEach((slot) => slot.previewUrl && URL.revokeObjectURL(slot.previewUrl));
  }, []);

  const saveDocument = useCallback((key: DocumentKey, file: File) => {
    setDocuments((prev) => {
      if (prev[key].previewUrl) URL.revokeObjectURL(prev[key].previewUrl as string);
      return { ...prev, [key]: { file, previewUrl: URL.createObjectURL(file) } };
    });
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!camera || !videoRef.current) return;
    setIsProcessing(true);
    setCameraError(null);
    try {
      const video = videoRef.current;
      const source = document.createElement("canvas");
      source.width = video.videoWidth || 1920;
      source.height = video.videoHeight || 1080;
      const ctx = source.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Camera capture is unavailable.");
      ctx.drawImage(video, 0, 0, source.width, source.height);

      const cv = (window as any).cv;
      if (!cv?.Mat) throw new Error("Document scanner is still loading. Please try again in a moment.");
      const detection = detectDocumentCorners(cv, source);
      let outputCanvas = source;
      if (detection.corners && detection.confidence >= 0.22) {
        outputCanvas = warpToRect(cv, source, detection.corners, 1800, 1200);
      }

      const file = await canvasToFile(outputCanvas, `${camera.key}.jpg`, 0.95);
      saveDocument(camera.key, file);
      setStatusMessage(detection.corners ? "Document edges detected and aligned automatically." : "Photo captured. Keep the document fully inside the guide for better automatic alignment.");
      stopCamera();
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Could not capture the document.");
    } finally {
      setIsProcessing(false);
    }
  }, [camera, saveDocument, stopCamera]);

  const handleFileSelect = useCallback((key: DocumentKey, file: File | null) => {
    if (file) saveDocument(key, file);
    else setDocuments((prev) => ({ ...prev, [key]: { ...EMPTY_SLOT } }));
    setStatusMessage(null);
  }, [saveDocument]);

  const handleRemove = useCallback((key: DocumentKey) => {
    setDocuments((prev) => {
      if (prev[key].previewUrl) URL.revokeObjectURL(prev[key].previewUrl as string);
      return { ...prev, [key]: { ...EMPTY_SLOT } };
    });
    if (inputRefs.current[key]) inputRefs.current[key]!.value = "";
  }, []);

  const handleClearSession = useCallback(() => {
    stopCamera();
    Object.values(documents).forEach((slot) => slot.previewUrl && URL.revokeObjectURL(slot.previewUrl));
    Object.values(inputRefs.current).forEach((input) => { if (input) input.value = ""; });
    setDocuments({ passportFront: { ...EMPTY_SLOT }, passportBack: { ...EMPTY_SLOT }, panCard: { ...EMPTY_SLOT } });
    setCustomerName("");
    setStatusMessage("Session cleared. No data was retained.");
  }, [documents, stopCamera]);

  const allDocumentsPresent = DOCUMENT_ORDER.every((key) => documents[key].file !== null);
  const canGenerate = customerName.trim().length > 0 && allDocumentsPresent;

  const handleGeneratePdf = useCallback(async () => {
    if (!canGenerate) return;
    setIsGenerating(true); setStatusMessage(null);
    try {
      const processed: Record<DocumentKey, DocumentSlot> = { ...documents };
      for (const key of DOCUMENT_ORDER) {
        const file = documents[key].file;
        if (!file || !file.type.startsWith("image/")) continue;
        const compressed = await compressImage(file, resolution);
        const processedFile = new File([compressed], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
        processed[key] = { file: processedFile, previewUrl: URL.createObjectURL(processedFile) };
      }
      await buildVisaDocumentsPdf(customerName, processed);
      Object.values(processed).forEach((slot) => {
        if (slot.previewUrl && !Object.values(documents).some((original) => original.previewUrl === slot.previewUrl)) URL.revokeObjectURL(slot.previewUrl);
      });
      setStatusMessage(`${PRESETS[resolution].label} PDF created successfully.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not create the PDF.");
    } finally { setIsGenerating(false); }
  }, [canGenerate, customerName, documents, resolution]);

  return (
    <main className="min-h-screen bg-[#F5F8FA]">
      <header className="border-b border-[#D7E1E8] bg-white">
        <div className="mx-auto max-w-5xl px-5 py-5 sm:px-6">
          <p className="text-sm text-[#5D7186]">Document Preparation</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-[#0F4C81] sm:text-3xl">Visa Application Documents</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5D7186]">Capture passport and PAN documents directly with the mobile camera. The scanner detects the document edges, straightens the image and prepares it for the final PDF.</p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-7 sm:px-6 sm:py-10">
        <section className="border border-[#D7E1E8] bg-white">
          <div className="border-b border-[#D7E1E8] px-5 py-4"><div className="flex items-baseline gap-3"><span className="font-serif text-sm font-semibold text-[#0F4C81]">1</span><h2 className="font-serif text-lg font-semibold">Customer details</h2></div></div>
          <div className="px-5 py-5">
            <label htmlFor="customerName" className="mb-2 block text-sm text-[#5D7186]">Full name as it appears on the passport</label>
            <input id="customerName" type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Ananya Sharma" className="w-full border border-[#D7E1E8] bg-[#F5F8FA] px-4 py-3 text-base text-[#152A3D] outline-none focus:border-[#0F4C81] focus:bg-white" />
          </div>
        </section>

        <section className="mt-6 border border-[#D7E1E8] bg-white">
          <div className="border-b border-[#D7E1E8] px-5 py-4"><div className="flex items-baseline gap-3"><span className="font-serif text-sm font-semibold text-[#0F4C81]">2</span><div><h2 className="font-serif text-lg font-semibold">Scan documents</h2><p className="mt-1 text-xs text-[#5D7186]">Camera scan is recommended on mobile. File upload remains available as a fallback.</p></div></div></div>

          <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-3">
            {DOCUMENT_ORDER.map((key) => {
              const slot = documents[key];
              return <div key={key} className="flex min-w-0 flex-col overflow-hidden border border-[#D7E1E8] bg-white">
                <div className="border-b border-[#D7E1E8] bg-[#F5F8FA] px-4 py-3"><p className="text-sm font-semibold text-[#152A3D]">{DOCUMENT_LABELS[key]}</p><p className="mt-0.5 text-[11px] text-[#5D7186]">{slot.file ? "Captured / selected" : "Ready to scan"}</p></div>
                <div className="relative flex aspect-[3/2] items-center justify-center bg-[#EAF0F4] p-2">
                  {slot.previewUrl ? <img src={slot.previewUrl} alt={`${DOCUMENT_LABELS[key]} preview`} className="h-full w-full rounded-sm object-contain" /> : <div className="flex h-full w-full flex-col items-center justify-center border border-dashed border-[#B9C9D5] px-4 text-center"><span className="mb-2 text-2xl text-[#7B91A4]">▧</span><p className="text-xs text-[#5D7186]">Position the document inside the camera guide</p></div>}
                </div>
                <div className="grid grid-cols-2 border-t border-[#D7E1E8]">
                  <button type="button" onClick={() => openCamera(key)} className="border-r border-[#D7E1E8] px-3 py-3 text-sm font-semibold text-[#0F4C81] hover:bg-[#F5F8FA]">{slot.file ? "Scan again" : "Open camera"}</button>
                  <button type="button" onClick={() => inputRefs.current[key]?.click()} className="px-3 py-3 text-sm font-medium text-[#152A3D] hover:bg-[#F5F8FA]">Choose file</button>
                </div>
                {slot.file && <button type="button" onClick={() => handleRemove(key)} className="border-t border-[#D7E1E8] px-3 py-2 text-xs text-[#5D7186] hover:bg-[#F5F8FA]">Remove document</button>}
                <input ref={(el) => { inputRefs.current[key] = el; }} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileSelect(key, e.target.files?.[0] ?? null)} />
              </div>;
            })}
          </div>
        </section>

        <section className="mt-6 border border-[#D7E1E8] bg-white px-5 py-5">
          <div className="flex items-baseline gap-3 pb-4"><span className="font-serif text-sm font-semibold text-[#0F4C81]">3</span><div><h2 className="font-serif text-lg font-semibold">Output quality</h2><p className="mt-1 text-xs text-[#5D7186]">Choose the image size used inside the generated PDF.</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(PRESETS) as ResolutionPreset[]).map((preset) => <button key={preset} type="button" onClick={() => setResolution(preset)} className={`text-left border px-4 py-3 transition ${resolution === preset ? "border-[#0F4C81] bg-[#F1F6FA]" : "border-[#D7E1E8] hover:bg-[#F5F8FA]"}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold text-[#152A3D]">{PRESETS[preset].label}</span><span className={`h-4 w-4 rounded-full border ${resolution === preset ? "border-[#0F4C81] bg-[#0F4C81]" : "border-[#9AAEBD]"}`} /></div><p className="mt-1 text-xs text-[#5D7186]">{PRESETS[preset].description}</p></button>)}
          </div>
        </section>

        <section className="mt-6 border border-[#D7E1E8] bg-white px-5 py-5">
          <div className="flex items-baseline gap-3 pb-4"><span className="font-serif text-sm font-semibold text-[#0F4C81]">4</span><h2 className="font-serif text-lg font-semibold">Generate and download</h2></div>
          {statusMessage && <p className="mb-4 border border-[#D7E1E8] bg-[#F5F8FA] px-4 py-3 text-sm text-[#5D7186]">{statusMessage}</p>}
          <div className="flex flex-col gap-3 sm:flex-row"><button type="button" onClick={handleGeneratePdf} disabled={!canGenerate || isGenerating} className="flex-1 bg-[#0F4C81] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0A3A63] disabled:cursor-not-allowed disabled:opacity-40">{isGenerating ? "Preparing PDF…" : "Generate PDF"}</button><button type="button" onClick={handleClearSession} className="border border-[#D7E1E8] px-6 py-3 text-sm font-medium text-[#152A3D] hover:bg-[#F5F8FA]">Clear session</button></div>
          {!canGenerate && <p className="mt-3 text-xs text-[#5D7186]">Enter the customer name and scan/select all three documents to enable PDF generation.</p>}
        </section>
      </div>

      {camera && <div className="fixed inset-0 z-50 bg-black/90 p-3 sm:p-6"><div className="mx-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-lg bg-[#101820] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-4 text-white"><div><p className="text-xs text-white/60">Document scanner</p><h2 className="text-base font-semibold">{camera.label}</h2></div><button type="button" onClick={stopCamera} className="rounded border border-white/20 px-3 py-2 text-sm">Close</button></div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black"><video ref={videoRef} playsInline muted className="h-full w-full object-cover" /><div className="pointer-events-none absolute inset-5 rounded-xl border-2 border-white/80 sm:inset-10"><div className="absolute left-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2 px-5 text-center"><span className="rounded bg-black/45 px-3 py-2 text-xs font-medium text-white">Fit the complete document inside the frame</span></div></div></div>
        {cameraError && <p className="px-4 py-3 text-sm text-red-300">{cameraError}</p>}
        <div className="flex items-center justify-center gap-3 px-4 py-5"><button type="button" onClick={capturePhoto} disabled={isProcessing} className="rounded-full border-4 border-white bg-white/20 px-8 py-4 text-sm font-bold text-white disabled:opacity-50">{isProcessing ? "Scanning…" : "Capture document"}</button></div>
      </div></div>}

      {cameraError && !camera && <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-lg border border-[#D7E1E8] bg-white p-4 text-sm text-[#152A3D] shadow-lg"><div className="flex items-start justify-between gap-3"><p>{cameraError}</p><button type="button" onClick={() => setCameraError(null)} className="text-[#5D7186]">×</button></div></div>}
    </main>
  );
}
