import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { prisma } from "../lib/prisma.js";
import { storageService } from "./storage.service.js";
import { validationService } from "./validation.service.js";

export class DemoService {
  private async buildSyntheticBuffer(
    width: number,
    height: number,
    faceRadius: number,
    faceX: number,
    faceY: number,
    blurSigma: number,
    hasSecondFace: boolean,
  ): Promise<Buffer> {
    let secondFaceSvg = "";
    if (hasSecondFace) {
      secondFaceSvg = `
        <circle cx="${faceX + 360}" cy="${faceY}" r="${faceRadius}" fill="#e0a97a" />
        <ellipse cx="${faceX + 360}" cy="${faceY + faceRadius * 1.4}" rx="${faceRadius * 1.3}" ry="${faceRadius * 1.6}" fill="#334155" />
      `;
    }

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="#1e293b" />
        <ellipse cx="${faceX}" cy="${faceY + faceRadius * 1.4}" rx="${faceRadius * 1.3}" ry="${faceRadius * 1.6}" fill="#0f172a" />
        <circle cx="${faceX}" cy="${faceY}" r="${faceRadius}" fill="#e0a97a" />
        <circle cx="${faceX - faceRadius * 0.35}" cy="${faceY - faceRadius * 0.1}" r="${faceRadius * 0.12}" fill="#ffffff" />
        <circle cx="${faceX + faceRadius * 0.35}" cy="${faceY - faceRadius * 0.1}" r="${faceRadius * 0.12}" fill="#ffffff" />
        <circle cx="${faceX - faceRadius * 0.35}" cy="${faceY - faceRadius * 0.1}" r="${faceRadius * 0.06}" fill="#000000" />
        <circle cx="${faceX + faceRadius * 0.35}" cy="${faceY - faceRadius * 0.1}" r="${faceRadius * 0.06}" fill="#000000" />
        <path d="M ${faceX - faceRadius * 0.3} ${faceY + faceRadius * 0.4} Q ${faceX} ${faceY + faceRadius * 0.65} ${faceX + faceRadius * 0.3} ${faceY + faceRadius * 0.4}" stroke="#7c2d12" stroke-width="${faceRadius * 0.08}" fill="none" stroke-linecap="round" />
        ${secondFaceSvg}
      </svg>
    `;

    const svgBuf = await sharp(Buffer.from(svg)).png().toBuffer();

    const noiseBuf = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 128, g: 128, b: 128, alpha: 1 },
        noise: { type: "gaussian", mean: 128, sigma: 18 },
      },
    })
      .png()
      .toBuffer();

    let compositePipeline = sharp(svgBuf).composite([
      { input: noiseBuf, blend: "soft-light" },
    ]);

    if (blurSigma > 0) {
      compositePipeline = compositePipeline.blur(blurSigma);
    }

    return compositePipeline.jpeg({ quality: 90 }).toBuffer();
  }

  public async seedDemoBatch() {
    await prisma.uploadedImage.deleteMany({});

    const demoDefinitions = [
      {
        name: "valid-portrait-1.jpg",
        build: () =>
          this.buildSyntheticBuffer(600, 600, 150, 300, 260, 0, false),
      },
      {
        name: "valid-portrait-2.jpg",
        build: () =>
          this.buildSyntheticBuffer(640, 640, 160, 320, 280, 0, false),
      },
      {
        name: "blurry-photo.jpg",
        build: () =>
          this.buildSyntheticBuffer(600, 600, 150, 300, 260, 16, false),
      },
      {
        name: "face-too-far.jpg",
        build: () =>
          this.buildSyntheticBuffer(800, 800, 35, 400, 300, 0, false),
      },
      {
        name: "multiple-faces-group.jpg",
        build: () =>
          this.buildSyntheticBuffer(900, 600, 110, 220, 260, 0, true),
      },
    ];

    for (const def of demoDefinitions) {
      const buffer = await def.build();
      const fileId = uuidv4();
      const storageFilename = `${fileId}-${def.name}`;

      const outcome = await validationService.processAndValidate(
        buffer,
        "image/jpeg",
        def.name,
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
          originalName: def.name,
          fileName: storageFilename,
          storageUrl,
          mimeType: outcome.mimeType,
          fileSizeBytes: buffer.length,
          width: outcome.width,
          height: outcome.height,
          status,
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
    }

    return prisma.uploadedImage.findMany({
      orderBy: { createdAt: "desc" },
    });
  }
}

export const demoService = new DemoService();
