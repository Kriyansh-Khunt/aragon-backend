import fs from "node:fs/promises";
import path from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export class StorageService {
  private supabase: SupabaseClient | null = null;

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
      this.ensureSupabaseBucket();
    } else {
      this.ensureLocalDir();
    }
  }

  private async ensureLocalDir(): Promise<void> {
    try {
      await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
    } catch (error) {
      console.error("Local storage directory creation error:", error);
    }
  }

  private async ensureSupabaseBucket(): Promise<void> {
    if (!this.supabase) {
      return;
    }
    try {
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const bucketExists = buckets?.some((b) => b.name === env.SUPABASE_BUCKET);
      if (!bucketExists) {
        await this.supabase.storage.createBucket(env.SUPABASE_BUCKET, {
          public: true,
        });
      }
    } catch (error) {
      console.warn("Supabase bucket initialization warning:", error);
    }
  }

  public async upload(
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<{ storageUrl: string; storageKey: string }> {
    if (this.supabase) {
      try {
        const { error } = await this.supabase.storage
          .from(env.SUPABASE_BUCKET)
          .upload(filename, buffer, {
            contentType: mimeType,
            upsert: true,
          });

        if (!error) {
          const { data } = this.supabase.storage
            .from(env.SUPABASE_BUCKET)
            .getPublicUrl(filename);
          return { storageUrl: data.publicUrl, storageKey: filename };
        }
      } catch (uploadError) {
        console.warn(
          "Supabase upload failed, falling back to local storage:",
          uploadError,
        );
      }
    }

    await this.ensureLocalDir();
    const filePath = path.join(env.UPLOAD_DIR, filename);
    await fs.writeFile(filePath, buffer);
    const storageUrl = `/uploads/${filename}`;
    return { storageUrl, storageKey: filename };
  }

  public async delete(storageKey: string): Promise<void> {
    if (this.supabase) {
      try {
        await this.supabase.storage
          .from(env.SUPABASE_BUCKET)
          .remove([storageKey]);
      } catch (error) {
        console.warn("Supabase file removal error:", error);
      }
    }

    try {
      const filePath = path.join(env.UPLOAD_DIR, storageKey);
      await fs.unlink(filePath);
    } catch {
      return;
    }
  }
}

export const storageService = new StorageService();
