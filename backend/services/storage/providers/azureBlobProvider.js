import { BlobServiceClient } from '@azure/storage-blob';
import logger from '../../logger/logger.js';

/**
 * Azure Blob Storage provider
 * Production-ready cloud storage with scalability and reliability
 */
export class AzureBlobStorageProvider {
  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

    if (!connectionString) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable is required for Azure storage provider');
    }

    this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

    // Container names from environment
    this.containers = {
      signatures: process.env.AZURE_STORAGE_CONTAINER_SIGNATURES || 'signatures',
      documents: process.env.AZURE_STORAGE_CONTAINER_DOCUMENTS || 'approved-documents',
    };

    // Ensure containers exist
    this.initialization = this.initializeContainers();
  }

  /**
   * Initialize storage containers if they don't exist
   */
  async initializeContainers() {
    try {
      for (const [key, containerName] of Object.entries(this.containers)) {
        const containerClient = this.blobServiceClient.getContainerClient(containerName);
        const exists = await containerClient.exists();

        if (!exists) {
          await containerClient.create({ access: 'blob' }); // Public blob access
          logger.info("Azure container created", {
            eventType: "storage",
            container: containerName,
          });
        }
      }
    } catch (error) {
      logger.error('Azure container initialization failed', {
        eventType: "storage",
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Upload file to Azure Blob Storage
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Target filename
   * @param {string} fileType - 'signature' or 'document'
   * @param {object} options - Additional options
   * @returns {Promise<{url: string, filepath: string, error?: string}>}
   */
  async uploadFile(buffer, filename, fileType, options = {}) {
    try {
      await this.initialization;
      const containerName = this.getContainerName(fileType);
      const containerClient = this.blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlockBlobClient(filename);

      // Upload options
      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: this.getContentType(filename),
        },
        metadata: options.metadata || {},
        tags: options.tags || {},
      };

      // Upload the blob
      await blobClient.upload(buffer, buffer.length, uploadOptions);

      // Generate public URL
      const url = blobClient.url;

      return {
        url,
        filepath: `${containerName}/${filename}`, // Azure-compatible path identifier
      };
    } catch (error) {
      throw new Error(`Azure upload failed: ${error.message}`);
    }
  }

  /**
   * Delete file from Azure Blob Storage
   * @param {string} filepath - Azure blob path (container/filename)
   * @returns {Promise<boolean>}
   */
  async deleteFile(filepath) {
    try {
      await this.initialization;
      const [containerName, blobName] = filepath.split('/');
      const containerClient = this.blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlockBlobClient(blobName);

      const deleteResponse = await blobClient.deleteIfExists();
      return deleteResponse.succeeded;
    } catch (error) {
      throw new Error(`Azure delete failed: ${error.message}`);
    }
  }

  /**
   * Get public URL for Azure blob
   * @param {string} filepath - Azure blob path (container/filename)
   * @returns {string} Public URL
   */
  getFileUrl(filepath) {
    const [containerName, blobName] = filepath.split('/');
    const containerClient = this.blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(blobName);
    return blobClient.url;
  }

  /**
   * Check if Azure blob exists
   * @param {string} filepath - Azure blob path (container/filename)
   * @returns {Promise<boolean>}
   */
  async fileExists(filepath) {
    try {
      await this.initialization;
      const [containerName, blobName] = filepath.split('/');
      const containerClient = this.blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlockBlobClient(blobName);
      const exists = await blobClient.exists();
      return exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get container name for file type
   * @param {string} fileType - 'signature' or 'document'
   * @returns {string} Container name
   */
  getContainerName(fileType) {
    switch (fileType) {
      case 'signature':
        return this.containers.signatures;
      case 'document':
        return this.containers.documents;
      default:
        return 'temp';
    }
  }

  /**
   * Get content type based on file extension
   * @param {string} filename - Filename
   * @returns {string} MIME type
   */
  getContentType(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();

    const contentTypes = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
      'txt': 'text/plain',
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Generate SAS URL for private access (future enhancement)
   * @param {string} filepath - Azure blob path
   * @param {number} expiresInMinutes - Expiration time in minutes
   * @returns {Promise<string>} SAS URL
   */
  async generateSasUrl(filepath, expiresInMinutes = 60) {
    const [containerName, blobName] = filepath.split('/');
    const containerClient = this.blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlockBlobClient(blobName);

    // Generate SAS token (future implementation)
    // const sasToken = await blobClient.generateSasUrl({
    //   permissions: BlobSASPermissions.parse('r'),
    //   expiresOn: new Date(Date.now() + expiresInMinutes * 60 * 1000),
    // });

    return blobClient.url; // Return public URL for now
  }
}