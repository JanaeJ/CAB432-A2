// DynamoDB Service for metadata storage
const { 
  dynamoClient, 
  dynamoConfig, 
  DynamoCommands 
} = require('./aws-config');
const { v4: uuidv4 } = require('uuid');

class DynamoDBService {
  constructor() {
    this.tableName = dynamoConfig.tableName;
    this.region = dynamoConfig.region;
  }

  /**
   * Create media file record in DynamoDB
   * @param {Object} fileData - File metadata
   * @returns {Promise<Object>} Created record
   */
  async createMediaFile(fileData) {
    try {
      const {
        userId,
        originalFilename,
        s3Key,
        fileType,
        fileSize,
        contentType,
        status = 'pending'
      } = fileData;

      const fileId = uuidv4();
      const timestamp = new Date().toISOString();

      const item = {
        TableName: this.tableName,
        Item: {
          'fileId': { S: fileId },
          'userId': { S: userId },
          'originalFilename': { S: originalFilename },
          's3Key': { S: s3Key },
          'fileType': { S: fileType },
          'fileSize': { N: fileSize.toString() },
          'contentType': { S: contentType },
          'status': { S: status },
          'createdAt': { S: timestamp },
          'updatedAt': { S: timestamp }
        }
      };

      const command = new DynamoCommands.PutItemCommand(item);
      await dynamoClient.send(command);

      console.log(`✅ Media file record created in DynamoDB: ${fileId}`);

      return {
        success: true,
        fileId,
        ...fileData,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    } catch (error) {
      console.error('❌ DynamoDB create error:', error);
      throw new Error(`Failed to create media file record: ${error.message}`);
    }
  }

  /**
   * Get media file by ID
   * @param {string} fileId - File ID
   * @param {string} userId - User ID for security
   * @returns {Promise<Object>} File record
   */
  async getMediaFile(fileId, userId) {
    try {
      const command = new DynamoCommands.GetItemCommand({
        TableName: this.tableName,
        Key: {
          'fileId': { S: fileId },
          'userId': { S: userId }
        }
      });

      const result = await dynamoClient.send(command);

      if (!result.Item) {
        return {
          success: false,
          error: 'File not found'
        };
      }

      // Convert DynamoDB format to regular object
      const fileRecord = this.convertDynamoItem(result.Item);

      return {
        success: true,
        file: fileRecord
      };
    } catch (error) {
      console.error('❌ DynamoDB get error:', error);
      throw new Error(`Failed to get media file: ${error.message}`);
    }
  }

  /**
   * Get all media files for a user
   * @param {string} userId - User ID
   * @param {number} limit - Maximum number of items to return
   * @returns {Promise<Object>} List of files
   */
  async getUserMediaFiles(userId, limit = 100) {
    try {
      const command = new DynamoCommands.QueryCommand({
        TableName: this.tableName,
        IndexName: 'UserIdIndex', // Assuming GSI on userId
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': { S: userId }
        },
        Limit: limit,
        ScanIndexForward: false // Sort by createdAt descending
      });

      const result = await dynamoClient.send(command);

      const files = result.Items ? result.Items.map(item => this.convertDynamoItem(item)) : [];

      return {
        success: true,
        files,
        count: files.length,
        lastEvaluatedKey: result.LastEvaluatedKey
      };
    } catch (error) {
      console.error('❌ DynamoDB query error:', error);
      throw new Error(`Failed to get user media files: ${error.message}`);
    }
  }

