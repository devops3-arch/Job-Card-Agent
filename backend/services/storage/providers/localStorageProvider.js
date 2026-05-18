import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Local storage provider
 * Preserves current upload behavior for development and backward compatibility
 */
export class LocalStorageProvider {
  constructor() {
    this.baseDir = path.join(__dirname, '..', '..', '..');
  }

  /**
   * Upload file to local filesystem
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Target filename
   * @param {string} fileType - 'signature' or 'document'
   * @param {object} options - Additional options
   * @returns {Promise<{url: string, filepath: string, error?: string}>}
   */
  async uploadFile(buffer, filename, fileType, options = {}) {
    try {
      // Get upload path (preserves existing logic)
      const uploadPath = this.getUploadPath(fileType, filename);
      const fullPath = path.join(this.baseDir, uploadPath);

      // Ensure directory exists
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file to disk
      fs.writeFileSync(fullPath, buffer);

      return {
        url: `/${uploadPath}`, // Relative URL for local access
        filepath: uploadPath,
      };
    } catch (error) {
      throw new Error(`Local upload failed: ${error.message}`);
    }
  }

  /**
   * Delete file from local filesystem
   * @param {string} filepath - Relative file path
   * @returns {Promise<boolean>}
   */
  async deleteFile(filepath) {
    try {
      const fullPath = path.join(this.baseDir, filepath);

      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return true;
      }
      return false;
    } catch (error) {
      throw new Error(`Local delete failed: ${error.message}`);
    }
  }

  /**
   * Get public URL for local file
   * @param {string} filepath - Relative file path
   * @returns {string} Public URL
   */
  getFileUrl(filepath) {
    // Return relative URL for local files
    return `/${filepath}`;
  }

  /**
   * Check if local file exists
   * @param {string} filepath - Relative file path
   * @returns {Promise<boolean>}
   */
  async fileExists(filepath) {
    try {
      const fullPath = path.join(this.baseDir, filepath);
      return fs.existsSync(fullPath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get upload path for file type (preserves existing logic)
   * @param {string} fileType - 'signature' or 'document'
   * @param {string} filename - Filename
   * @returns {string} Relative upload path
   */
  getUploadPath(fileType, filename) {
    if (fileType === 'signature') {
      return `uploads/signatures/${filename}`;
    }
    if (fileType === 'document') {
      return `uploads/approved-documents/${filename}`;
    }
    return `uploads/temp/${filename}`;
  }
}