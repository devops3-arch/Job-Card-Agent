/**
 * Upload Middleware
 * Secure file upload handling with multer
 * Supports local storage and future Azure Blob compatibility
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from '../services/logger/logger.js';
import {
  generateSecureFilename,
  sanitizeFilename,
  validateSignatureFile,
  validateDocumentFile,
  getUploadPath,
} from '../utils/uploadHelpers.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ensure upload directories exist
 */
function ensureUploadDirs() {
  const dirs = [
    'uploads',
    'uploads/signatures',
    'uploads/approved-documents',
    'uploads/temp',
  ];

  dirs.forEach((dir) => {
    const fullPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
}

ensureUploadDirs();

/**
 * Storage configuration for multer
 * Uses memory storage for validation, then saves to disk
 */
const memoryStorage = multer.memoryStorage();

/**
 * Signature upload middleware
 * - Accepts single PNG, JPEG, or WebP file
 * - Max 2MB
 * - Field name: 'signature'
 */
export const signatureUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter: (req, file, cb) => {
    // Validate file
    const validation = validateSignatureFile(file);
    if (!validation.valid) {
      return cb(new Error(validation.error));
    }
    cb(null, true);
  },
}).single('signature');

/**
 * Document upload middleware
 * - Accepts single PDF file
 * - Max 10MB
 * - Field name: 'document'
 */
export const documentUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Validate file
    const validation = validateDocumentFile(file);
    if (!validation.valid) {
      return cb(new Error(validation.error));
    }
    cb(null, true);
  },
}).single('document');

/**
 * Save uploaded file to disk
 * Generates secure filename and stores in appropriate directory
 *
 * @param {object} file - Multer file object
 * @param {number} userId - User ID
 * @param {string} fileType - 'signature' or 'document'
 * @returns {object} { filename, filepath, url, error? }
 */
export function saveUploadedFile(file, userId, fileType) {
  if (!file) {
    return { error: 'No file provided' };
  }

  try {
    // Generate secure filename
    const filename = generateSecureFilename(userId, fileType, file.originalname);

    // Get upload path
    const uploadPath = getUploadPath(fileType, filename);
    const fullPath = path.join(
      path.dirname(__filename),
      '..',
      uploadPath
    );

    // Write file to disk
    fs.writeFileSync(fullPath, file.buffer);

    logger.info("File saved to local storage", {
      eventType: "upload",
      operation: "save",
      filename,
      filepath: uploadPath,
      size: file.size,
    });

    return {
      filename,
      filepath: uploadPath,
      url: `/${uploadPath}`, // Relative URL for storage
      size: file.size,
    };
  } catch (error) {
    logger.error("File save failed", {
      eventType: "upload",
      operation: "save",
      filename,
      error: error.message,
    });
    return { error: `Failed to save file: ${error.message}` };
  }
}

/**
 * Delete uploaded file from disk
 *
 * @param {string} filepath - Relative file path
 * @returns {boolean} Success status
 */
export function deleteUploadedFile(filepath) {
  try {
    const fullPath = path.join(
      path.dirname(__filename),
      '..',
      filepath
    );

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      logger.info("File deleted from local storage", {
        eventType: "upload",
        operation: "delete",
        filepath,
      });
      return true;
    }
    return false;
  } catch (error) {
    logger.error("File delete failed", {
      eventType: "upload",
      operation: "delete",
      filepath,
      error: error.message,
    });
    return false;
  }
}

/**
 * Check if uploaded file exists
 *
 * @param {string} filepath - Relative file path
 * @returns {boolean} File exists
 */
export function uploadFileExists(filepath) {
  try {
    const fullPath = path.join(
      path.dirname(__filename),
      '..',
      filepath
    );
    return fs.existsSync(fullPath);
  } catch (error) {
    return false;
  }
}

export default {
  signatureUpload,
  documentUpload,
  saveUploadedFile,
  deleteUploadedFile,
  uploadFileExists,
};
