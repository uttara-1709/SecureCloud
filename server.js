
require("dotenv").config();

const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MODE = (process.env.STORAGE_MODE || "local").toLowerCase();
const CHUNK = 1024 * 1024;
const MAX_UPLOAD = 25 * 1024 * 1024;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "securecloud-files";

const ROOT = path.join(__dirname, "data");
const OBJECTS = path.join(ROOT, "objects");
const META = path.join(ROOT, "metadata.json");

fs.mkdirSync(OBJECTS, { recursive: true });
if (!fs.existsSync(META)) fs.writeFileSync(META, "[]");

const hex = process.env.ENCRYPTION_KEY_HEX || "";

if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
  console.error("Set ENCRYPTION_KEY_HEX to a 64-character hex key in .env");
  process.exit(1);
}

const key = Buffer.from(hex, "hex");
const useS3 = MODE === "s3";
const useSupabase = MODE === "supabase";

if (
  useSupabase &&
  (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY are required in .env");
  process.exit(1);
}

if (useS3 && !process.env.S3_BUCKET_NAME) {
  console.error("S3_BUCKET_NAME is required in S3 mode");
  process.exit(1);
}

const s3 = useS3
  ? new S3Client({ region: process.env.AWS_REGION || "ap-south-1" })
  : null;

const supabase = useSupabase
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD },
});

app.use(express.static(path.join(__dirname, "public")));

const read = () => {
  try {
    return JSON.parse(fs.readFileSync(META, "utf8"));
  } catch {
    return [];
  }
};

const write = (items) =>
  fs.writeFileSync(META, JSON.stringify(items, null, 2));

const safe = (name) =>
  path.basename(name || "download.bin")
    .replace(/[^\w.\- ()]/g, "_")
    .slice(0, 150) || "download.bin";

const obj = (id, index) =>
  `securecloud/${id}/chunk-${String(index).padStart(6, "0")}.bin`;

function encrypt(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(buffer),
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

function decrypt(buffer) {
  if (buffer.length < 28) {
    throw new Error("Invalid encrypted chunk");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    buffer.subarray(0, 12)
  );

  decipher.setAuthTag(buffer.subarray(12, 28));

  return Buffer.concat([
    decipher.update(buffer.subarray(28)),
    decipher.final(),
  ]);
}

async function put(objectKey, buffer) {
  if (useS3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: objectKey,
        Body: buffer,
        ContentType: "application/octet-stream",
        ServerSideEncryption: "AES256",
      })
    );
    return;
  }

  if (useSupabase) {
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(objectKey, buffer, {
        contentType: "application/octet-stream",
        upsert: false,
      });

    if (error) throw error;
    return;
  }

  const filePath = path.join(
    OBJECTS,
    objectKey.replaceAll("/", path.sep)
  );

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

async function get(objectKey) {
  if (useS3) {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: objectKey,
      })
    );

    const chunks = [];
    for await (const part of result.Body) {
      chunks.push(Buffer.from(part));
    }

    return Buffer.concat(chunks);
  }

  if (useSupabase) {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .download(objectKey);

    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }

  return fs.readFileSync(
    path.join(OBJECTS, objectKey.replaceAll("/", path.sep))
  );
}

async function del(objectKey) {
  if (useS3) {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: objectKey,
      })
    );
    return;
  }

  if (useSupabase) {
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove([objectKey]);

    if (error) throw error;
    return;
  }

  const filePath = path.join(
    OBJECTS,
    objectKey.replaceAll("/", path.sep)
  );

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

const view = (file) => ({
  id: file.id,
  name: file.name,
  size: file.size,
  chunkCount: file.chunks.length,
  uploadedAt: file.uploadedAt,
  storage: MODE,
});

app.get("/api/health", (_, res) => {
  res.json({
    status: "ok",
    storage: MODE,
    chunkSizeBytes: CHUNK,
    maxUploadBytes: MAX_UPLOAD,
  });
});

app.get("/api/files", (_, res) => {
  res.json(read().map(view));
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Choose a file first" });
  }

  const id = crypto.randomUUID();
  const name = safe(req.file.originalname);
  const buffer = req.file.buffer;
  const chunks = [];

  try {
    const count = Math.max(1, Math.ceil(buffer.length / CHUNK));

    for (let index = 0; index < count; index++) {
      const objectKey = obj(id, index);
      const part = buffer.subarray(
        index * CHUNK,
        Math.min((index + 1) * CHUNK, buffer.length)
      );

      await put(objectKey, encrypt(part));
      chunks.push({ key: objectKey, index });
    }

    const file = {
      id,
      name,
      size: buffer.length,
      chunks,
      uploadedAt: new Date().toISOString(),
    };

    const files = read();
    files.push(file);
    write(files);

    res.status(201).json({
      message: "File encrypted, split into chunks, and stored successfully.",
      file: view(file),
    });
  } catch (error) {
    await Promise.allSettled(chunks.map((chunk) => del(chunk.key)));
    console.error(error);

    res.status(500).json({
      error: "Upload failed. Check storage configuration and bucket permissions.",
    });
  }
});

app.get("/api/files/:id/download", async (req, res) => {
  const file = read().find((item) => item.id === req.params.id);

  if (!file) {
    return res.status(404).json({ error: "File not found" });
  }

  try {
    const parts = [];

    for (const chunk of [...file.chunks].sort(
      (a, b) => a.index - b.index
    )) {
      parts.push(decrypt(await get(chunk.key)));
    }

    const buffer = Buffer.concat(parts);

    if (buffer.length !== file.size) {
      throw new Error("File size mismatch");
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safe(file.name).replace(/["\\]/g, "_")}"`
    );

    res.send(buffer);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Download/decryption failed. Check encryption key and stored chunks.",
    });
  }
});

app.delete("/api/files/:id", async (req, res) => {
  const files = read();
  const file = files.find((item) => item.id === req.params.id);

  if (!file) {
    return res.status(404).json({ error: "File not found" });
  }

  try {
    await Promise.all(file.chunks.map((chunk) => del(chunk.key)));
    write(files.filter((item) => item.id !== file.id));

    res.json({ message: "File and chunks deleted." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Delete failed" });
  }
});

app.use((error, _, res, next) => {
  if (
    error instanceof multer.MulterError &&
    error.code === "LIMIT_FILE_SIZE"
  ) {
    return res.status(413).json({
      error: "Maximum file size is 25 MiB",
    });
  }

  console.error(error);
  res.status(500).json({ error: "Unexpected server error" });
});

app.listen(PORT, () => {
  console.log(
    `SecureCloud running at http://localhost:${PORT}\n` +
    `Storage mode: ${MODE}; maximum upload: 25 MiB`
  );
});
