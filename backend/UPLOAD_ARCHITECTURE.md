# Upload Architecture

Enterprise-grade secure file upload system for Node.js + Express + PostgreSQL backend.

## Overview

This upload architecture provides:
- Secure file handling with multer
- Filename sanitization and unique naming
- MIME type validation
- File size enforcement
- Path traversal prevention
- Audit logging integration
- Future Azure Blob Storage compatibility

## Folder Structure

```
backend/
├── uploads/
│   ├── signatures/        # User signature images
│   ├── approved-documents/ # Approved PDF documents
│   └── temp/              # Temporary uploads (cleanup required)
├── middleware/
│   └── upload.js          # Multer configuration & handlers
├── utils/
│   └── uploadHelpers.js   # Validation & utility functions
└── services/
    ├── signatureService.js
    └── pdfGovernanceService.js
```

## File Type Rules

### Signatures
- **Allowed MIME types**: `image/png`, `image/jpeg`, `image/webp`
- **Max size**: 2MB
- **Extensions**: `.png`, `.jpg`, `.jpeg`, `.webp`
- **Validation**: MIME type, file size, extension match

### Approved Documents
- **Allowed MIME types**: `application/pdf`
- **Max size**: 10MB
- **Extensions**: `.pdf`
- **Validation**: MIME type, file size, extension

## Filename Strategy

Filenames are generated using:
```
{fileType}_{userId}_{timestamp}_{randomSuffix}.{ext}
```

Example:
```
signature_1_1714939393_a7f3k9m2.png
document_42_1714939393_f2e1d3c4.pdf
```

This prevents:
- Filename collisions
- Path traversal attacks
- Predictable file paths
- Duplicate uploads

## API Endpoints

### Upload Signature (Manager)
```http
POST /signatures/manager
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body:
- signature: <image file>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Manager Name",
    "email": "manager@example.com",
    "signature_url": "/uploads/signatures/signature_1_1714939393_a7f3k9m2.png",
    "signature_uploaded_at": "2026-05-09T10:30:00Z"
  }
}
```

### Upload Signature (Engineer)
```http
POST /signatures/engineer
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body:
- signature: <image file>
```

Same response format as `/signatures/manager`.

### Upload Approved Document
```http
POST /approved-documents
Content-Type: multipart/form-data
Authorization: Bearer <token> (manager only)

Body:
- document: <PDF file>
- job_id: <number>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "job_id": 123,
    "pdf_url": "/uploads/approved-documents/document_42_1714939393_f2e1d3c4.pdf",
    "generated_by": 42,
    "generated_at": "2026-05-09T10:30:00Z",
    "is_locked": true,
    "version": 1,
    "approval_snapshot": {
      "job_id": 123,
      "status": "APPROVED",
      "uploaded_by": {...},
      "uploaded_at": "2026-05-09T10:30:00Z"
    }
  }
}
```

### Retrieve Approved Documents
```http
GET /approved-documents/job/:id
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "job_id": 123,
      "pdf_url": "/uploads/approved-documents/document_42_1714939393_f2e1d3c4.pdf",
      "is_locked": true,
      "version": 1,
      "approval_snapshot": {...}
    }
  ]
}
```

## Error Handling

All upload errors return standardized error format:

```json
{
  "success": false,
  "error": "Error message"
}
```

### Common Errors

| Error | HTTP Status | Cause |
|-------|-------------|-------|
| `No file provided` | 400 | Missing file in request |
| `Invalid file type. Allowed: PNG, JPEG, WebP` | 400 | Wrong MIME type for signature |
| `Only PDF files are allowed` | 400 | Non-PDF for document upload |
| `File size exceeds 2MB limit` | 400 | Signature too large |
| `File size exceeds 10MB limit` | 400 | Document too large |
| `File extension does not match file type` | 400 | Extension doesn't match MIME |
| `Failed to save file` | 500 | Disk write error |

## Security Features