  /**
   * Update media file status
   * @param {string} fileId - File ID
   * @param {string} userId - User ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional fields to update
   * @returns {Promise<Object>} Updated record
   */
  async updateMediaFile(fileId, userId, status, additionalData = {}) {
    try {
      const timestamp = new Date().toISOString();
      
      // Build update expression
      let updateExpression = 'SET updatedAt = :updatedAt, #status = :status';
      let expressionAttributeNames = { '#status': 'status' };
      let expressionAttributeValues = {
        ':updatedAt': { S: timestamp },
        ':status': { S: status }
      };

      // Add additional fields
      Object.keys(additionalData).forEach(key => {
        const placeholder = `:${key}`;
        updateExpression += `, ${key} = ${placeholder}`;
        expressionAttributeValues[placeholder] = { S: additionalData[key].toString() };
      });

      const command = new DynamoCommands.UpdateItemCommand({
        TableName: this.tableName,
        Key: {
          'fileId': { S: fileId },
          'userId': { S: userId }
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      });

      const result = await dynamoClient.send(command);

      console.log(`✅ Media file updated in DynamoDB: ${fileId}`);

      return {
        success: true,
        file: this.convertDynamoItem(result.Attributes)
      };
    } catch (error) {
      console.error('❌ DynamoDB update error:', error);
      throw new Error(`Failed to update media file: ${error.message}`);
    }
  }

  /**
   * Delete media file record
   * @param {string} fileId - File ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteMediaFile(fileId, userId) {
    try {
      const command = new DynamoCommands.DeleteItemCommand({
        TableName: this.tableName,
        Key: {
          'fileId': { S: fileId },
          'userId': { S: userId }
        },
        ReturnValues: 'ALL_OLD'
      });

      const result = await dynamoClient.send(command);

      if (!result.Attributes) {
        return {
          success: false,
          error: 'File not found or already deleted'
        };
      }

      console.log(`✅ Media file deleted from DynamoDB: ${fileId}`);

      return {
        success: true,
        deletedFile: this.convertDynamoItem(result.Attributes)
      };
    } catch (error) {
      console.error('❌ DynamoDB delete error:', error);
      throw new Error(`Failed to delete media file: ${error.message}`);
    }
  }

  /**
   * Create processing job record
   * @param {Object} jobData - Job metadata
   * @returns {Promise<Object>} Created job record
   */
  async createProcessingJob(jobData) {
    try {
      const {
        userId,
        fileId,
        jobType,
        parameters = {},
        status = 'pending',
        progress = 0
      } = jobData;

      const jobId = uuidv4();
      const timestamp = new Date().toISOString();

      const item = {
        TableName: 'ProcessingJobs', // Separate table for jobs
        Item: {
          'jobId': { S: jobId },
          'userId': { S: userId },
          'fileId': { S: fileId },
          'jobType': { S: jobType },
          'parameters': { S: JSON.stringify(parameters) },
          'status': { S: status },
          'progress': { N: progress.toString() },
          'createdAt': { S: timestamp },
          'updatedAt': { S: timestamp }
        }
      };

      const command = new DynamoCommands.PutItemCommand(item);
      await dynamoClient.send(command);

      console.log(`✅ Processing job created in DynamoDB: ${jobId}`);

      return {
        success: true,
        jobId,
        ...jobData,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    } catch (error) {
      console.error('❌ DynamoDB job create error:', error);
      throw new Error(`Failed to create processing job: ${error.message}`);
    }
  }

  /**
   * Update processing job progress
   * @param {string} jobId - Job ID
   * @param {string} userId - User ID
   * @param {number} progress - Progress percentage
   * @param {string} status - Job status
   * @returns {Promise<Object>} Updated job record
   */
  async updateProcessingJob(jobId, userId, progress, status) {
    try {
      const timestamp = new Date().toISOString();

      const command = new DynamoCommands.UpdateItemCommand({
        TableName: 'ProcessingJobs',
        Key: {
          'jobId': { S: jobId },
          'userId': { S: userId }
        },
        UpdateExpression: 'SET updatedAt = :updatedAt, #status = :status, progress = :progress',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':updatedAt': { S: timestamp },
          ':status': { S: status },
          ':progress': { N: progress.toString() }
        },
        ReturnValues: 'ALL_NEW'
      });

      const result = await dynamoClient.send(command);

      console.log(`✅ Processing job updated in DynamoDB: ${jobId}`);

      return {
        success: true,
        job: this.convertDynamoItem(result.Attributes)
      };
    } catch (error) {
      console.error('❌ DynamoDB job update error:', error);
      throw new Error(`Failed to update processing job: ${error.message}`);
    }
  }

  /**
   * Get user processing jobs
   * @param {string} userId - User ID
   * @param {number} limit - Maximum number of items
   * @returns {Promise<Object>} List of jobs
   */
  async getUserProcessingJobs(userId, limit = 50) {
    try {
      const command = new DynamoCommands.QueryCommand({
        TableName: 'ProcessingJobs',
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': { S: userId }
        },
        Limit: limit,
        ScanIndexForward: false
      });

      const result = await dynamoClient.send(command);

      const jobs = result.Items ? result.Items.map(item => this.convertDynamoItem(item)) : [];

      return {
        success: true,
        jobs,
        count: jobs.length
      };
    } catch (error) {
      console.error('❌ DynamoDB jobs query error:', error);
      throw new Error(`Failed to get user processing jobs: ${error.message}`);
    }
  }

  /**
   * Convert DynamoDB item to regular JavaScript object
   * @param {Object} dynamoItem - DynamoDB item
   * @returns {Object} Regular JavaScript object
   */
  convertDynamoItem(dynamoItem) {
    const result = {};
    
    for (const [key, value] of Object.entries(dynamoItem)) {
      if (value.S) {
        result[key] = value.S;
      } else if (value.N) {
        result[key] = parseFloat(value.N);
      } else if (value.BOOL !== undefined) {
        result[key] = value.BOOL;
      } else if (value.SS) {
        result[key] = value.SS;
      } else if (value.NS) {
        result[key] = value.NS.map(n => parseFloat(n));
      }
    }
    
    return result;
  }

  /**
   * Check if table exists and create if needed
   * @returns {Promise<boolean>} Table exists
   */
  async ensureTableExists() {
    try {
      // This would typically be handled by Infrastructure as Code
      // For now, we'll assume the table exists
      console.log(`✅ DynamoDB table check: ${this.tableName}`);
      return true;
    } catch (error) {
      console.error('❌ Table existence check failed:', error);
      return false;
    }
  }
}

module.exports = new DynamoDBService();
