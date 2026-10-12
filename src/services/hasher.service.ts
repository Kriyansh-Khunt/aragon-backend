import sharp from "sharp";
import { env } from "../config/env.js";

export class HasherService {
  public async computeDHash(imageBuffer: Buffer): Promise<string> {
    const rawBuffer = await sharp(imageBuffer)
      .resize(9, 8, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer();

    let hexHash = "";
    let byteVal = 0;
    let bitCount = 0;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const leftIdx = row * 9 + col;
        const rightIdx = row * 9 + (col + 1);

        const leftPixel = rawBuffer[leftIdx];
        const rightPixel = rawBuffer[rightIdx];

        const bit = leftPixel > rightPixel ? 1 : 0;
        byteVal = (byteVal << 1) | bit;
        bitCount++;

        if (bitCount === 4) {
          hexHash += byteVal.toString(16);
          byteVal = 0;
          bitCount = 0;
        }
      }
    }

    return hexHash;
  }

  public calculateHammingDistance(hashA: string, hashB: string): number {
    if (hashA.length !== hashB.length) {
      return 64;
    }

    let distance = 0;
    for (let i = 0; i < hashA.length; i++) {
      const valA = Number.parseInt(hashA[i], 16);
      const valB = Number.parseInt(hashB[i], 16);
      let xorVal = valA ^ valB;

      while (xorVal > 0) {
        distance += xorVal & 1;
        xorVal >>= 1;
      }
    }

    return distance;
  }

  public findDuplicate(
    candidateHash: string,
    existingHashes: Array<{ id: string; hash: string }>,
  ): { isDuplicate: boolean; matchedImageId?: string; distance: number } {
    let minDistance = 64;
    let matchedId: string | undefined;

    for (const item of existingHashes) {
      if (!item.hash) {
        continue;
      }
      const dist = this.calculateHammingDistance(candidateHash, item.hash);
      if (dist < minDistance) {
        minDistance = dist;
        matchedId = item.id;
      }
      if (dist <= env.HAMMING_DISTANCE_THRESHOLD) {
        return { isDuplicate: true, matchedImageId: item.id, distance: dist };
      }
    }

    return {
      isDuplicate: false,
      matchedImageId: matchedId,
      distance: minDistance,
    };
  }
}

export const hasherService = new HasherService();
