export type DocumentKey = "passportFront" | "passportBack" | "panCard";

export interface DocumentSlot {
  file: File | null;
  previewUrl: string | null;
}

export const DOCUMENT_ORDER: DocumentKey[] = [
  "passportFront",
  "passportBack",
  "panCard",
];

export const DOCUMENT_LABELS: Record<DocumentKey, string> = {
  passportFront: "Passport — Front Page",
  passportBack: "Passport — Back Page",
  panCard: "PAN Card",
};
