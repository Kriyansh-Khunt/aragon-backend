import sharp from "sharp";
import convert from "heic-convert";
import { prisma } from "../lib/prisma.js";
import { blurService } from "./blur.service.js";
import { faceService } from "./face.service.js";
import { hasherService } from "./hasher.service.js";
import {
  VALIDATION_LIMITS,
  ALLOWED_MIME_TYPES,
  REJECTION_DEFINITIONS,
} from "../constants/index.js";
import type {
  ImageValidationOutcome,
  RejectionDetail,
} from "../types/index.js";

export class ValidationService {
  public async processAndValidate(
    fileBuffer: Buffer,
    originalMime: string,
    originalName: string,
  ): Promise<ImageValidationOutcome> {
    const rejectionDetails: RejectionDetail[] = [];
    let workingBuffer = fileBuffer;
    let mimeType = originalMime.toLowerCase();

    const isHeic =
      mimeType.includes("heic") ||
      mimeType.includes("heif") ||
      originalName.toLowerCase().endsWith(".heic") ||
      originalName.toLowerCase().endsWith(".heif");

    if (isHeic) {
      try {
        const converted = await convert({
          buffer: fileBuffer,
          format: "JPEG",
          quality: 0.95,
        });
        workingBuffer = Buffer.from(converted);
        mimeType = "image/jpeg";
      } catch {
        rejectionDetails.push(REJECTION_DEFINITIONS.HEIC_CONVERSION_FAILED());
      }
    }

    const isAllowedMime = ALLOWED_MIME_TYPES.includes(mimeType as any);
    if (!isAllowedMime) {
      rejectionDetails.push(REJECTION_DEFINITIONS.UNSUPPORTED_FORMAT());
    }

    let width = 0;
    let height = 0;
    try {
      const meta = await sharp(workingBuffer).metadata();
      width = meta.width || 0;
      height = meta.height || 0;
    } catch {
      rejectionDetails.push(REJECTION_DEFINITIONS.CORRUPTED_FILE());
    }

    const fileSizeBytes = workingBuffer.length;
    if (fileSizeBytes < VALIDATION_LIMITS.MIN_FILE_SIZE_BYTES) {
      rejectionDetails.push(REJECTION_DEFINITIONS.FILE_TOO_SMALL());
    }

    if (
      width < VALIDATION_LIMITS.MIN_WIDTH ||
      height < VALIDATION_LIMITS.MIN_HEIGHT
    ) {
      rejectionDetails.push(
        REJECTION_DEFINITIONS.RESOLUTION_TOO_LOW({ width, height }),
      );
    }

    const perceptualHash = await hasherService.computeDHash(workingBuffer);

    let isDuplicate = false;
    let matchedImageId: string | undefined;

    try {
      const existingImages = await prisma.uploadedImage.findMany({
        where: { status: "ACCEPTED", perceptualHash: { not: null } },
        select: { id: true, perceptualHash: true },
      });

      const hashCandidates = existingImages
        .filter((item) => item.perceptualHash !== null)
        .map((item) => ({ id: item.id, hash: item.perceptualHash as string }));

      const duplicateCheck = hasherService.findDuplicate(
        perceptualHash,
        hashCandidates,
      );

      if (duplicateCheck.isDuplicate) {
        isDuplicate = true;
        matchedImageId = duplicateCheck.matchedImageId;
        rejectionDetails.push(REJECTION_DEFINITIONS.DUPLICATE_IMAGE());
      }
    } catch (dbError) {
      console.warn("Database duplicate check skipped:", dbError);
    }

    const { variance: blurScore, isBlurry } =
      await blurService.computeLaplacianVariance(workingBuffer);

    if (isBlurry) {
      rejectionDetails.push(REJECTION_DEFINITIONS.BLURRY_IMAGE());
    }

    const faceResult = await faceService.analyzeFaces(
      workingBuffer,
      width > 0 ? width : 600,
      height > 0 ? height : 600,
    );

    if (faceResult.faceCount === 0) {
      rejectionDetails.push(REJECTION_DEFINITIONS.NO_FACE_DETECTED());
    } else if (faceResult.faceCount > 1) {
      rejectionDetails.push(
        REJECTION_DEFINITIONS.MULTIPLE_FACES({ count: faceResult.faceCount }),
      );
    } else if (
      faceResult.faceAreaRatio < VALIDATION_LIMITS.MIN_FACE_AREA_RATIO
    ) {
      rejectionDetails.push(REJECTION_DEFINITIONS.FACE_TOO_FAR());
    }

    const isValid = rejectionDetails.length === 0;
    const rejectionReasons = rejectionDetails.map((item) => item.label);

    return {
      isValid,
      rejectionDetails,
      rejectionReasons,
      processedBuffer: workingBuffer,
      mimeType,
      width,
      height,
      metrics: {
        width,
        height,
        fileSizeBytes,
        mimeType,
        blurScore,
        isBlurry,
        faceCount: faceResult.faceCount,
        faceAreaRatio: faceResult.faceAreaRatio,
        perceptualHash,
        isDuplicate,
        matchedImageId,
      },
    };
  }
}

export const validationService = new ValidationService();
