import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

dotenv.config({ path: path.resolve(dirname, "../../.env") });

export const env = {
  PORT: Number.parseInt(process.env.PORT || "5000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  DATABASE_URL: process.env.DATABASE_URL || "",
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_KEY: process.env.SUPABASE_KEY || "",
  SUPABASE_BUCKET: process.env.SUPABASE_BUCKET || "headshot-uploads",
  UPLOAD_DIR: path.resolve(dirname, "../../uploads"),
  MAX_FILE_SIZE_MB: 25,
  MIN_WIDTH: 512,
  MIN_HEIGHT: 512,
  MIN_FILE_SIZE_BYTES: 30720,
  BLUR_THRESHOLD: 120,
  MIN_FACE_AREA_RATIO: 0.12,
  HAMMING_DISTANCE_THRESHOLD: 5,
};
