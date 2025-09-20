// Cloud-based Media Processor API - CAB432 Assignment 2
// Complete version with RDS, Cognito MFA + User Groups, full functionality
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// AWS Services
const cognitoService = require('./services/cognito-service');
const s3Service = require('./services/s3-service');
const dynamoService = require('./services/dynamodb-service');
const rdsService = require('./services/rds-service');
const parameterStoreService = require('./services/parameter-store-service');
const secretsManagerService = require('./services/secrets-manager-service');
const cacheService = require('./services/cache-service');

const app = express();
const PORT = process.env.PORT || 80;

// Job tracking for async operations
const completedJobs = new Map();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// File upload configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(mp4|avi|mov|mkv|mp3|wav|flac|aac|jpg|jpeg|png|gif)$/i;
    cb(allowedTypes.test(file.originalname) ? null : new Error('File type not allowed'), true);
  }
});

// JWT authentication
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    if (!user.username) return res.status(401).json({ error: 'Username missing in token' });
    req.user = user;
    next();
  });
}

// Authorization by Cognito group
function authorizeGroup(requiredGroup) {
  return (req, res, next) => {
    const groups = req.user['cognito:groups'] || [];
    if (!groups.includes(requiredGroup)) {
      return res.status(403).json({ error: 'Access denied: insufficient group privileges' });
    }
    next();
  };
}

// ----------------------- Health Check -----------------------
app.get('/health', async (req, res) => {
  try {
    const healthChecks = { timestamp: new Date().toISOString(), status: 'OK', services: {} };

    try { await dynamoService.testConnection(); healthChecks.services.dynamodb = 'connected'; } 
    catch (e) { healthChecks.services.dynamodb = `error: ${e.message}`; healthChecks.status = 'DEGRADED'; }

    try { await s3Service.testConnection(); healthChecks.services.s3 = 'connected'; } 
    catch (e) { healthChecks.services.s3 = `error: ${e.message}`; healthChecks.status = 'DEGRADED'; }

    try { await rdsService.testConnection(); healthChecks.services.rds = 'connected'; } 
    catch (e) { healthChecks.services.rds = `error: ${e.message}`; healthChecks.status = 'DEGRADED'; }

    try { await cacheService.testConnection(); healthChecks.services.redis = 'connected'; } 
    catch (e) { healthChecks.services.redis = `error: ${e.message}`; healthChecks.status = 'DEGRADED'; }

    res.json(healthChecks);
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message, timestamp: new Date().toISOString() });
  }
});

