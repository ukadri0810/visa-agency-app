import { jsPDF } from "jspdf";
import { DOCUMENT_LABELS, DOCUMENT_ORDER, DocumentKey, DocumentSlot } from "./types";

const PAGE_MARGIN = 56; // pt

function buildFileName(customerName: string): string {
  const cleaned = customerName
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  const safeName = cleaned.length > 0 ? cleaned : "Customer";
  return `${safeName}_VisaDocuments.pdf`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not read image dimensions"));
    img.src = dataUrl;
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Builds a single PDF from the customer's name and their three uploaded
 * documents, then triggers a browser download named
 * "CustomerName_VisaDocuments.pdf". Everything happens client-side; the
 * temporary object URL used to trigger the download is revoked immediately
 * after use.
 */
export async function buildVisaDocumentsPdf(
  customerName: string,
  documents: Record<DocumentKey, DocumentSlot>
): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  // Cover page
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 76, 129); // #0F4C81
  doc.text("Visa Application Documents", PAGE_MARGIN, 120);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(21, 42, 61); // #152A3D
  doc.text(`Customer: ${customerName.trim()}`, PAGE_MARGIN, 156);

  doc.setFontSize(11);
  doc.setTextColor(93, 113, 134); // #5D7186
  doc.text(`Generated: ${formatDate(new Date())}`, PAGE_MARGIN, 176);
  doc.text(
    "Contents: Passport (front, back), PAN card",
    PAGE_MARGIN,
    194
  );

  // One page per document
  for (const key of DOCUMENT_ORDER) {
    const slot = documents[key];
    if (!slot.file) continue;

    doc.addPage();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 76, 129);
    doc.text(DOCUMENT_LABELS[key], PAGE_MARGIN, PAGE_MARGIN);

    if (!slot.file.type.startsWith("image/")) {
      // jsPDF can only embed raster images. A non-image upload (e.g. a
      // PDF selected via the file picker) can't be placed on the page.
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(93, 113, 134);
      doc.text(
        "This file could not be embedded (unsupported format).",
        PAGE_MARGIN,
        PAGE_MARGIN + 28
      );
      continue;
    }

    const dataUrl = await readFileAsDataUrl(slot.file);
    const { width, height } = await getImageDimensions(dataUrl);

    const availableHeight = pageHeight - PAGE_MARGIN * 2 - 24;
    const scale = Math.min(contentWidth / width, availableHeight / height, 1);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const x = PAGE_MARGIN + (contentWidth - drawWidth) / 2;
    const y = PAGE_MARGIN + 24;

    const format = slot.file.type === "image/png" ? "PNG" : "JPEG";
    doc.addImage(dataUrl, format, x, y, drawWidth, drawHeight);
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildFileName(customerName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
