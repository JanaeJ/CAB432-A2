// S3 Service for file storage operations
const { 
  s3Client, 
  s3Config, 
  S3Commands, 
  getSignedUrl 
} = require('./aws-config');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

class S3Service {
  constructor() {
    this.bucketName = s3Config.bucketName;
    this.region = s3Config.region;
  }

  /**
   * Upload file to S3
   * @param {Buffer|Stream} fileData - File data to upload
   * @param {string} originalFilename - Original filename
   * @param {string} contentType - MIME type of the file
   * @param {string} userId - User ID for organizing files
   * @returns {Promise<Object>} Upload result with S3 key and metadata
   */
  async uploadFile(fileData, originalFilename, contentType, userId) {
    try {
      // Generate unique S3 key
      const fileExtension = path.extname(originalFilename);
      const baseName = path.basename(originalFilename, fileExtension);
      const timestamp = Date.now();
      const uniqueId = uuidv4().substring(0, 8);
      const s3Key = `uploads/${userId}/${timestamp}-${uniqueId}-${baseName}${fileExtension}`;

      const uploadParams = {
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileData,
        ContentType: contentType,
        Metadata: {
          'original-filename': originalFilename,
          'user-id': userId,
          'upload-timestamp': timestamp.toString()
        }
      };

      const command = new S3Commands.PutObjectCommand(uploadParams);
      const result = await s3Client.send(command);

      console.log(`✅ File uploaded to S3: ${s3Key}`);
      
      return {
        success: true,
        s3Key: s3Key,
        etag: result.ETag,
        location: `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${s3Key}`,
        metadata: {
          originalFilename,
          contentType,
          userId,
          uploadTimestamp: timestamp
        }
      };
    } catch (error) {
      console.error('❌ S3 upload error:', error);
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  /**
   * Generate pre-signed URL for direct client upload
   * @param {string} originalFilename - Original filename
   * @param {string} contentType - MIME type
   * @param {string} userId - User ID
   * @param {number} expiresIn - URL expiration time in seconds (default: 3600)
   * @returns {Promise<Object>} Pre-signed URL and metadata
   */
  async generatePresignedUploadUrl(originalFilename, contentType, userId, expiresIn = 3600) {
    try {
      const fileExtension = path.extname(originalFilename);
      const baseName = path.basename(originalFilename, fileExtension);
      const timestamp = Date.now();
      const uniqueId = uuidv4().substring(0, 8);
      const s3Key = `uploads/${userId}/${timestamp}-${uniqueId}-${baseName}${fileExtension}`;

      const command = new S3Commands.PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        ContentType: contentType,
        Metadata: {
          'original-filename': originalFilename,
          'user-id': userId,
          'upload-timestamp': timestamp.toString()
        }
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });

      console.log(`✅ Generated pre-signed upload URL for: ${s3Key}`);

      return {
        success: true,
        presignedUrl,
        s3Key,
        expiresIn,
        metadata: {
          originalFilename,
          contentType,
          userId,
          uploadTimestamp: timestamp
        }
      };
    } catch (error) {
      console.error('❌ Error generating pre-signed upload URL:', error);
      throw new Error(`Failed to generate pre-signed upload URL: ${error.message}`);
    }
  }

  /**
   * Generate pre-signed URL for file download
   * @param {string} s3Key - S3 object key
   * @param {string} originalFilename - Original filename for download
   * @param {number} expiresIn - URL expiration time in seconds (default: 3600)
   * @returns {Promise<Object>} Pre-signed download URL
   */
  async generatePresignedDownloadUrl(s3Key, originalFilename, expiresIn = 3600) {
    try {
      const command = new S3Commands.GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        ResponseContentDisposition: `attachment; filename="${originalFilename}"`
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });

      console.log(`✅ Generated pre-signed download URL for: ${s3Key}`);

      return {
        success: true,
        presignedUrl,
        s3Key,
        originalFilename,
        expiresIn
      };
    } catch (error) {
      console.error('❌ Error generating pre-signed download URL:', error);
      throw new Error(`Failed to generate pre-signed download URL: ${error.message}`);
    }
  }

  /**
   * Download file from S3
   * @param {string} s3Key - S3 object key
   * @returns {Promise<Object>} File data and metadata
   */
  async downloadFile(s3Key) {
    try {
      const command = new S3Commands.GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key
      });

      const result = await s3Client.send(command);
      
      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of result.Body) {
        chunks.push(chunk);
      }
      const fileData = Buffer.concat(chunks);

      console.log(`✅ File downloaded from S3: ${s3Key}`);

      return {
        success: true,
        data: fileData,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        metadata: result.Metadata,
        lastModified: result.LastModified
      };
    } catch (error) {
      console.error('❌ S3 download error:', error);
      throw new Error(`Failed to download file from S3: ${error.message}`);
    }
  }

  /**
   * Delete file from S3
   * @param {string} s3Key - S3 object key
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFile(s3Key) {
    try {
      const command = new S3Commands.DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key
      });

      await s3Client.send(command);

      console.log(`✅ File deleted from S3: ${s3Key}`);

      return {
        success: true,
        s3Key,
        deletedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ S3 delete error:', error);
      throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
  }

  /**
   * Check if file exists in S3
   * @param {string} s3Key - S3 object key
   * @returns {Promise<Object>} File existence info
   */
  async fileExists(s3Key) {
    try {
      const command = new S3Commands.HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key
      });

      const result = await s3Client.send(command);

      return {
        success: true,
        exists: true,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        lastModified: result.LastModified,
        metadata: result.Metadata
      };
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return {
          success: true,
          exists: false
        };
      }
      console.error('❌ Error checking file existence:', error);
      throw new Error(`Failed to check file existence: ${error.message}`);
    }
  }

  /**
   * Get file metadata from S3
   * @param {string} s3Key - S3 object key
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(s3Key) {
    try {
      const command = new S3Commands.HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key
      });

      const result = await s3Client.send(command);

      return {
        success: true,
        metadata: {
          contentType: result.ContentType,
          contentLength: result.ContentLength,
          lastModified: result.LastModified,
          etag: result.ETag,
          customMetadata: result.Metadata
        }
      };
    } catch (error) {
      console.error('❌ Error getting file metadata:', error);
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }
}

module.exports = new S3Service();
