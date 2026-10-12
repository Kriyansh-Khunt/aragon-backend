import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma.js";
import { storageService } from "../services/storage.service.js";
import { validationService } from "../services/validation.service.js";
import { demoService } from "../services/demo.service.js";
import { REJECTION_DEFINITIONS } from "../constants/index.js";

export class ImageController {
  public async uploadImages(req: Request, res: Response): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: "No files uploaded" });
        return;
      }

      const initialRecords = await Promise.all(
        files.map(async (file) => {
          const fileId = uuidv4();
          const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storageFilename = `${fileId}-${cleanName}`;

          const record = await prisma.uploadedImage.create({
            data: {
              id: fileId,
              originalName: file.originalname,
              fileName: storageFilename,
              storageUrl: "",
              mimeType: file.mimetype,
              fileSizeBytes: file.size,
              status: "PROCESSING",
              rejectionReasons: [],
            },
          });

          return { record, file, storageFilename };
        }),
      );

      res.status(202).json({
        message: "Images received and processing initiated",
        data: initialRecords.map((item) => item.record),
      });

      (async () => {
        const batchAcceptedHashes: Array<{ id: string; hash: string }> = [];

        for (const item of initialRecords) {
          try {
            const outcome = await validationService.processAndValidate(
              item.file.buffer,
              item.file.mimetype,
              item.file.originalname,
              batchAcceptedHashes,
            );

            const { storageUrl } = await storageService.upload(
              outcome.processedBuffer,
              item.storageFilename,
              outcome.mimeType,
            );

            const status = outcome.isValid ? "ACCEPTED" : "REJECTED";

            if (outcome.isValid && outcome.metrics.perceptualHash) {
              batchAcceptedHashes.push({
                id: item.record.id,
                hash: outcome.metrics.perceptualHash,
              });
            }

            await prisma.uploadedImage.update({
              where: { id: item.record.id },
              data: {
                storageUrl,
                status,
                mimeType: outcome.mimeType,
                width: outcome.width,
                height: outcome.height,
                rejectionReasons: outcome.rejectionReasons,
                failureDetails: {
                  ...outcome.metrics,
                  rejectionDetails: outcome.rejectionDetails,
                } as any,
                perceptualHash: outcome.metrics.perceptualHash,
                blurScore: outcome.metrics.blurScore,
                faceCount: outcome.metrics.faceCount,
                faceAreaRatio: outcome.metrics.faceAreaRatio,
              },
            });
          } catch (processingErr) {
            console.error("Async image processing failure:", processingErr);
            const failureDetail = REJECTION_DEFINITIONS.PROCESSING_FAILED();
            await prisma.uploadedImage.update({
              where: { id: item.record.id },
              data: {
                status: "REJECTED",
                rejectionReasons: [failureDetail.label],
                failureDetails: {
                  rejectionDetails: [failureDetail],
                } as any,
              },
            });
          }
        }
      })();
    } catch (err: any) {
      console.error("Upload controller error:", err);
      res.status(500).json({ error: err.message || "Failed to upload images" });
    }
  }

  public async listImages(req: Request, res: Response): Promise<void> {
    try {
      const statusQuery = req.query.status as string | undefined;

      const whereClause: any = {};
      if (statusQuery === "ACCEPTED" || statusQuery === "REJECTED") {
        whereClause.status = statusQuery;
      }

      const images = await prisma.uploadedImage.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
      });

      res.json({ data: images });
    } catch (err: any) {
      console.error("List images error:", err);
      res.status(500).json({ error: "Failed to list images" });
    }
  }

  public async getImageById(req: Request, res: Response): Promise<void> {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : String(rawId);
      const image = await prisma.uploadedImage.findUnique({
        where: { id },
      });

      if (!image) {
        res.status(404).json({ error: "Image not found" });
        return;
      }

      res.json({ data: image });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to retrieve image" });
    }
  }

  public async deleteImage(req: Request, res: Response): Promise<void> {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : String(rawId);
      const image = await prisma.uploadedImage.findUnique({
        where: { id },
      });

      if (!image) {
        res.status(404).json({ error: "Image not found" });
        return;
      }

      await storageService.delete(image.fileName);
      await prisma.uploadedImage.delete({ where: { id } });

      res.json({ success: true, message: "Image deleted successfully" });
    } catch (err: any) {
      console.error("Delete image error:", err);
      res.status(500).json({ error: "Failed to delete image" });
    }
  }

  public async cropImage(req: Request, res: Response): Promise<void> {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : String(rawId);
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: "No cropped image data received" });
        return;
      }

      const existing = await prisma.uploadedImage.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({ error: "Original image not found" });
        return;
      }

      const outcome = await validationService.processAndValidate(
        file.buffer,
        file.mimetype,
        existing.originalName,
      );

      const { storageUrl } = await storageService.upload(
        outcome.processedBuffer,
        existing.fileName,
        outcome.mimeType,
      );

      const newStatus = outcome.isValid ? "ACCEPTED" : "REJECTED";

      const updated = await prisma.uploadedImage.update({
        where: { id },
        data: {
          storageUrl,
          status: newStatus,
          mimeType: outcome.mimeType,
          width: outcome.width,
          height: outcome.height,
          rejectionReasons: outcome.rejectionReasons,
          failureDetails: {
            ...outcome.metrics,
            rejectionDetails: outcome.rejectionDetails,
          } as any,
          perceptualHash: outcome.metrics.perceptualHash,
          blurScore: outcome.metrics.blurScore,
          faceCount: outcome.metrics.faceCount,
          faceAreaRatio: outcome.metrics.faceAreaRatio,
        },
      });

      res.json({ data: updated });
    } catch (err: any) {
      console.error("Crop re-validation error:", err);
      res.status(500).json({ error: "Failed to process cropped image" });
    }
  }

  public async seedDemoImages(_req: Request, res: Response): Promise<void> {
    try {
      const data = await demoService.seedDemoBatch();
      res.json({
        message: "Demo photos seeded successfully",
        data,
      });
    } catch (err: any) {
      console.error("Seed demo images error:", err);
      res.status(500).json({ error: "Failed to seed demo images" });
    }
  }
}

export const imageController = new ImageController();