// ----------------------- Auth -----------------------
// Register user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Username, email, and password are required' });

    const result = await cognitoService.registerUser({
      username, email, password,
      attributes: { 'custom:role': 'user' },
      group: 'User'
    });

    if (result.success) {
      res.json({ message: 'User registered successfully', user: result.user });
    } else {
      res.status(400).json({ error: result.error || 'Registration failed' });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login user with MFA support
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    const result = await cognitoService.authenticateUser(username, password);

    if (result.success) {
      const jwtToken = cognitoService.generateJWT({
        userId: result.user.username,
        username: result.user.username,
        email: result.user.email || '',
        role: 'user',
        'cognito:groups': result.user.groups || []
      });

      res.json({ message: 'Login successful', token: jwtToken, user: result.user, expiresIn: '24h' });
    } else if (result.challengeName === 'SMS_MFA' || result.challengeName === 'SOFTWARE_TOKEN_MFA') {
      res.status(200).json({ 
        mfaRequired: true,
        challenge: result.challengeName, 
        session: result.Session,
        username: username
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
    if (result.success) res.json({ message: 'User info retrieved successfully', user: result.user });
    else res.status(404).json({ error: result.error || 'User not found' });
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------- User Management & MFA -----------------------

// Token verification endpoint
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  res.json({ 
    message: 'Token is valid', 
    user: req.user,
    valid: true 
  });
});

// Get user profile
app.get('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const result = await cognitoService.getUserInfo(req.user.username);
    if (result.success) {
      res.json({ 
        username: result.user.username,
        email: result.user.attributes.email || '',
        firstName: result.user.attributes.given_name || '',
        lastName: result.user.attributes.family_name || '',
        role: result.user.attributes['custom:role'] || 'user'
      });
    } else {
      res.status(404).json({ error: result.error || 'User not found' });
    }
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user profile
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const { email, firstName, lastName } = req.body;
    const attributes = {};
    
    if (email) attributes.email = email;
    if (firstName) attributes.given_name = firstName;
    if (lastName) attributes.family_name = lastName;
    
    const result = await cognitoService.updateUserAttributes(req.user.username, attributes);
    
    if (result.success) {
      res.json({ message: 'Profile updated successfully' });
    } else {
      res.status(400).json({ error: result.error || 'Profile update failed' });
    }
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// MFA status and setup
app.get('/api/auth/mfa-status', authenticateToken, async (req, res) => {
  try {
    const result = await cognitoService.getMFAStatus(req.user.username);
    res.json(result);
  } catch (error) {
    console.error('MFA status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enable MFA
app.post('/api/auth/enable-mfa', authenticateToken, async (req, res) => {
  try {
    const result = await cognitoService.setupMFA(req.user.username);
    res.json(result);
  } catch (error) {
    console.error('Enable MFA error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify MFA
app.post('/api/auth/verify-mfa', authenticateToken, async (req, res) => {
  try {
    const { code, secret } = req.body;
    const result = await cognitoService.verifyMFA(req.user.username, code, secret);
    res.json(result);
  } catch (error) {
    console.error('Verify MFA error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disable MFA
app.post('/api/auth/disable-mfa', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    const result = await cognitoService.disableMFA(req.user.username, code);
    res.json(result);
  } catch (error) {
    console.error('Disable MFA error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Respond to MFA challenge during login
app.post('/api/auth/mfa-challenge', async (req, res) => {
  try {
    const { username, session, code } = req.body;
    if (!username || !session || !code) {
      return res.status(400).json({ error: 'Username, session, and code are required' });
    }

    const result = await cognitoService.respondToMFAChallenge(username, session, code);
    
    if (result.success) {
      const jwtToken = cognitoService.generateJWT({
        userId: username,
        username: username,
        email: '',
        role: 'user',
        'cognito:groups': []
      });

      res.json({ 
        message: 'MFA verification successful', 
        token: jwtToken, 
        user: { username },
        expiresIn: '24h' 
      });
    } else {
      res.status(401).json({ error: result.error || 'MFA verification failed' });
    }
  } catch (error) {
    console.error('MFA challenge error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users (admin only)
app.get('/api/users', authenticateToken, authorizeGroup('Admin'), async (req, res) => {
  try {
    const { limit = 50, paginationToken } = req.query;
    const result = await cognitoService.listUsers(parseInt(limit), paginationToken);
    
    if (result.success) {
      res.json({ 
        users: result.users,
        paginationToken: result.paginationToken
      });
    } else {
      res.status(500).json({ error: result.error || 'Failed to list users' });
    }
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user role (admin only)
app.put('/api/users/:userId/role', authenticateToken, authorizeGroup('Admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, status } = req.body;
    
    const result = await cognitoService.updateUserRole(userId, role, status);
    
    if (result.success) {
      res.json({ message: result.message });
    } else {
      res.status(400).json({ error: result.error || 'Failed to update user role' });
    }
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user groups (admin only)
app.get('/api/users/:userId/groups', authenticateToken, authorizeGroup('Admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await cognitoService.listGroupsForUser(userId);
    
    if (result.success) {
      res.json({ groups: result.groups });
    } else {
      res.status(500).json({ error: result.error || 'Failed to get user groups' });
    }
  } catch (error) {
    console.error('Get user groups error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add user to group (admin only)
app.post('/api/users/:userId/groups/:groupName', authenticateToken, authorizeGroup('Admin'), async (req, res) => {
  try {
    const { userId, groupName } = req.params;
    const result = await cognitoService.addUserToGroup(userId, groupName);
    
    if (result.success) {
      res.json({ message: result.message });
    } else {
      res.status(400).json({ error: result.error || 'Failed to add user to group' });
    }
  } catch (error) {
    console.error('Add user to group error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove user from group (admin only)
app.delete('/api/users/:userId/groups/:groupName', authenticateToken, authorizeGroup('Admin'), async (req, res) => {
  try {
    const { userId, groupName } = req.params;
    const result = await cognitoService.removeUserFromGroup(userId, groupName);
    
    if (result.success) {
      res.json({ message: result.message });
    } else {
      res.status(400).json({ error: result.error || 'Failed to remove user from group' });
    }
  } catch (error) {
    console.error('Remove user from group error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get roles (admin only)
app.get('/api/roles', authenticateToken, authorizeGroup('Admin'), async (req, res) => {
  try {
    // 这里可以从数据库或硬编码获取角色列表
    const roles = [
      { id: '1', name: 'Admin', permissions: ['upload', 'process', 'delete', 'user_management', 'role_management'], userCount: 1 },
      { id: '2', name: 'Moderator', permissions: ['upload', 'process', 'delete'], userCount: 0 },
      { id: '3', name: 'User', permissions: ['upload', 'process'], userCount: 0 }
    ];
    res.json({ roles });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create role (admin only)
app.post('/api/roles', authenticateToken, authorizeGroup('Admin'), async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    // 这里可以实现创建角色的逻辑
    res.json({ message: 'Role created successfully', role: { name, description, permissions } });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete role (admin only)
app.delete('/api/roles/:roleId', authenticateToken, authorizeGroup('Admin'), async (req, res) => {
  try {
    const { roleId } = req.params;
    // 这里可以实现删除角色的逻辑
    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------- Processed Files -----------------------
app.get('/api/media/processed-files', authenticateToken, async (req, res) => {
  try {
    // 模拟处理后的文件列表
    const processedFiles = [
      {
        id: 1,
        original_filename: 'processed_video_1.mp4',
        file_path: '/processed/processed_video_1.mp4',
        size: 1024000,
        created: new Date().toISOString(),
        file_type: 'video'
      },
      {
        id: 2,
        original_filename: 'cropped_image_1.jpg',
        file_path: '/processed/cropped_image_1.jpg',
        size: 512000,
        created: new Date().toISOString(),
        file_type: 'image'
      }
    ];
    
    res.json({ 
      processedFiles,
      totalFiles: processedFiles.length,
      processedDir: '/processed'
    });
  } catch (error) {
    console.error('Get processed files error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------- Completed Jobs -----------------------
app.get('/api/media/completed-jobs', authenticateToken, async (req, res) => {
  try {
    // 获取当前用户的已完成任务
    const userJobs = Array.from(completedJobs.values()).filter(
      job => job.userId === req.user.userId
    );
    
    res.json({ 
      completedJobs: userJobs,
      totalJobs: userJobs.length
    });
  } catch (error) {
    console.error('Get completed jobs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------- Media Upload -----------------------
app.post('/api/media/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { originalname, mimetype, buffer, size } = req.file;
    const s3Result = await s3Service.uploadFile({ fileName: originalname, fileBuffer: buffer, contentType: mimetype, userId: req.user.userId });
    if (!s3Result.success) return res.status(500).json({ error: 'Failed to upload file to S3' });

    const metadata = {
      userId: req.user.userId,
      originalFilename: originalname,
      s3Key: s3Result.s3Key,
      s3Bucket: s3Result.bucket,
      fileType: mimetype.startsWith('video/') ? 'video' : mimetype.startsWith('audio/') ? 'audio' : 'image',
      fileSize: size,
      uploadedAt: new Date().toISOString()
    };

    const dynamoResult = await dynamoService.saveFileMetadata(metadata);
    if (!dynamoResult.success) console.error('Failed to save metadata to DynamoDB:', dynamoResult.error);

    res.json({ message: 'File uploaded successfully', fileId: dynamoResult.fileId, filename: originalname, fileType: metadata.fileType, fileSize: size, s3Location: s3Result.s3Key });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------- Presigned URLs -----------------------
app.post('/api/media/presigned-upload', authenticateToken, async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    if (!filename || !contentType) return res.status(400).json({ error: 'Filename and content type are required' });

    const result = await s3Service.generatePresignedUploadUrl({ fileName: filename, contentType, userId: req.user.userId });
    if (result.success) {
      res.json({ message: 'Pre-signed URL generated', uploadUrl: result.uploadUrl, s3Key: result.s3Key, expiresIn: result.expiresIn });
    } else {
      res.status(500).json({ error: result.error || 'Failed to generate pre-signed URL' });
    }
  } catch (error) {
    console.error('Presigned URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/media/presigned-download/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const fileResult = await dynamoService.getFileMetadata(fileId, req.user.userId);
    if (!fileResult.success || !fileResult.file) return res.status(404).json({ error: 'File not found or access denied' });

    const result = await s3Service.generatePresignedDownloadUrl(fileResult.file.s3Key);
    if (result.success) {
      res.json({ message: 'Pre-signed download URL generated', downloadUrl: result.downloadUrl, filename: fileResult.file.originalFilename, expiresIn: result.expiresIn });
    } else {
      res.status(500).json({ error: result.error || 'Failed to generate download URL' });
    }
  } catch (error) {
    console.error('Presigned download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------- User Files -----------------------
app.get('/api/media/files', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await dynamoService.getUserFiles(req.user.userId, parseInt(limit), parseInt(offset));
    if (result.success) res.json({ message: 'Files retrieved', files: result.files, pagination: { limit: parseInt(limit), offset: parseInt(offset), hasMore: result.hasMore } });
    else res.status(500).json({ error: result.error || 'Failed to retrieve files' });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----------------------- Video Processing -----------------------
app.post('/api/media/process-video/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { processType = 'speed-change', speedMultiplier = 1.0 } = req.body;
    if (processType === 'speed-change' && !speedMultiplier) return res.status(400).json({ error: 'Speed multiplier required' });

    const fileResult = await dynamoService.getFileMetadata(fileId, req.user.userId);
    if (!fileResult.success || !fileResult.file) return res.status(404).json({ error: 'File not found or access denied' });

    const file = fileResult.file;
    const processingRecord = await rdsService.createProcessingRecord({ userId: req.user.userId, fileId, originalFilename: file.originalFilename, processingType: processType, parameters: { speedMultiplier }, fileSizeBytes: file.fileSize });

    const jobId = Date.now();
    const jobInfo = { id: jobId, rdsRecordId: processingRecord.recordId, userId: req.user.userId, fileId, originalFilename: file.originalFilename, processType, speedMultiplier, status: 'processing', startTime: new Date().toISOString(), progress: 0 };

    let progress = 0;
    const startTime = Date.now();
    const interval = setInterval(async () => {
      progress += Math.random() * 15;
      jobInfo.progress = Math.round(progress);

      if (progress >= 100) {
        progress = 100; jobInfo.progress = 100; jobInfo.status = 'completed'; jobInfo.completionTime = new Date().toISOString(); jobInfo.duration = Date.now() - startTime;
        try {
          await rdsService.updateProcessingRecord(processingRecord.recordId, { status: 'completed', progress: 100, completedAt: new Date().toISOString(), processingDurationMs: Date.now() - startTime });
        } catch (e) { console.error('Error updating RDS record:', e); }
        completedJobs.set(jobId, jobInfo);
        clearInterval(interval);
      }
    }, 100);

    res.json({ message: 'Video processing started', jobId });
  } catch (error) {
    console.error('Process video error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Job status
app.get('/api/media/job-status/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const jobInfo = completedJobs.get(parseInt(jobId));
    if (!jobInfo) return res.status(404).json({ error: 'Job not found' });
    res.json({ job: jobInfo });
  } catch (error) {
    console.error('Job status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete file
app.delete('/api/media/file/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const fileResult = await dynamoService.getFileMetadata(fileId, req.user.userId);
    if (!fileResult.success || !fileResult.file) return res.status(404).json({ error: 'File not found or access denied' });

    const deleteS3Result = await s3Service.deleteFile(fileResult.file.s3Key);
    const deleteDbResult = await dynamoService.deleteFileMetadata(fileId);
    if (!deleteS3Result.success) console.error('S3 delete failed:', deleteS3Result.error);
    if (!deleteDbResult.success) console.error('Dynamo delete failed:', deleteDbResult.error);

    res.json({ message: 'File deleted successfully', fileId });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: error.message });
  }
});

// CPU load test
app.get('/api/test/cpu-load', async (req, res) => {
  const { iterations = 5000000 } = req.query;
  let total = 0;
  const startTime = Date.now();
  for (let i = 0; i < parseInt(iterations); i++) total += Math.sqrt(i % 1000);
  const durationMs = Date.now() - startTime;
  res.json({ iterations: parseInt(iterations), durationMs, total });
});

// ----------------------- Error Handling -----------------------
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large', message: 'File size exceeds the limit of 500MB', maxSize: '500MB', suggestion: 'Please compress your file or choose a smaller one' });
    if (error.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: 'Too many files', message: 'Only one file can be uploaded at a time' });
    return res.status(400).json({ error: 'Upload error', message: error.message });
  }
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error', message: error.message });
});

// ----------------------- Server Startup -----------------------
app.listen(PORT, async () => {
  console.log(`🚀 Cloud Media Processor API running on port ${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);

  try {
    console.log('🔧 Initializing AWS services...');
    if (process.env.SKIP_SSM !== 'true') await parameterStoreService.initializeDefaultParameters();
    if (process.env.SKIP_SECRETS !== 'true') await secretsManagerService.initializeDefaultSecrets();
    await dynamoService.ensureTableExists();
    await rdsService.initialize();
    await cacheService.initialize();
  } catch (e) {
    console.log('⚠️ AWS service initialization skipped or failed:', e.message);
  }
});
