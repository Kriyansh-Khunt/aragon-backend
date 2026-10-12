import sharp from "sharp";
import convert from "heic-convert";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { blurService } from "./blur.service.js";
import { faceService } from "./face.service.js";
import { hasherService } from "./hasher.service.js";
import type { ImageValidationOutcome } from "../types/index.js";

export class ValidationService {
  public async processAndValidate(
    fileBuffer: Buffer,
    originalMime: string,
    originalName: string,
  ): Promise<ImageValidationOutcome> {
    const rejectionReasons: string[] = [];
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
      } catch (err) {
        rejectionReasons.push("Failed to convert HEIC image");
      }
    }

    const allowedMimes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedMimes.includes(mimeType)) {
      rejectionReasons.push(
        "Unsupported file format (only JPG, PNG, HEIC allowed)",
      );
    }

    let width = 0;
    let height = 0;
    try {
      const meta = await sharp(workingBuffer).metadata();
      width = meta.width || 0;
      height = meta.height || 0;
    } catch {
      rejectionReasons.push("Corrupted or unreadable image file");
    }

    const fileSizeBytes = workingBuffer.length;
    if (fileSizeBytes < env.MIN_FILE_SIZE_BYTES) {
      rejectionReasons.push("File size too small (minimum 30 KB required)");
    }

    if (width < env.MIN_WIDTH || height < env.MIN_HEIGHT) {
      rejectionReasons.push(
        `Resolution too low (${width}x${height}, minimum ${env.MIN_WIDTH}x${env.MIN_HEIGHT} required)`,
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
        rejectionReasons.push("Too similar to another upload");
      }
    } catch (dbError) {
      console.warn("DB check during similarity skipped:", dbError);
    }

    const { variance: blurScore, isBlurry } =
      await blurService.computeLaplacianVariance(workingBuffer);

    if (isBlurry) {
      rejectionReasons.push("Blurry face detected");
    }

    const faceResult = await faceService.analyzeFaces(
      workingBuffer,
      width > 0 ? width : 600,
      height > 0 ? height : 600,
    );

    if (faceResult.faceCount === 0) {
      rejectionReasons.push("No face detected in photo");
    } else if (faceResult.faceCount > 1) {
      rejectionReasons.push(
        `Multiple faces detected (${faceResult.faceCount} people found)`,
      );
    } else if (faceResult.faceAreaRatio < env.MIN_FACE_AREA_RATIO) {
      rejectionReasons.push("Face is too far away");
    }

    const isValid = rejectionReasons.length === 0;

    return {
      isValid,
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
