import sharp from "sharp";
import { env } from "../config/env.js";

export interface FaceAnalysisResult {
  faceCount: number;
  faceAreaRatio: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export class FaceService {
  public async analyzeFaces(
    imageBuffer: Buffer,
    originalWidth: number,
    originalHeight: number,
  ): Promise<FaceAnalysisResult> {
    const analysisWidth = 160;
    const analysisHeight = Math.max(
      120,
      Math.round((originalHeight / originalWidth) * analysisWidth),
    );

    const { data } = await sharp(imageBuffer)
      .resize(analysisWidth, analysisHeight, { fit: "fill" })
      .toColorspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });

    const skinMask = new Uint8Array(analysisWidth * analysisHeight);

    for (let i = 0; i < data.length; i += 3) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      const isSkin =
        cb >= 75 &&
        cb <= 135 &&
        cr >= 130 &&
        cr <= 180 &&
        r > 60 &&
        g > 40 &&
        b > 20 &&
        r > g &&
        r > b;

      if (isSkin) {
        skinMask[i / 3] = 1;
      }
    }

    const clusters = this.findConnectedComponents(
      skinMask,
      analysisWidth,
      analysisHeight,
    );

    const validFaces = clusters.filter((c) => {
      const area = c.pixelCount;
      const aspect = c.width / c.height;
      return area > 120 && aspect >= 0.5 && aspect <= 1.8;
    });

    if (validFaces.length === 0) {
      return {
        faceCount: 0,
        faceAreaRatio: 0,
        boundingBox: null,
      };
    }

    validFaces.sort((a, b) => b.pixelCount - a.pixelCount);
    const primary = validFaces[0];

    const boxWidth = (primary.width / analysisWidth) * originalWidth;
    const boxHeight = (primary.height / analysisHeight) * originalHeight;
    const faceArea = boxWidth * boxHeight;
    const totalArea = originalWidth * originalHeight;
    const faceAreaRatio = Number((faceArea / totalArea).toFixed(3));

    return {
      faceCount: validFaces.length,
      faceAreaRatio,
      boundingBox: {
        x: Math.round((primary.minX / analysisWidth) * originalWidth),
        y: Math.round((primary.minY / analysisHeight) * originalHeight),
        width: Math.round(boxWidth),
        height: Math.round(boxHeight),
      },
    };
  }

  private findConnectedComponents(
    mask: Uint8Array,
    width: number,
    height: number,
  ) {
    const visited = new Uint8Array(mask.length);
    const components: Array<{
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      width: number;
      height: number;
      pixelCount: number;
    }> = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (mask[idx] === 0 || visited[idx] === 1) {
          continue;
        }

        let pixelCount = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;

        const queue = [idx];
        visited[idx] = 1;

        while (queue.length > 0) {
          const curr = queue.pop()!;
          pixelCount++;

          const cx = curr % width;
          const cy = Math.floor(curr / width);

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          const neighbors = [
            cy > 0 ? curr - width : -1,
            cy < height - 1 ? curr + width : -1,
            cx > 0 ? curr - 1 : -1,
            cx < width - 1 ? curr + 1 : -1,
          ];

          for (const n of neighbors) {
            if (n >= 0 && mask[n] === 1 && visited[n] === 0) {
              visited[n] = 1;
              queue.push(n);
            }
          }
        }

        components.push({
          minX,
          maxX,
          minY,
          maxY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          pixelCount,
        });
      }
    }

    return components;
  }
}

export const faceService = new FaceService();
