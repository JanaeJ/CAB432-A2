
// Cloud-based Media Processor API - CAB432 Assignment 2
// This version integrates RDS as additional persistence service
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// AWS Services - 修复导入路径以匹配您的文件结构
const cognitoService = require('./services/cognito-service');
const s3Service = require('./services/s3-service');
const dynamoService = require('./services/dynamodb-service'); // 使用您现有的文件名
const rdsService = require('./services/rds-service');
const parameterStoreService = require('./services/parameter-store-service');
const secretsManagerService = require('./services/secrets-manager-service');
const cacheService = require('./services/cache-service');

const app = express();
const PORT = process.env.PORT || 80;//之前是3000

// Job tracking for async operations
const completedJobs = new Map();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('public'));

// File upload configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(mp4|avi|mov|mkv|mp3|wav|flac|aac|jpg|jpeg|png|gif)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    if (!user.username) {
      return res.status(401).json({ error: 'Username missing in token' });
    }
    req.user = user;
    next();
  });
}

// Routes

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test AWS services connectivity
    const healthChecks = {
      timestamp: new Date().toISOString(),
      status: 'OK',
      services: {}
    };

    // Test DynamoDB
    try {
      await dynamoService.testConnection();
      healthChecks.services.dynamodb = 'connected';
    } catch (error) {
      healthChecks.services.dynamodb = `error: ${error.message}`;
      healthChecks.status = 'DEGRADED';
    }

    // Test S3
    try {
      await s3Service.testConnection();
      healthChecks.services.s3 = 'connected';
    } catch (error) {
      healthChecks.services.s3 = `error: ${error.message}`;
      healthChecks.status = 'DEGRADED';
    }

    // Test RDS
    try {
      await rdsService.testConnection();
      healthChecks.services.rds = 'connected';
    } catch (error) {
      healthChecks.services.rds = `error: ${error.message}`;
      healthChecks.status = 'DEGRADED';
    }

    // Test Redis Cache
    try {
      await cacheService.testConnection();
      healthChecks.services.redis = 'connected';
    } catch (error) {
      healthChecks.services.redis = `error: ${error.message}`;
      healthChecks.status = 'DEGRADED';
    }

    res.json(healthChecks);
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// User Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const result = await cognitoService.registerUser({
      username,
      email,
      password,
      attributes: {
        'custom:role': 'user'
      }
    });

    if (result.success) {
      res.json({
        message: 'User registered successfully',
        user: result.user
      });
    } else {
      res.status(400).json({ error: result.error || 'Registration failed' });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await cognitoService.authenticateUser(username, password);

    if (result.success) {
      // Generate JWT for stateless authentication
      const jwtToken = cognitoService.generateJWT({
        userId: result.user.username,
        username: result.user.username,
        email: result.user.email || '',
        role: 'user'
      });

      res.json({
        message: 'Login successful',
        token: jwtToken,
        user: result.user,
        expiresIn: '24h'
      });
    } else if (result.challenge) {
      res.status(200).json({
        challenge: result.challenge,
        session: result.session,
        parameters: result.parameters
      });
    } else {
      res.status(401).json({ error: result.error || 'Authentication failed' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user info
app.get('/api/auth/user', authenticateToken, async (req, res) => {
  try {
    const result = await cognitoService.getUserInfo(req.user.username);
    
    if (result.success) {
      res.json({
        message: 'User info retrieved successfully',
        user: result.user
      });
    } else {
      res.status(404).json({ error: result.error || 'User not found' });
    }
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({ error: error.message });
  }
});

// File upload with S3 integration
app.post('/api/media/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, mimetype, buffer, size } = req.file;
    
    // Upload to S3
    const s3Result = await s3Service.uploadFile({
      fileName: originalname,
      fileBuffer: buffer,
      contentType: mimetype,
      userId: req.user.userId
    });

    if (!s3Result.success) {
      return res.status(500).json({ error: 'Failed to upload file to S3' });
    }

    // Save metadata to DynamoDB
    const metadata = {
      userId: req.user.userId,
      originalFilename: originalname,
      s3Key: s3Result.s3Key,
      s3Bucket: s3Result.bucket,
      fileType: mimetype.startsWith('video/') ? 'video' : 
               mimetype.startsWith('audio/') ? 'audio' : 'image',
      fileSize: size,
      uploadedAt: new Date().toISOString()
    };

    const dynamoResult = await dynamoService.saveFileMetadata(metadata);
    
    if (!dynamoResult.success) {
      console.error('Failed to save metadata to DynamoDB:', dynamoResult.error);
      // Don't fail the request, just log the error
    }

    console.log(`✅ File uploaded successfully: ${originalname}`);
    
    res.json({
      message: 'File uploaded successfully',
      fileId: dynamoResult.fileId,
      filename: originalname,
      fileType: metadata.fileType,
      fileSize: size,
      s3Location: s3Result.s3Key
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pre-signed upload URL
app.post('/api/media/presigned-upload', authenticateToken, async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    
    if (!filename || !contentType) {
      return res.status(400).json({ error: 'Filename and content type are required' });
    }

    const result = await s3Service.generatePresignedUploadUrl({
      fileName: filename,
      contentType: contentType,
      userId: req.user.userId
    });

    if (result.success) {
      res.json({
        message: 'Pre-signed URL generated successfully',
        uploadUrl: result.uploadUrl,
        s3Key: result.s3Key,
        expiresIn: result.expiresIn
      });
    } else {
      res.status(500).json({ error: result.error || 'Failed to generate pre-signed URL' });
    }
  } catch (error) {
    console.error('Pre-signed URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pre-signed download URL
app.get('/api/media/presigned-download/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Get file metadata from DynamoDB
    const fileResult = await dynamoService.getFileMetadata(fileId, req.user.userId);
    
    if (!fileResult.success || !fileResult.file) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    // Generate pre-signed download URL
    const result = await s3Service.generatePresignedDownloadUrl(fileResult.file.s3Key);

    if (result.success) {
      res.json({
        message: 'Pre-signed download URL generated successfully',
        downloadUrl: result.downloadUrl,
        filename: fileResult.file.originalFilename,
        expiresIn: result.expiresIn
      });
    } else {
      res.status(500).json({ error: result.error || 'Failed to generate download URL' });
    }
  } catch (error) {
    console.error('Pre-signed download URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user files
app.get('/api/media/files', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await dynamoService.getUserFiles(req.user.userId, parseInt(limit), parseInt(offset));
    
    if (result.success) {
      res.json({
        message: 'Files retrieved successfully',
        files: result.files,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: result.hasMore
        }
      });
    } else {
      res.status(500).json({ error: result.error || 'Failed to retrieve files' });
    }
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process video (CPU-intensive task) with RDS tracking
app.post('/api/media/process-video/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { processType = 'speed-change', speedMultiplier = 1.0 } = req.body;
    
    if (processType === 'speed-change' && !speedMultiplier) {
      return res.status(400).json({ error: 'Speed multiplier is required for speed change processing' });
    }
    
    // Get file metadata from DynamoDB
    const fileResult = await dynamoService.getFileMetadata(fileId, req.user.userId);
    
    if (!fileResult.success || !fileResult.file) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    const file = fileResult.file;
    
    // Create processing record in RDS
    const processingRecord = await rdsService.createProcessingRecord({
      userId: req.user.userId,
      fileId: fileId,
      originalFilename: file.originalFilename,
      processingType: processType,
      parameters: { speedMultiplier },
      fileSizeBytes: file.fileSize
    });

    console.log(`Starting video processing for file: ${file.originalFilename} with type: ${processType}, speed: ${speedMultiplier}x`);

    const jobId = Date.now();
    const jobInfo = {
      id: jobId,
      rdsRecordId: processingRecord.recordId,
      userId: req.user.userId,
      fileId: fileId,
      originalFilename: file.originalFilename,
      processType: processType,
      speedMultiplier: speedMultiplier,
      status: 'processing',
      startTime: new Date().toISOString(),
      progress: 0
    };

    // Simulate CPU-intensive processing without saving files
    let progress = 0;
    const startTime = Date.now();
    const interval = setInterval(async () => {
      progress += Math.random() * 15;
      jobInfo.progress = Math.round(progress);
      
      if (progress >= 100) {
        progress = 100;
        jobInfo.progress = 100;
        jobInfo.status = 'completed';
        jobInfo.completionTime = new Date().toISOString();
        jobInfo.duration = Date.now() - jobId;
        
        // Update RDS record to completed status
        try {
          await rdsService.updateProcessingRecord(processingRecord.recordId, {
            status: 'completed',
            progress: 100,
            completedAt: new Date().toISOString(),
            processingDurationMs: Date.now() - startTime
          });
          
          console.log(`✅ RDS record ${processingRecord.recordId} updated to completed`);
        } catch (error) {
          console.error('Error updating RDS record:', error);
        }
        
        // Store completed job info (no files)
        completedJobs.set(jobId, jobInfo);
        console.log(`✅ Video processing completed! Job ID: ${jobId}, Duration: ${(jobInfo.duration/1000).toFixed(2)}s`);
        clearInterval(interval);
      }
    }, 100);

    res.json({ 
      message: 'Video processing started',
      jobId: jobId,
      rdsRecordId: processingRecord.recordId,
      processType: processType,
      speedMultiplier: speedMultiplier,
      estimatedDuration: '30-60 seconds',
      checkStatus: `/api/media/job-status/${jobId}`,
      note: 'This is a CPU-intensive simulation for load testing'
    });

  } catch (error) {
    console.error('Video processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get job status
app.get('/api/media/job-status/:jobId', authenticateToken, (req, res) => {
  const { jobId } = req.params;
  const job = completedJobs.get(parseInt(jobId));
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  if (job.userId !== req.user.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  res.json({
    message: 'Job status retrieved successfully',
    job: job
  });
});

// Get user processing history from RDS
app.get('/api/user/processing-history', authenticateToken, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const result = await rdsService.getUserProcessingHistory(
      req.user.userId, 
      parseInt(limit), 
      parseInt(offset)
    );

    if (result.success) {
      res.json({
        message: 'Processing history retrieved successfully',
        history: result.history,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: result.total
        }
      });
    } else {
      res.status(500).json({ error: 'Failed to retrieve processing history' });
    }
  } catch (error) {
    console.error('Get processing history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get processing analytics from RDS
app.get('/api/user/analytics', authenticateToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const result = await rdsService.getProcessingAnalytics(
      req.user.userId, 
      parseInt(days)
    );

    if (result.success) {
      res.json({
        message: 'Analytics retrieved successfully',
        analytics: result.analytics,
        period: `${days} days`
      });
    } else {
      res.status(500).json({ error: 'Failed to retrieve analytics' });
    }
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete file
app.delete('/api/media/files/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Get file metadata
    const fileResult = await dynamoService.getFileMetadata(fileId, req.user.userId);
    
    if (!fileResult.success || !fileResult.file) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    // Delete from S3
    const s3Result = await s3Service.deleteFile(fileResult.file.s3Key);
    if (!s3Result.success) {
      console.error('Failed to delete from S3:', s3Result.error);
    }

    // Delete metadata from DynamoDB
    const dynamoResult = await dynamoService.deleteFileMetadata(fileId, req.user.userId);
    
    if (dynamoResult.success) {
      res.json({ message: 'File deleted successfully' });
    } else {
      res.status(500).json({ error: dynamoResult.error || 'Failed to delete file' });
    }
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: error.message });
  }
});

// CPU Load Test (no authentication required for testing)
app.post('/api/test/cpu-load', async (req, res) => {
  try {
    const { complexity = 1000000, duration = 5000 } = req.body;
    
    const operations = Math.floor(complexity);
    const jobId = Date.now();
    
    console.log(`Starting CPU load test - Operations: ${operations}, Duration: ${duration}ms`);
    
    const startTime = Date.now();
    let progress = 0;
    
    const interval = setInterval(() => {
      // Simulate CPU-intensive work
      let result = 0;
      for (let i = 0; i < operations / 100; i++) {
        result += Math.sqrt(Math.random() * 1000000);
      }
      
      progress += 2;
      if (progress >= 100 || Date.now() - startTime >= duration) {
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`✅ CPU load test completed! Job ID: ${jobId}, Duration: ${elapsed.toFixed(2)}s, Result: ${result}`);
        clearInterval(interval);
      }
    }, 100);

    res.json({ 
      message: 'CPU Load Test started',
      jobId: jobId,
      complexity: complexity,
      duration: duration,
      operations: operations,
      note: 'This endpoint is for CPU load testing without authentication'
    });
  } catch (error) {
    console.error('CPU load test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get application configuration from Parameter Store
app.get('/api/config', async (req, res) => {
  try {
    const result = await parameterStoreService.getApplicationConfig();
    
    if (result.success) {
      res.json({
        config: result.config,
        errors: result.errors,
        source: 'parameter-store'
      });
    } else {
      res.status(500).json({ error: 'Failed to load configuration' });
    }
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({ error: error.message });
  }
});

// RDS health check endpoint
app.get('/health/rds', async (req, res) => {
  try {
    const testResult = await rdsService.testConnection();
    
    if (testResult.success) {
      res.json({
        service: 'RDS PostgreSQL',
        status: 'healthy',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        service: 'RDS PostgreSQL', 
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      service: 'RDS PostgreSQL',
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware - Handle Multer errors
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        error: 'File too large', 
        message: 'File size exceeds the limit of 500MB',
        maxSize: '500MB',
        suggestion: 'Please compress your file or choose a smaller one'
      });
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ 
        error: 'Too many files', 
        message: 'Only one file can be uploaded at a time'
      });
    } else {
      return res.status(400).json({ 
        error: 'Upload error', 
        message: error.message 
      });
    }
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Cloud Media Processor API running on port ${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);

  try {
    console.log('🔧 Initializing AWS services...');

    // Parameter Store (skip write)
    try {
      if (process.env.SKIP_SSM !== 'true') {
        await parameterStoreService.initializeDefaultParameters();
        console.log('✅ Parameter Store initialized');
      } else {
        console.log('⚠️ Parameter Store skipped');
      }
    } catch (e) { console.log('⚠️ Parameter Store skipped:', e.message); }

    // Secrets Manager (skip write)
    try {
      if (process.env.SKIP_SECRETS !== 'true') {
        await secretsManagerService.initializeDefaultSecrets();
        console.log('✅ Secrets Manager initialized');
      } else {
        console.log('⚠️ Secrets Manager skipped');
      }
    } catch (e) { console.log('⚠️ Secrets Manager skipped:', e.message); }

    // DynamoDB
    try {
      await dynamoService.ensureTableExists();
      console.log('✅ DynamoDB ready');
    } catch (e) { console.log('⚠️ DynamoDB skipped:', e.message); }

    // RDS
    try {
      await rdsService.initialize();
      console.log('✅ RDS PostgreSQL ready');
    } catch (e) { console.log('⚠️ RDS skipped:', e.message); }

    // Cache
    try {
      await cacheService.initialize();
      console.log('✅ Cache ready');
    } catch (e) { console.log('⚠️ Cache skipped:', e.message); }

    console.log('🎉 AWS services initialized');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    console.log('⚠️ Server running but some services may be unavailable');
  }
});
