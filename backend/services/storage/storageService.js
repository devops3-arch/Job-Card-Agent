import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { LocalStorageProvider } from './providers/localStorageProvider.js';
import { AzureBlobStorageProvider } from './providers/azureBlobProvider.js';
import logger from '../logger/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage provider types
const PROVIDER_TYPES = {
  LOCAL: 'local',
  AZURE: 'azure',
};

// Get configured storage provider
function getStorageProvider() {
  const providerType = process.env.STORAGE_PROVIDER || PROVIDER_TYPES.LOCAL;

  logger.info("Storage provider initialized", {
    eventType: "storage",
    provider: providerType,
  });

  switch (providerType) {
    case PROVIDER_TYPES.AZURE:
      return new AzureBlobStorageProvider();
    case PROVIDER_TYPES.LOCAL:
    default:
      return new LocalStorageProvider();
  }
}

// Global provider instance
let storageProvider = getStorageProvider();

/**
 * Unified storage service interface
 * Abstracts file operations across different storage providers
 */
export class StorageService {
  constructor() {
    this.provider = storageProvider;
  }

  /**
   * Upload file to storage
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Target filename
   * @param {string} fileType - 'signature' or 'document'
   * @param {object} options - Additional options
   * @returns {Promise<{url: string, filepath: string, error?: string}>}
   */
  async uploadFile(buffer, filename, fileType, options = {}) {
    try {
      const result = await this.provider.uploadFile(buffer, filename, fileType, options);
      console.log('[storageService.uploadFile] result:', { filename, fileType, url: result.url, filepath: result.filepath });

      logger.info("File uploaded successfully", {
        eventType: "storage",
        operation: "upload",
        filename,
        fileType,
        size: buffer.length,
        filepath: result.filepath,
      });

      return result;
    } catch (error) {
      logger.error("File upload failed", {
        eventType: "storage",
        operation: "upload",
        filename,
        fileType,
        error: error.message,
      });
      return { error: `Upload failed: ${error.message}` };
    }
  }

  /**
   * Delete file from storage
   * @param {string} filepath - File path/identifier
   * @returns {Promise<boolean>}
   */
  async deleteFile(filepath) {
    try {
      const result = await this.provider.deleteFile(filepath);

      logger.info("File deleted successfully", {
        eventType: "storage",
        operation: "delete",
        filepath,
        success: result,
      });

      return result;
    } catch (error) {
      logger.error("File delete failed", {
        eventType: "storage",
        operation: "delete",
        filepath,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get public URL for file
   * @param {string} filepath - File path/identifier
   * @returns {string} Public URL
   */
  getFileUrl(filepath) {
    return this.provider.getFileUrl(filepath);
  }

  /**
   * Check if file exists
   * @param {string} filepath - File path/identifier
   * @returns {Promise<boolean>}
   */
  async fileExists(filepath) {
    try {
      return await this.provider.fileExists(filepath);
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export default new StorageService();