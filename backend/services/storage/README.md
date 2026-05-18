# Storage Service Architecture

This directory contains a production-grade storage abstraction layer that supports multiple storage providers while maintaining backward compatibility.

## Architecture Overview

```
services/storage/
├── storageService.js          # Main abstraction layer
└── providers/
    ├── localStorageProvider.js    # Local filesystem storage
    └── azureBlobProvider.js       # Azure Blob Storage
```

## Configuration

Set the storage provider via environment variables:

```bash
# Development (default)
STORAGE_PROVIDER=local

# Production (Azure Blob Storage)
STORAGE_PROVIDER=azure
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_STORAGE_CONTAINER_SIGNATURES=signatures
AZURE_STORAGE_CONTAINER_DOCUMENTS=approved-documents
```

## API Reference

### StorageService

The main service provides a unified interface across all providers:

```javascript
import storageService from './services/storage/storageService.js';

// Upload a file
const result = await storageService.uploadFile(buffer, filename, fileType, options);
// Returns: { url: string, filepath: string } or { error: string }

// Get public URL
const url = storageService.getFileUrl(filepath);

// Check if file exists
const exists = await storageService.fileExists(filepath);

// Delete file
const deleted = await storageService.deleteFile(filepath);
```

### File Types

- `signature`: User signature images (PNG, JPG, etc.)
- `document`: Approved PDF documents

## Provider Details

### Local Storage Provider

- **Purpose**: Development and backward compatibility
- **Storage**: Local filesystem under `uploads/` directory
- **URLs**: Relative paths (e.g., `/uploads/signatures/filename.png`)
- **Features**: Full compatibility with existing upload system

### Azure Blob Storage Provider

- **Purpose**: Production cloud storage
- **Storage**: Azure Blob Storage containers
- **URLs**: Public Azure Blob URLs
- **Features**:
  - Automatic container creation
  - Content-type detection
  - Scalable and reliable
  - Future-ready for SAS tokens and CDN

## Migration Guide

### From Local to Azure

1. Set environment variables:
   ```bash
   STORAGE_PROVIDER=azure
   AZURE_STORAGE_CONNECTION_STRING=...
   AZURE_STORAGE_CONTAINER_SIGNATURES=signatures
   AZURE_STORAGE_CONTAINER_DOCUMENTS=approved-documents
   ```

2. Restart the application

3. Existing database URLs remain valid (they point to the new Azure locations)

4. No frontend changes required

### Backward Compatibility

- All existing upload functionality preserved
- Database schema unchanged
- API responses unchanged
- Local development unaffected

## Future Enhancements

The architecture supports future extensions:

- **S3 Provider**: AWS S3 storage
- **CDN Integration**: Content delivery networks
- **Signed URLs**: Time-limited access tokens
- **File Versioning**: Version control for documents
- **Retention Policies**: Automatic cleanup

## Security Considerations

- Azure provider uses public blob access by default
- SAS token support ready for private access
- File paths are abstracted to prevent direct access
- Content-type validation maintained

## Development Logging

Debug logs are shown in development mode:

```
[STORAGE] Using local provider
[STORAGE] File uploaded: filename.png (1234 bytes)
[STORAGE] File deleted: uploads/signatures/filename.png
```

## Testing

The storage service includes comprehensive error handling and maintains business logic isolation - storage failures never break core application functionality.