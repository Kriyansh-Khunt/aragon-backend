import sharp from "sharp";
import { VALIDATION_LIMITS } from "../constants/index.js";

export class BlurService {
  private readonly laplacianKernel = {
    width: 3,
    height: 3,
    kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
  };

  public async computeLaplacianVariance(imageBuffer: Buffer): Promise<{
    variance: number;
    isBlurry: boolean;
  }> {
    const { data } = await sharp(imageBuffer)
      .resize(600, null, { withoutEnlargement: true })
      .greyscale()
      .convolve(this.laplacianKernel)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const totalPixels = data.length;
    if (totalPixels === 0) {
      return { variance: 0, isBlurry: true };
    }

    let sum = 0;
    for (let i = 0; i < totalPixels; i++) {
      sum += data[i];
    }
    const mean = sum / totalPixels;

    let squaredDiffSum = 0;
    for (let i = 0; i < totalPixels; i++) {
      const diff = data[i] - mean;
      squaredDiffSum += diff * diff;
    }

    const variance = Number((squaredDiffSum / totalPixels).toFixed(2));
    const isBlurry = variance < VALIDATION_LIMITS.BLUR_THRESHOLD;

    return { variance, isBlurry };
  }
}

export const blurService = new BlurService();
