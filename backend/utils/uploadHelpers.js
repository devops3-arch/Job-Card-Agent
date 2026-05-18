/**
 * Upload Helpers
 * Secure file handling, validation, and naming
 * Design: local first, Azure-compatible architecture
 */

import crypto from 'crypto';
import path from 'path';
import logger from '../services/logger/logger.js';

/**
 * Allowed MIME types for signatures
 * Strict list: PNG, JPEG, WebP only
 */
const SIGNATURE_ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Allowed MIME types for documents
 * Strict list: PDF only
 */
const DOCUMENT_ALLOWED_MIMES = ['application/pdf'];

/**
 * Max file sizes (in bytes)
 */
const MAX_SIGNATURE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Generate a secure, unique filename
 * Format: type_userId_timestamp_random.ext
 * Example: signature_1_1714939393_a7f3k9m2.png
 *
 * @param {number} userId - User ID
 * @param {string} fileType - 'signature' or 'document'
 * @param {string} originalName - Original filename
 * @returns {string} Unique secure filename
 */
export function generateSecureFilename(userId, fileType, originalName) {
  // Extract extension safely
  const ext = path.extname(originalName).toLowerCase().slice(1) || 'bin';
  
  // Generate random suffix (8 chars hex)
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  
  // Timestamp in seconds
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Format: fileType_userId_timestamp_randomSuffix.ext
  return `${fileType}_${userId}_${timestamp}_${randomSuffix}.${ext}`;
}

/**
 * Sanitize filename to prevent path traversal and injection
 * Removes: .., /, \, null bytes, control characters
 *
 * @param {string} filename - Filename to sanitize
 * @returns {string} Sanitized filename
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unknown';
  }
  
  return filename
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x1f\x7f]/g, '') // Remove control characters
    .replace(/\.\./g, '') // Remove path traversal attempts
    .replace(/[\/\\]/g, '') // Remove path separators
    .replace(/[<>:"|?*]/g, '') // Remove invalid filename chars
    .replace(/^\s+|\s+$/g, '') // Trim whitespace
    .slice(0, 255); // Limit to 255 chars
}

/**
 * Validate signature file
 *
 * @param {object} file - Multer file object
 * @returns {object} { valid: boolean, error?: string }
 */
export function validateSignatureFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Check MIME type
  if (!SIGNATURE_ALLOWED_MIMES.includes(file.mimetype)) {
    logger.warn('Invalid signature MIME type rejected', {
      eventType: 'upload',
      category: 'validation',
      mimetype: file.mimetype,
    });
    return { valid: false, error: 'Invalid file type. Allowed: PNG, JPEG, WebP' };
  }

  // Check file size
  if (file.size > MAX_SIGNATURE_SIZE) {
    logger.warn('Oversized signature rejected', {
      eventType: 'upload',
      category: 'validation',
      size: file.size,
    });
    return { valid: false, error: `File size exceeds 2MB limit (${Math.round(file.size / 1024 / 1024 * 10) / 10}MB)` };
  }

  // Check file extension matches MIME type
  const ext = path.extname(file.originalname).toLowerCase();
  const validExts = {
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/webp': ['.webp'],
  };

  if (!validExts[file.mimetype] || !validExts[file.mimetype].includes(ext)) {
    logger.warn('Signature extension mismatch rejected', {
      eventType: 'upload',
      category: 'validation',
      extension: ext,
      mimetype: file.mimetype,
    });
    return { valid: false, error: 'File extension does not match file type' };
  }

  logger.debug('Signature file validated', {
    eventType: 'upload',
    category: 'validation',
    mimetype: file.mimetype,
    size: file.size,
  });

  return { valid: true };
}

/**
 * Validate document file (PDF only)
 *
 * @param {object} file - Multer file object
 * @returns {object} { valid: boolean, error?: string }
 */
export function validateDocumentFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Check MIME type (PDF only)
  if (!DOCUMENT_ALLOWED_MIMES.includes(file.mimetype)) {
    logger.warn('Invalid document MIME type rejected', {
      eventType: 'upload',
      category: 'validation',
      mimetype: file.mimetype,
    });
    return { valid: false, error: 'Only PDF files are allowed' };
  }

  // Check file size
  if (file.size > MAX_DOCUMENT_SIZE) {
    logger.warn('Oversized document rejected', {
      eventType: 'upload',
      category: 'validation',
      size: file.size,
    });
    return { valid: false, error: `File size exceeds 10MB limit (${Math.round(file.size / 1024 / 1024 * 10) / 10}MB)` };
  }

  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.pdf') {
    logger.warn('Document extension mismatch rejected', {
      eventType: 'upload',
      category: 'validation',
      extension: ext,
    });
    return { valid: false, error: 'File extension must be .pdf' };
  }

  logger.debug('Document file validated', {
    eventType: 'upload',
    category: 'validation',
    mimetype: file.mimetype,
    size: file.size,
  });

  return { valid: true };
}

/**
 * Get upload path for file type
 * Abstracts storage location (local or future Azure)
 *
 * @param {string} fileType - 'signature' or 'document'
 * @param {string} filename - Filename to store
 * @returns {string} Relative upload path
 */
export function getUploadPath(fileType, filename) {
  if (fileType === 'signature') {
    return `uploads/signatures/${filename}`;
  }
  if (fileType === 'document') {
    return `uploads/approved-documents/${filename}`;
  }
  return `uploads/temp/${filename}`;
}

/**
 * Get Azure Blob path (future compatibility)
 * Format: container/type/filename
 *
 * @param {string} fileType - 'signature' or 'document'
 * @param {string} filename - Filename
 * @returns {string} Azure-compatible blob path
 */
export function getAzureBlobPath(fileType, filename) {
  const containerName = process.env.AZURE_BLOB_CONTAINER || 'jobcard-files';
  return `${containerName}/${fileType}/${filename}`;
}

/**
 * Calculate file hash (for integrity verification)
 * Used to detect duplicate uploads
 *
 * @param {Buffer} fileBuffer - File buffer
 * @returns {string} SHA256 hash hex
 */
export function calculateFileHash(fileBuffer) {
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

export default {
  generateSecureFilename,
  sanitizeFilename,
  validateSignatureFile,
  validateDocumentFile,
  getUploadPath,
  getAzureBlobPath,
  calculateFileHash,
  MAX_SIGNATURE_SIZE,
  MAX_DOCUMENT_SIZE,
  SIGNATURE_ALLOWED_MIMES,
  DOCUMENT_ALLOWED_MIMES,
};
