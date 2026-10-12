import sharp from "sharp";
import { CASCADE_BASE64 } from "./facefinder.data.js";
import {
  unpackCascade,
  runCascade,
  clusterDetections,
} from "./cascade.engine.js";

const cascadeBytes = new Uint8Array(Buffer.from(CASCADE_BASE64, "base64"));
const classifyRegionClosure = unpackCascade(cascadeBytes);

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
    const targetWidth = 480;
    const targetHeight = Math.max(
      120,
      Math.round((originalHeight / originalWidth) * targetWidth),
    );

    const { data: grayData } = await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const image = {
      pixels: new Uint8Array(grayData),
      nrows: targetHeight,
      ncols: targetWidth,
      ldim: targetWidth,
    };

    const params = {
      shiftfactor: 0.1,
      minsize: 24,
      maxsize: Math.min(targetWidth, targetHeight),
      scalefactor: 1.1,
    };

    let rawDets = runCascade(image, classifyRegionClosure, params);
    rawDets = clusterDetections(rawDets, 0.2);

    const confidentDets = rawDets.filter((d: number[]) => d[3] > 8.0);

    if (confidentDets.length === 0) {
      return {
        faceCount: 0,
        faceAreaRatio: 0,
        boundingBox: null,
      };
    }

    confidentDets.sort((a: number[], b: number[]) => b[3] - a[3]);
    const primary = confidentDets[0];

    const scale = originalWidth / targetWidth;
    const r = primary[0] * scale;
    const c = primary[1] * scale;
    const s = primary[2] * scale;

    const headSize = s * 1.35;
    const faceArea = headSize * headSize;
    const totalArea = originalWidth * originalHeight;
    const faceAreaRatio = Number((faceArea / totalArea).toFixed(3));

    return {
      faceCount: confidentDets.length,
      faceAreaRatio,
      boundingBox: {
        x: Math.max(0, Math.round(c - headSize / 2)),
        y: Math.max(0, Math.round(r - headSize / 2)),
        width: Math.round(headSize),
        height: Math.round(headSize),
      },
    };
  }
}

export const faceService = new FaceService();
