export type ImageValidationStatus = "PROCESSING" | "ACCEPTED" | "REJECTED";

export type RejectionCode =
  | "HEIC_CONVERSION_FAILED"
  | "UNSUPPORTED_FORMAT"
  | "CORRUPTED_FILE"
  | "FILE_TOO_SMALL"
  | "RESOLUTION_TOO_LOW"
  | "DUPLICATE_IMAGE"
  | "BLURRY_IMAGE"
  | "NO_FACE_DETECTED"
  | "MULTIPLE_FACES"
  | "FACE_TOO_FAR"
  | "PROCESSING_FAILED";

export interface RejectionDetail {
  code: RejectionCode;
  label: string;
  description: string;
}

export interface ValidationMetricResult {
  width: number;
  height: number;
  fileSizeBytes: number;
  mimeType: string;
  blurScore: number;
  isBlurry: boolean;
  faceCount: number;
  faceAreaRatio: number;
  perceptualHash: string;
  isDuplicate: boolean;
  matchedImageId?: string;
}

export interface ImageValidationOutcome {
  isValid: boolean;
  rejectionDetails: RejectionDetail[];
  rejectionReasons: string[];
  metrics: ValidationMetricResult;
  processedBuffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}