### Filename Sanitization
- Removes path traversal attempts (`..`, `/`, `\`)
- Removes null bytes and control characters
- Removes invalid filename characters (`<>:"|?*`)
- Trims to 255 characters

### MIME Type Validation
- Strict whitelist of allowed types
- Validates extension matches MIME type
- Rejects SVG, executables, scripts

### Size Limits
- Signatures: 2MB (multer enforced)
- Documents: 10MB (multer enforced)
- Payload: 2MB (express limits)

### Access Control
- Signature upload: authenticated + role-based (manager/engineer)
- Document upload: authenticated + manager-only
- All requests logged to audit_logs

### Path Traversal Prevention
- Unique filenames prevent directory traversal
- Files stored in dedicated upload directories
- No user input in file paths
- Static serving with express.static()

## Audit Logging

All uploads are tracked in `audit_logs`:

```sql
SELECT * FROM audit_logs 
WHERE action_type = 'Signature Upload' 
  OR action_type = 'Approved Document Upload';
```

Logged data includes:
- user_id, user_name, user_role
- action_type, entity_type, entity_id
- old_values, new_values (including upload path and file size)
- endpoint, method, ip_address
- created_at timestamp

## Development Logging

When `NODE_ENV=development`, upload operations log debug messages:

```
[UPLOAD] Signature validated: image/png, 51234 bytes
[UPLOAD] File saved: uploads/signatures/signature_1_1714939393_a7f3k9m2.png (51234 bytes)
[UPLOAD] Signature upload failed: Invalid file type
[UPLOAD] Oversized document rejected: 12000000 bytes
```

## Storage Location

### Local Storage (Current)
Files stored at:
```
backend/
├── uploads/
│   ├── signatures/signature_*.{png,jpg,jpeg,webp}
│   ├── approved-documents/document_*.pdf
│   └── temp/
```

### Future Azure Blob Storage
Replace local storage with Azure without route rewrites:

```javascript
// middleware/upload.js would use Azure SDK
const azureStorage = azure.storage.getAzureBlockBlobClient();
await azureStorage.uploadBlockBlob(blobPath, fileBuffer);
```

Route code remains unchanged - upload path resolution is abstracted.

## Implementation Notes

### Why Memory Storage + Disk Save
- Multer's memory storage validates file during upload
- Allows custom filename generation before saving
- Enables file hash calculation for integrity checks
- Supports future abstraction to cloud storage

### Why Timestamps + Random Suffix
- Prevents collisions for concurrent uploads
- Makes files unpredictable (security)
- Timestamp enables sorting/cleanup by age
- Random suffix adds entropy

### Why JSONB approval_snapshot
- Immutable record of who approved what and when
- Survives future user/job data changes
- Enables audit trails and compliance reporting
- Prevents approval flow tampering

## Testing

### Signature Upload
```bash
curl -X POST http://localhost:5000/signatures/manager \
  -H "Authorization: Bearer <token>" \
  -F "signature=@/path/to/signature.png"
```

### Document Upload
```bash
curl -X POST http://localhost:5000/approved-documents \
  -H "Authorization: Bearer <token>" \
  -F "document=@/path/to/approved.pdf" \
  -F "job_id=123"
```

## Future Enhancements

1. **File Cleanup**: Implement job scheduled cleanup for temp uploads
2. **Azure Integration**: Replace local storage with Azure Blob
3. **CDN**: Serve signed URLs from Azure CDN
4. **Compression**: Optimize PDFs before storage
5. **Preview**: Generate image thumbnails for signatures
6. **Versioning**: Support multiple document versions per job
7. **Encryption**: Encrypt files at rest using Azure Key Vault
8. **Scanning**: Integrate antivirus scanning for uploads

## Compliance & Governance

- All uploads tied to user identity via audit_logs
- Approved documents immutable (is_locked=true)
- Approval snapshots preserve governance state
- File hashes enable integrity verification
- RBAC enforced at route level
- Full traceability for compliance audits
