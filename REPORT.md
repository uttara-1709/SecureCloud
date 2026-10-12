# Cloud Computing Mini Project Report
## SecureCloud: Cloud-Based File Storage and Secure File Transfer System

### 1. Aim
To build a file storage application that divides files into blocks, encrypts the blocks, stores them, and reconstructs the original file during download.

### 2. Objectives
- Understand cloud/object storage.
- Implement file chunking and AES-256-GCM authenticated encryption.
- Store, retrieve, decrypt, and reconstruct file chunks.
- Explore Amazon S3 as an optional cloud backend.

### 3. Introduction
Cloud computing provides computing, storage, networking, and software over the Internet. SecureCloud demonstrates secure file storage by splitting each uploaded file into 1 MiB chunks, encrypting each chunk, and storing the encrypted data locally or in Amazon S3.

### 4. Requirements
Hardware: PC/laptop, Core i3 or equivalent, 4 GB RAM recommended. Software: Windows/Linux/macOS, Node.js 20+, npm, VS Code, browser; AWS account and S3 bucket for cloud mode.

### 5. Technologies
HTML, CSS, JavaScript, Node.js, Express, Multer, Node.js Crypto, AWS SDK for JavaScript, Amazon S3 (optional), JSON metadata file.

### 6. Architecture
Browser → Express backend → split into 1 MiB chunks → encrypt each chunk with AES-256-GCM → local storage or private S3 bucket. During download, retrieve chunks in order, authenticate/decrypt, reconstruct, and return the original file.

### 7. Modules
1. Upload: accepts files up to 25 MiB.
2. Chunking: splits files into 1 MiB blocks.
3. Encryption: uses a random 12-byte IV and AES-GCM authentication tag per chunk.
4. Storage: writes encrypted chunks to disk or S3.
5. Metadata: stores file name, size, chunk references, and upload time.
6. Download: decrypts and reconstructs the original.
7. Delete: removes chunks and metadata.

### 8. Algorithm
Upload: select file → assign ID → split into chunks → encrypt each chunk → store chunks → save metadata. Download: read metadata → retrieve chunks in order → authenticate and decrypt → concatenate → verify size → download.

### 9. Test cases
| Test | Expected result |
|---|---|
| Health endpoint | Returns status `ok` |
| Small file upload/download | Original content restored |
| File over 1 MiB | Multiple chunks listed |
| Delete file | File disappears from listing and storage |
| File over 25 MiB | Rejected with size-limit message |
| Wrong encryption key | Decryption fails |
| S3 mode with valid permissions | Encrypted chunks stored/retrieved from S3 |

### 10. Advantages
Chunking, authenticated encryption, simple interface, file reconstruction, and ability to use local storage or Amazon S3.

### 11. Limitations
No login or user-specific access; JSON metadata is intended for a single-instance demo; 25 MiB upload limit; backend briefly receives plaintext in memory; key management is the user's responsibility; AWS can incur charges.

### 12. Result
The application supports file upload, chunking, encryption, storage, download, decryption, reconstruction, and deletion in local mode. S3 mode requires separate AWS configuration.

### 13. Conclusion
SecureCloud demonstrates cloud computing concepts through chunked file storage and authenticated encryption. The optional S3 backend illustrates how encrypted objects can be stored in cloud object storage. Authentication, access control, logging, and secure deployment are future improvements.
