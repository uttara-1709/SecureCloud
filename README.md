# SecureCloud — Cloud Computing Mini Project
A beginner-friendly file-storage web app demonstrating 1 MiB file chunking, AES-256-GCM authenticated encryption, download/reconstruction, and optional Amazon S3 storage.

## Run locally
1. Install Node.js 20+.
2. Extract the ZIP and open the folder containing `package.json` in VS Code.
3. Run `npm install`.
4. Create `.env` from `.env.example`: `Copy-Item .env.example .env`
5. Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
6. Put the generated 64-character value after `ENCRYPTION_KEY_HEX=` in `.env`. Keep it private and backed up.
7. Keep `STORAGE_MODE=local`, save `.env`, and run `npm start`.
8. Open http://localhost:3000.

## Amazon S3 (optional next stage)
Create a private S3 bucket with Block Public Access enabled. Configure AWS credentials through an AWS CLI profile or IAM role. Give the app least-privilege `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` permissions for `securecloud/*`. Set `STORAGE_MODE=s3`, `AWS_REGION`, and `S3_BUCKET_NAME` in `.env`, then restart. Never put long-lived AWS credentials in source code. AWS usage can incur charges.

CloudFront is a separate optional extension for a static portfolio/documentation site. Do not make private encrypted file chunks public.

## Test checklist
- Open `/api/health` and confirm `status: ok`.
- Upload a small text file, download it, and compare contents.
- Upload a file larger than 1 MiB and confirm multiple chunks are listed.
- Delete a file and confirm it disappears.
- Files over 25 MiB should be rejected.

## Limitations
This is a classroom prototype: no user login or per-user authorization; metadata is in a local JSON file; upload size is capped at 25 MiB; plaintext is briefly present in server memory before encryption; do not expose this app publicly as-is. Losing/changing the encryption key makes existing files unrecoverable.
