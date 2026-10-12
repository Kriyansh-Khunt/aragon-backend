export type ImageValidationStatus = "PROCESSING" | "ACCEPTED" | "REJECTED";

export interface FaceDetectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
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
  rejectionReasons: string[];
  metrics: ValidationMetricResult;
  processedBuffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

export interface UploadedImageResponse {
  id: string;
  originalName: string;
  fileName: string;
  storageUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  status: ImageValidationStatus;
  rejectionReasons: string[];
  failureDetails: Record<string, unknown> | null;
  blurScore: number | null;
  faceCount: number | null;
  faceAreaRatio: number | null;
  createdAt: string;
}
