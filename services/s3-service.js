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
    this.isInitialized = false;
  }

  /**
   * Initialize the service (optional, mainly for test connection)
   */
  async initialize() {
    try {
      await this.testConnection();
      this.isInitialized = true;
      console.log('✅ S3 service initialized successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ S3 service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Test S3 connection by listing bucket objects
   */
  async testConnection() {
    try {
      const command = new S3Commands.ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: 1
      });
      await s3Client.send(command);
      console.log('✅ S3 connection test successful');
      return { success: true };
    } catch (error) {
      console.error('❌ S3 connection test failed:', error);
      throw error;
    }
  }

  /**
   * Upload file to S3
   * @param {Object} params
   * @param {Buffer|Stream} params.fileData - File buffer or stream
   * @param {string} params.originalFilename - Original filename
   * @param {string} params.contentType - MIME type
   * @param {string} params.userId - User ID
   */
  async uploadFile({ fileData, originalFilename, contentType, userId }) {
    try {
      const { s3Key, timestamp } = this._generateS3Key(originalFilename, userId);
      const command = new S3Commands.PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileData,
        ContentType: contentType,
        Metadata: {
          'original-filename': originalFilename,
          'user-id': userId,
          'upload-timestamp': timestamp.toString()
        }
      });

      const result = await s3Client.send(command);
      console.log(`✅ File uploaded to S3: ${s3Key}`);

      return {
        success: true,
        s3Key,
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
   * Generate pre-signed upload URL
   */
  async generatePresignedUploadUrl({ originalFilename, contentType, userId, expiresIn = 3600 }) {
    try {
      const { s3Key, timestamp } = this._generateS3Key(originalFilename, userId);

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
      console.log(`✅ Generated pre-signed upload URL: ${s3Key}`);

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
      console.error('❌ Generate pre-signed upload URL error:', error);
      throw new Error(`Failed to generate pre-signed upload URL: ${error.message}`);
    }
  }

  /**
   * Generate pre-signed download URL
   */
  async generatePresignedDownloadUrl({ s3Key, originalFilename, expiresIn = 3600 }) {
    try {
      const command = new S3Commands.GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        ResponseContentDisposition: `attachment; filename="${originalFilename}"`
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });
      console.log(`✅ Generated pre-signed download URL: ${s3Key}`);

      return {
        success: true,
        presignedUrl,
        s3Key,
        originalFilename,
        expiresIn
      };
    } catch (error) {
      console.error('❌ Generate pre-signed download URL error:', error);
      throw new Error(`Failed to generate pre-signed download URL: ${error.message}`);
    }
  }

  /**
   * Download file
   */
  async downloadFile({ s3Key }) {
    try {
      const command = new S3Commands.GetObjectCommand({ Bucket: this.bucketName, Key: s3Key });
      const result = await s3Client.send(command);

      const chunks = [];
      for await (const chunk of result.Body) chunks.push(chunk);
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
   * Delete file
   */
  async deleteFile({ s3Key }) {
    try {
      const command = new S3Commands.DeleteObjectCommand({ Bucket: this.bucketName, Key: s3Key });
      await s3Client.send(command);
      console.log(`✅ File deleted from S3: ${s3Key}`);

      return { success: true, s3Key, deletedAt: new Date().toISOString() };
    } catch (error) {
      console.error('❌ S3 delete error:', error);
      throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists({ s3Key }) {
    try {
      const command = new S3Commands.HeadObjectCommand({ Bucket: this.bucketName, Key: s3Key });
      const result = await s3Client.send(command);
      return { success: true, exists: true, contentType: result.ContentType, contentLength: result.ContentLength, lastModified: result.LastModified, metadata: result.Metadata };
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return { success: true, exists: false };
      }
      console.error('❌ File existence check error:', error);
      throw new Error(`Failed to check file existence: ${error.message}`);
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata({ s3Key }) {
    try {
      const command = new S3Commands.HeadObjectCommand({ Bucket: this.bucketName, Key: s3Key });
      const result = await s3Client.send(command);
      return { success: true, metadata: { contentType: result.ContentType, contentLength: result.ContentLength, lastModified: result.LastModified, etag: result.ETag, customMetadata: result.Metadata } };
    } catch (error) {
      console.error('❌ Get file metadata error:', error);
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * Internal helper to generate unique S3 key
   */
  _generateS3Key(originalFilename, userId) {
    const fileExtension = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, fileExtension);
    const timestamp = Date.now();
    const uniqueId = uuidv4().substring(0, 8);
    const s3Key = `uploads/${userId}/${timestamp}-${uniqueId}-${baseName}${fileExtension}`;
    return { s3Key, timestamp };
  }
}

module.exports = new S3Service();
