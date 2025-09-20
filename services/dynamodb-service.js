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
    this.isInitialized = false;
  }

  /**
   * Initialize service (test connection, etc.)
   */
  async initialize() {
    try {
      await this.testConnection();
      this.isInitialized = true;
      console.log('✅ DynamoDB service initialized successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ DynamoDB service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Test DynamoDB connection by describing the table
   */
  async testConnection() {
    try {
      const command = new DynamoCommands.DescribeTableCommand({ TableName: this.tableName });
      await dynamoClient.send(command);
      console.log('✅ DynamoDB connection test successful');
      return { success: true };
    } catch (error) {
      console.error('❌ DynamoDB connection test failed:', error);
      throw error;
    }
  }

  /**
   * Create media file record
   */
  async createMediaFile({ userId, originalFilename, s3Key, fileType, fileSize, contentType, status = 'pending' }) {
    try {
      const fileId = uuidv4();
      const timestamp = new Date().toISOString();

      const item = {
        TableName: this.tableName,
        Item: {
          fileId: { S: fileId },
          userId: { S: userId },
          originalFilename: { S: originalFilename },
          s3Key: { S: s3Key },
          fileType: { S: fileType },
          fileSize: { N: fileSize.toString() },
          contentType: { S: contentType },
          status: { S: status },
          createdAt: { S: timestamp },
          updatedAt: { S: timestamp }
        }
      };

      await dynamoClient.send(new DynamoCommands.PutItemCommand(item));

      console.log(`✅ Media file record created: ${fileId}`);
      return { success: true, fileId, createdAt: timestamp, updatedAt: timestamp, ...item.Item };
    } catch (error) {
      console.error('❌ Create media file error:', error);
      throw new Error(`Failed to create media file: ${error.message}`);
    }
  }

  /**
   * Get media file by fileId
   */
  async getMediaFile({ fileId, userId }) {
    try {
      const command = new DynamoCommands.GetItemCommand({
        TableName: this.tableName,
        Key: { fileId: { S: fileId }, userId: { S: userId } }
      });

      const result = await dynamoClient.send(command);

      if (!result.Item) return { success: false, error: 'File not found' };
      return { success: true, file: this.convertDynamoItem(result.Item) };
    } catch (error) {
      console.error('❌ Get media file error:', error);
      throw new Error(`Failed to get media file: ${error.message}`);
    }
  }

  /**
   * Get all media files for a user
   */
  async getUserMediaFiles({ userId, limit = 100 }) {
    try {
      const command = new DynamoCommands.QueryCommand({
        TableName: this.tableName,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': { S: userId } },
        Limit: limit,
        ScanIndexForward: false
      });

      const result = await dynamoClient.send(command);
      const files = result.Items?.map(item => this.convertDynamoItem(item)) || [];
      return { success: true, files, count: files.length, lastEvaluatedKey: result.LastEvaluatedKey };
    } catch (error) {
      console.error('❌ Get user media files error:', error);
      throw new Error(`Failed to get user media files: ${error.message}`);
    }
  }

  /**
   * Update media file
   */
  async updateMediaFile({ fileId, userId, status, additionalData = {} }) {
    try {
      const timestamp = new Date().toISOString();
      let updateExpression = 'SET updatedAt = :updatedAt, #status = :status';
      let expressionAttributeNames = { '#status': 'status' };
      let expressionAttributeValues = { ':updatedAt': { S: timestamp }, ':status': { S: status } };

      Object.entries(additionalData).forEach(([key, value]) => {
        const placeholder = `:${key}`;
        updateExpression += `, ${key} = ${placeholder}`;
        expressionAttributeValues[placeholder] = { S: value.toString() };
      });

      const command = new DynamoCommands.UpdateItemCommand({
        TableName: this.tableName,
        Key: { fileId: { S: fileId }, userId: { S: userId } },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      });

      const result = await dynamoClient.send(command);
      console.log(`✅ Media file updated: ${fileId}`);
      return { success: true, file: this.convertDynamoItem(result.Attributes) };
    } catch (error) {
      console.error('❌ Update media file error:', error);
      throw new Error(`Failed to update media file: ${error.message}`);
    }
  }

  /**
   * Delete media file
   */
  async deleteMediaFile({ fileId, userId }) {
    try {
      const command = new DynamoCommands.DeleteItemCommand({
        TableName: this.tableName,
        Key: { fileId: { S: fileId }, userId: { S: userId } },
        ReturnValues: 'ALL_OLD'
      });

      const result = await dynamoClient.send(command);
      if (!result.Attributes) return { success: false, error: 'File not found or already deleted' };

      console.log(`✅ Media file deleted: ${fileId}`);
      return { success: true, deletedFile: this.convertDynamoItem(result.Attributes) };
    } catch (error) {
      console.error('❌ Delete media file error:', error);
      throw new Error(`Failed to delete media file: ${error.message}`);
    }
  }

  /**
   * Create processing job
   */
  async createProcessingJob({ userId, fileId, jobType, parameters = {}, status = 'pending', progress = 0 }) {
    try {
      const jobId = uuidv4();
      const timestamp = new Date().toISOString();

      const item = {
        TableName: 'ProcessingJobs',
        Item: {
          jobId: { S: jobId },
          userId: { S: userId },
          fileId: { S: fileId },
          jobType: { S: jobType },
          parameters: { S: JSON.stringify(parameters) },
          status: { S: status },
          progress: { N: progress.toString() },
          createdAt: { S: timestamp },
          updatedAt: { S: timestamp }
        }
      };

      await dynamoClient.send(new DynamoCommands.PutItemCommand(item));
      console.log(`✅ Processing job created: ${jobId}`);
      return { success: true, jobId, createdAt: timestamp, updatedAt: timestamp, ...item.Item };
    } catch (error) {
      console.error('❌ Create processing job error:', error);
      throw new Error(`Failed to create processing job: ${error.message}`);
    }
  }

  /**
   * Update processing job
   */
  async updateProcessingJob({ jobId, userId, progress, status }) {
    try {
      const timestamp = new Date().toISOString();

      const command = new DynamoCommands.UpdateItemCommand({
        TableName: 'ProcessingJobs',
        Key: { jobId: { S: jobId }, userId: { S: userId } },
        UpdateExpression: 'SET updatedAt = :updatedAt, #status = :status, progress = :progress',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':updatedAt': { S: timestamp },
          ':status': { S: status },
          ':progress': { N: progress.toString() }
        },
        ReturnValues: 'ALL_NEW'
      });

      const result = await dynamoClient.send(command);
      console.log(`✅ Processing job updated: ${jobId}`);
      return { success: true, job: this.convertDynamoItem(result.Attributes) };
    } catch (error) {
      console.error('❌ Update processing job error:', error);
      throw new Error(`Failed to update processing job: ${error.message}`);
    }
  }

  /**
   * Get user processing jobs
   */
  async getUserProcessingJobs({ userId, limit = 50 }) {
    try {
      const command = new DynamoCommands.QueryCommand({
        TableName: 'ProcessingJobs',
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': { S: userId } },
        Limit: limit,
        ScanIndexForward: false
      });

      const result = await dynamoClient.send(command);
      const jobs = result.Items?.map(item => this.convertDynamoItem(item)) || [];
      return { success: true, jobs, count: jobs.length };
    } catch (error) {
      console.error('❌ Get user processing jobs error:', error);
      throw new Error(`Failed to get user processing jobs: ${error.message}`);
    }
  }

  /**
   * Convert DynamoDB item to JS object
   */
  convertDynamoItem(dynamoItem) {
    const result = {};
    for (const [key, value] of Object.entries(dynamoItem)) {
      if (value.S) result[key] = value.S;
      else if (value.N) result[key] = parseFloat(value.N);
      else if (value.BOOL !== undefined) result[key] = value.BOOL;
      else if (value.SS) result[key] = value.SS;
      else if (value.NS) result[key] = value.NS.map(n => parseFloat(n));
    }
    return result;
  }
}

module.exports = new DynamoDBService();
