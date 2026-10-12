import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { prisma } from "../lib/prisma.js";
import { storageService } from "../services/storage.service.js";
import { validationService } from "../services/validation.service.js";

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

      for (const item of initialRecords) {
        (async () => {
          try {
            const outcome = await validationService.processAndValidate(
              item.file.buffer,
              item.file.mimetype,
              item.file.originalname,
            );

            const { storageUrl } = await storageService.upload(
              outcome.processedBuffer,
              item.storageFilename,
              outcome.mimeType,
            );

            const status = outcome.isValid ? "ACCEPTED" : "REJECTED";

            await prisma.uploadedImage.update({
              where: { id: item.record.id },
              data: {
                storageUrl,
                status,
                mimeType: outcome.mimeType,
                width: outcome.width,
                height: outcome.height,
                rejectionReasons: outcome.rejectionReasons,
                failureDetails: outcome.metrics as any,
                perceptualHash: outcome.metrics.perceptualHash,
                blurScore: outcome.metrics.blurScore,
                faceCount: outcome.metrics.faceCount,
                faceAreaRatio: outcome.metrics.faceAreaRatio,
              },
            });
          } catch (processingErr) {
            console.error("Async image processing failure:", processingErr);
            await prisma.uploadedImage.update({
              where: { id: item.record.id },
              data: {
                status: "REJECTED",
                rejectionReasons: [
                  "Processing error occurred during validation",
                ],
              },
            });
          }
        })();
      }
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
          failureDetails: outcome.metrics as any,
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

  public async seedDemoImages(req: Request, res: Response): Promise<void> {
    try {
      const createSyntheticPhoto = async (
        width: number,
        height: number,
        faceRadius: number,
        faceCenterX: number,
        faceCenterY: number,
        blurVal: number,
        secondFace: boolean = false,
      ) => {
        let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#475569" />
              <stop offset="100%" stop-color="#1e293b" />
            </radialGradient>
          </defs>
          <rect width="${width}" height="${height}" fill="url(#bg)" />
          <circle cx="${faceCenterX}" cy="${faceCenterY}" r="${faceRadius}" fill="#e0a97a" />
          <ellipse cx="${faceCenterX}" cy="${faceCenterY + faceRadius * 1.5}" rx="${faceRadius * 1.6}" ry="${faceRadius * 1.8}" fill="#0f172a" />
          <circle cx="${faceCenterX - faceRadius * 0.35}" cy="${faceCenterY - faceRadius * 0.1}" r="${faceRadius * 0.12}" fill="#ffffff" />
          <circle cx="${faceCenterX + faceRadius * 0.35}" cy="${faceCenterY - faceRadius * 0.1}" r="${faceRadius * 0.12}" fill="#ffffff" />
          <circle cx="${faceCenterX - faceRadius * 0.35}" cy="${faceCenterY - faceRadius * 0.1}" r="${faceRadius * 0.06}" fill="#000000" />
          <circle cx="${faceCenterX + faceRadius * 0.35}" cy="${faceCenterY - faceRadius * 0.1}" r="${faceRadius * 0.06}" fill="#000000" />
          <path d="M ${faceCenterX - faceRadius * 0.3} ${faceCenterY + faceRadius * 0.4} Q ${faceCenterX} ${faceCenterY + faceRadius * 0.65} ${faceCenterX + faceRadius * 0.3} ${faceCenterY + faceRadius * 0.4}" stroke="#7c2d12" stroke-width="${faceRadius * 0.08}" fill="none" stroke-linecap="round" />`;

        if (secondFace) {
          svg += `<circle cx="${faceCenterX + faceRadius * 1.8}" cy="${faceCenterY}" r="${faceRadius * 0.8}" fill="#d49b6a" />
            <ellipse cx="${faceCenterX + faceRadius * 1.8}" cy="${faceCenterY + faceRadius * 1.3}" rx="${faceRadius * 1.2}" ry="${faceRadius * 1.5}" fill="#334155" />`;
        }

        svg += `</svg>`;

        let pipeline = sharp(Buffer.from(svg));
        if (blurVal > 0) {
          pipeline = pipeline.blur(blurVal);
        }
        return await pipeline.jpeg({ quality: 90 }).toBuffer();
      };

      const demoSamples = [
        {
          name: "valid-headshot-1.jpg",
          generate: () =>
            createSyntheticPhoto(600, 600, 160, 300, 260, 0, false),
        },
        {
          name: "valid-headshot-2.jpg",
          generate: () =>
            createSyntheticPhoto(640, 640, 170, 320, 270, 0, false),
        },
        {
          name: "blurry-photo.jpg",
          generate: () =>
            createSyntheticPhoto(600, 600, 150, 300, 260, 12, false),
        },
        {
          name: "face-too-far.jpg",
          generate: () =>
            createSyntheticPhoto(800, 800, 45, 400, 300, 0, false),
        },
        {
          name: "multiple-faces-group.jpg",
          generate: () =>
            createSyntheticPhoto(600, 600, 110, 200, 250, 0, true),
        },
      ];

      for (const sample of demoSamples) {
        const buffer = await sample.generate();
        const fileId = uuidv4();
        const storageFilename = `${fileId}-${sample.name}`;

        const outcome = await validationService.processAndValidate(
          buffer,
          "image/jpeg",
          sample.name,
        );

        const { storageUrl } = await storageService.upload(
          outcome.processedBuffer,
          storageFilename,
          outcome.mimeType,
        );

        const status = outcome.isValid ? "ACCEPTED" : "REJECTED";

        await prisma.uploadedImage.create({
          data: {
            id: fileId,
            originalName: sample.name,
            fileName: storageFilename,
            storageUrl,
            mimeType: outcome.mimeType,
            fileSizeBytes: buffer.length,
            width: outcome.width,
            height: outcome.height,
            status,
            rejectionReasons: outcome.rejectionReasons,
            failureDetails: outcome.metrics as any,
            perceptualHash: outcome.metrics.perceptualHash,
            blurScore: outcome.metrics.blurScore,
            faceCount: outcome.metrics.faceCount,
            faceAreaRatio: outcome.metrics.faceAreaRatio,
          },
        });
      }

      const allImages = await prisma.uploadedImage.findMany({
        orderBy: { createdAt: "desc" },
      });

      res.json({
        message: "Demo photos seeded successfully",
        data: allImages,
      });
    } catch (err: any) {
      console.error("Seed demo images error:", err);
      res.status(500).json({ error: "Failed to seed demo images" });
    }
  }
}

export const imageController = new ImageController();
