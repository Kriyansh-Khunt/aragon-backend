import type { RejectionCode, RejectionDetail } from "../types/index.js";

export const VALIDATION_LIMITS = {
  MIN_WIDTH: 512,
  MIN_HEIGHT: 512,
  MIN_FILE_SIZE_BYTES: 15360,
  MAX_FILE_SIZE_BYTES: 26214400,
  MAX_BATCH_FILES: 20,
  BLUR_THRESHOLD: 40,
  MIN_FACE_AREA_RATIO: 0.12,
  HAMMING_DISTANCE_THRESHOLD: 5,
} as const;

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
] as const;

export const REJECTION_DEFINITIONS: Record<
  RejectionCode,
  (extra?: any) => RejectionDetail
> = {
  HEIC_CONVERSION_FAILED: () => ({
    code: "HEIC_CONVERSION_FAILED",
    label: "HEIC conversion failed",
    description:
      "Failed to process Apple HEIC format. Please convert to JPG or PNG.",
  }),
  UNSUPPORTED_FORMAT: () => ({
    code: "UNSUPPORTED_FORMAT",
    label: "Unsupported format",
    description: "Invalid file format. Please upload JPG, PNG, or HEIC photos.",
  }),
  CORRUPTED_FILE: () => ({
    code: "CORRUPTED_FILE",
    label: "Corrupted image",
    description:
      "The file appears damaged or incomplete. Please upload an intact image.",
  }),
  FILE_TOO_SMALL: () => ({
    code: "FILE_TOO_SMALL",
    label: "File size too small",
    description:
      "File size is under 15 KB. Please upload a full-resolution portrait.",
  }),
  RESOLUTION_TOO_LOW: ({ width, height }) => ({
    code: "RESOLUTION_TOO_LOW",
    label: `Resolution too low (${width}x${height})`,
    description:
      "Resolution too low. Please upload photos that are at least 512x512 pixels.",
  }),
  DUPLICATE_IMAGE: () => ({
    code: "DUPLICATE_IMAGE",
    label: "Too similar to another upload",
    description:
      "You've already uploaded images similar to this photo. Our AI suggests uploading a diversity of photos with different backgrounds, lighting, and clothing.",
  }),
  BLURRY_IMAGE: () => ({
    code: "BLURRY_IMAGE",
    label: "Blurry face detected",
    description:
      "We detected a blurry face. Please ensure the face is in focus.",
  }),
  NO_FACE_DETECTED: () => ({
    code: "NO_FACE_DETECTED",
    label: "No face detected",
    description:
      "No face detected in photo. Please ensure your face is clearly visible.",
  }),
  MULTIPLE_FACES: ({ count }) => ({
    code: "MULTIPLE_FACES",
    label: `Multiple faces detected (${count})`,
    description:
      "Multiple people detected. Aragon models require photos with only you in the frame.",
  }),
  FACE_TOO_FAR: () => ({
    code: "FACE_TOO_FAR",
    label: "Face is too far away",
    description:
      "Face is too far from the camera. Please ensure the face is at an appropriate distance.",
  }),
  PROCESSING_FAILED: () => ({
    code: "PROCESSING_FAILED",
    label: "Processing failed",
    description:
      "An unexpected processing error occurred. Please try uploading again.",
  }),
};
