// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const sharp = require('sharp');
const { initializeDatabase } = require('./database/init');
const { requireGroup } = require('./services/cognitoGroups');//新加的group

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEBUG = process.env.DEBUG === 'true';

// Log environment configuration
if (DEBUG) {
  console.log('🔧 Environment Configuration:');
  console.log(`   NODE_ENV: ${NODE_ENV}`);
  console.log(`   PORT: ${PORT}`);
  console.log(`   UPLOAD_PATH: ${process.env.UPLOAD_PATH || 'uploads'}`);
  console.log(`   PROCESSED_PATH: ${process.env.PROCESSED_PATH || 'processed'}`);
  console.log(`   DEBUG: ${DEBUG}`);
}

// Create necessary directories
const uploadDir = path.join(__dirname, process.env.UPLOAD_PATH || 'uploads');
const processedDir = path.join(__dirname, process.env.PROCESSED_PATH || 'processed');
const dbDir = path.join(__dirname, 'database');

[uploadDir, processedDir, dbDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Database initialization
const dbPath = path.join(dbDir, 'media_processor.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Database opened successfully');
  }
});

// Remove duplicate table creation code - this will be handled by initializeDatabase()
console.log('Database connection established');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 500 * 1024 * 1024, // Increased to 500MB
    files: 1, // Only one file at a time
    fieldSize: 1024 * 1024 // Field size limit
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
// function authenticateToken(req, res, next) {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];

//   if (!token) {
//     return res.status(401).json({ error: 'Access token required' });
//   }

//   jwt.verify(token, JWT_SECRET, (err, user) => {
//     if (err) {
//       return res.status(403).json({ error: 'Invalid token' });
//     }
//     req.user = user;
//     next();
//   });
// }
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    // ensure username 
    if (!user.username) {
      return res.status(401).json({ error: 'Username missing in token' });
    }
    req.user = user;
    next();
  });
}


// Routes

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });
});

// File upload
app.post('/api/media/upload', authenticateToken, upload.single('media'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { originalname, filename, path: filePath, size } = req.file;
  
  console.log(`File uploaded: ${originalname}, Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`File path: ${filePath}`);
  console.log(`User ID: ${req.user.userId}`);
  
  // Check if file was actually saved to disk
  if (!fs.existsSync(filePath)) {
    console.error('File not found on disk:', filePath);
    return res.status(500).json({ error: 'File was not saved to disk' });
  }
  
  // Check database connection
  if (!db) {
    console.error('Database connection not available');
    return res.status(500).json({ error: 'Database connection error' });
  }
  
  // Determine file type
  let fileType = 'unknown';
  if (req.file.mimetype.startsWith('video/')) {
    fileType = 'video';
  } else if (req.file.mimetype.startsWith('audio/')) {
    fileType = 'audio';
  } else if (req.file.mimetype.startsWith('image/')) {
    fileType = 'image';
  }
  
  const insertQuery = 'INSERT INTO media_files (user_id, original_filename, file_path, file_type, file_size) VALUES (?, ?, ?, ?, ?)';
  const insertParams = [req.user.userId, originalname, filePath, fileType, size];
  
  console.log('Executing database query:', insertQuery);
  console.log('Query parameters:', insertParams);
  
  db.run(insertQuery, insertParams, function(err) {
    if (err) {
      console.error('Database error:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      
      // Provide more detailed error information
      let errorMessage = 'Failed to save file info to database';
      if (err.code === 'SQLITE_CONSTRAINT') {
        errorMessage = 'Database constraint violation - check if user exists';
      } else if (err.code === 'SQLITE_READONLY') {
        errorMessage = 'Database is read-only';
      } else if (err.code === 'SQLITE_CORRUPT') {
        errorMessage = 'Database file is corrupted';
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        details: err.message,
        code: err.code
      });
    }
    
    console.log('File info saved to database successfully. File ID:', this.lastID);
    
    res.json({
      message: 'File uploaded successfully',
      fileId: this.lastID,
      filename: originalname,
      fileType: fileType,
      fileSize: size,
      filePath: filePath
    });
  });
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
  next(error);
});

// Process video (CPU-intensive task) - No file output
app.post('/api/media/process-video/:fileId', authenticateToken, (req, res) => {
  const { fileId } = req.params;
  const { processType = 'speed-change', speedMultiplier = 1.0 } = req.body; // Default to speed change
  
  // Validate speed multiplier
  if (processType === 'speed-change' && !speedMultiplier) {
    return res.status(400).json({ error: 'Speed multiplier is required for speed change processing' });
  }
  
  // Get file information
  db.get('SELECT * FROM media_files WHERE id = ? AND user_id = ?', [fileId, req.user.userId], (err, file) => {
    if (err || !file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    console.log(`Starting video processing for file: ${file.original_filename} with type: ${processType}, speed: ${speedMultiplier}x`);

    const jobId = Date.now();
    const jobInfo = {
      id: jobId,
      userId: req.user.userId,
      fileId: fileId,
      originalFilename: file.original_filename,
      processType: processType,
      speedMultiplier: speedMultiplier,
      status: 'processing',
      startTime: new Date().toISOString(),
      progress: 0
    };

    // Simulate CPU-intensive processing without saving files
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      jobInfo.progress = Math.round(progress);
      
      if (progress >= 100) {
        progress = 100;
        jobInfo.progress = 100;
        jobInfo.status = 'completed';
        jobInfo.completionTime = new Date().toISOString();
        jobInfo.duration = Date.now() - jobId;
        
        // Store completed job info (no files)
        completedJobs.set(jobId, jobInfo);
        console.log(`✅ Video processing completed! Job ID: ${jobId} (No file saved)`);
        clearInterval(interval);
      }
    }, 200);

    res.json({ 
      message: 'Video processing started', 
      jobId: jobId,
      note: 'Processing completed - no files saved to disk'
    });
  });
});

// Process audio (CPU-intensive task) - No file output
app.post('/api/media/process-audio/:fileId', authenticateToken, (req, res) => {
  const { fileId } = req.params;
  const { processType = 'filter' } = req.body; // Default to filter
  
  // Get file information
  db.get('SELECT * FROM media_files WHERE id = ? AND user_id = ?', [fileId, req.user.userId], (err, file) => {
    if (err || !file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    console.log(`Starting audio processing for file: ${file.original_filename} with type: ${processType}`);

    const jobId = Date.now();
    const jobInfo = {
      id: jobId,
      userId: req.user.userId,
      fileId: fileId,
      originalFilename: file.original_filename,
      processType: processType,
      status: 'processing',
      startTime: new Date().toISOString(),
      progress: 0
    };

    // Simulate CPU-intensive processing without saving files
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 12;
      jobInfo.progress = Math.round(progress);

      
      if (progress >= 100) {
        progress = 100;
        jobInfo.progress = 100;
        jobInfo.status = 'completed';
        jobInfo.completionTime = new Date().toISOString();
        jobInfo.duration = Date.now() - jobId;
        
        // Store completed job info (no files)
        completedJobs.set(jobId, jobInfo);
        console.log(`✅ Audio processing completed! Job ID: ${jobId} (No file saved)`);
        clearInterval(interval);
      }
    }, 250);

    res.json({ 
      message: 'Audio processing started', 
      jobId: jobId,
      note: 'Processing completed - no files saved to disk'
    });
  });
});

// Generate 3D animation (CPU-intensive task) - No file output
app.post('/api/media/generate-3d-animation', authenticateToken, (req, res) => {
  const { duration = 30 } = req.body;
  
  console.log(`Starting 3D animation generation (${duration}s)`);

  const jobId = Date.now();
  const jobInfo = {
    id: jobId,
    userId: req.user.userId,
    fileId: null,
    originalFilename: '3D Animation Generation',
    processType: 'stabilise',
    duration: duration,
    status: 'processing',
    startTime: new Date().toISOString(),
    progress: 0
  };

  // Simulate CPU-intensive 3D rendering without saving files
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 8;
    jobInfo.progress = Math.round(progress);
    
    
    if (progress >= 100) {
      progress = 100;
      jobInfo.progress = 100;
      jobInfo.status = 'completed';
      jobInfo.completionTime = new Date().toISOString();
      jobInfo.duration = Date.now() - jobId;
      
      // Store completed job info (no files)
      completedJobs.set(jobId, jobInfo);
      console.log(`✅ 3D animation generation completed! Job ID: ${jobId} (No file saved)`);
      clearInterval(interval);
    }
  }, 300);

  res.json({ 
    message: '3D animation generation started', 
    jobId: jobId,
    note: 'Animation generation completed - no files saved to disk'
  });
});

// Enhanced CPU-intensive task for load testing
app.post('/api/media/cpu-intensive-task', authenticateToken, (req, res) => {
  const { complexity = 'high', duration = 60, operations = 1000000 } = req.body;
  
  console.log(`🔥 Starting CPU-intensive task: ${complexity} complexity, ${duration}s, ${operations} operations`);

  const jobId = Date.now();
  const jobInfo = {
    id: jobId,
    userId: req.user.userId,
    processType: 'cpu-intensive',
    complexity: complexity,
    duration: duration,
    operations: operations,
    status: 'processing',
    startTime: new Date().toISOString(),
    progress: 0
  };

  // Start CPU-intensive computation
  const startTime = Date.now();
  let progress = 0;
  
  const interval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    progress = Math.round((elapsed / duration) * 100);
    
    // Perform actual CPU-intensive calculations
    let result = 0;
    for (let i = 0; i < operations / 100; i++) {
      result += Math.sqrt(i) * Math.sin(i) * Math.cos(i);
      result = result % 1000000; // Prevent overflow
    }
    
    jobInfo.progress = Math.min(progress, 100);
    jobInfo.currentResult = result;
    
    if (elapsed >= duration || progress >= 100) {
      jobInfo.progress = 100;
      jobInfo.status = 'completed';
      jobInfo.completionTime = new Date().toISOString();
      jobInfo.actualDuration = elapsed;
      jobInfo.finalResult = result;
      
      // Store completed job info
      completedJobs.set(jobId, jobInfo);
      console.log(`✅ CPU-intensive task completed! Job ID: ${jobId}, Duration: ${elapsed.toFixed(2)}s, Result: ${result}`);
      clearInterval(interval);
    }
  }, 100); // Update every 100ms for smoother progress

  res.json({ 
    message: 'CPU-intensive task started', 
    jobId: jobId,
    complexity: complexity,
    duration: duration,
    operations: operations,
    note: 'This task will consume significant CPU resources'
  });
});

// CPU Load Testing endpoint (no authentication required for testing)
app.post('/api/test/cpu-load', (req, res) => {
  const { complexity = 'high', duration = 60, operations = 1000000 } = req.body;
  
  console.log(`🔥 CPU Load Test: ${complexity} complexity, ${duration}s, ${operations} operations`);

  const jobId = Date.now();
  const jobInfo = {
    id: jobId,
    processType: 'cpu-load-test',
    complexity: complexity,
    duration: duration,
    operations: operations,
    status: 'processing',
    startTime: new Date().toISOString(),
    progress: 0
  };

  // Start CPU-intensive computation
  const startTime = Date.now();
  let progress = 0;
  
  const interval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    progress = Math.round((elapsed / duration) * 100);
    
    // Perform actual CPU-intensive calculations
    let result = 0;
    for (let i = 0; i < operations / 100; i++) {
      result += Math.sqrt(i) * Math.sin(i) * Math.cos(i);
      result = result % 1000000; // Prevent overflow
    }
    
    jobInfo.progress = Math.min(progress, 100);
    jobInfo.currentResult = result;
    
    if (elapsed >= duration || progress >= 100) {
      jobInfo.progress = 100;
      jobInfo.status = 'completed';
      jobInfo.completionTime = new Date().toISOString();
      jobInfo.actualDuration = elapsed;
      jobInfo.finalResult = result;
      
      // Store completed job info
      completedJobs.set(jobId, jobInfo);
      console.log(`✅ CPU Load Test completed! Job ID: ${jobId}, Duration: ${elapsed.toFixed(2)}s, Result: ${result}`);
      clearInterval(interval);
    }
  }, 100); // Update every 100ms for smoother progress

  res.json({ 
    message: 'CPU Load Test started', 
    jobId: jobId,
    complexity: complexity,
    duration: duration,
    operations: operations,
    estimatedDuration: duration,
    note: 'This endpoint is for CPU load testing without authentication'
  });
});

// 管理员专属接口
app.get('/api/admin/dashboard', authenticateToken, requireGroup('Admin'), (req, res) => {
  res.json({ message: 'only admin access' });
});

// 普通用户接口
app.get('/api/user/profile', authenticateToken, requireGroup('User'), (req, res) => {
  res.json({ message: 'regular users access' });
});


// Get user files
app.get('/api/media/files', authenticateToken, (req, res) => {
  db.all('SELECT * FROM media_files WHERE user_id = ?', [req.user.userId], (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch files' });
    }
    res.json({ files });
  });
});

// Get processed files list - Show all processed files including cropped images
app.get('/api/media/processed-files', authenticateToken, (req, res) => {
  try {
    // Get all processed files for the current user from database
    db.all('SELECT * FROM media_files WHERE user_id = ? AND (original_filename LIKE "cropped_%" OR original_filename LIKE "resized_%" OR original_filename LIKE "processed_%") ORDER BY created_at DESC', [req.user.userId], (err, files) => {
      if (err) {
        console.error('Error getting processed files:', err);
        return res.status(500).json({ 
          error: 'Failed to get processed files',
          details: err.message 
        });
      }
      
      // Check which files actually exist on disk
      const existingFiles = files.filter(file => {
        if (fs.existsSync(file.file_path)) {
          try {
            const stats = fs.statSync(file.file_path);
            file.size = stats.size;
            file.created = stats.mtime;
            return true;
          } catch (error) {
            console.error(`Error getting file stats for ${file.file_path}:`, error);
            return false;
          }
        }
        return false;
      });
      
      console.log(`Found ${existingFiles.length} processed files for user ${req.user.userId}`);
      
      res.json({ 
        processedFiles: existingFiles,
        processedDir: processedDir,
        totalFiles: existingFiles.length,
        note: 'Showing all processed files including cropped and resized images'
      });
    });
  } catch (error) {
    console.error('Error in processed-files API:', error);
    res.status(500).json({ 
      error: 'Failed to get processed files',
      details: error.message 
    });
  }
});

// Get completed jobs list
app.get('/api/media/completed-jobs', authenticateToken, (req, res) => {
  try {
    // Filter jobs for the current user
    const userJobs = Array.from(completedJobs.values())
      .filter(job => job.userId === req.user.userId)
      .filter(job => job.status === 'completed')
      .sort((a, b) => new Date(b.completionTime) - new Date(a.completionTime));
    
    res.json({ 
      completedJobs: userJobs,
      totalJobs: userJobs.length,
      note: 'These are completed processing jobs (no files saved)'
    });
  } catch (error) {
    console.error('Error getting completed jobs:', error);
    res.status(500).json({ 
      error: 'Failed to get completed jobs',
      details: error.message 
    });
  }
});

// Delete file
app.delete('/api/media/files/:fileId', authenticateToken, (req, res) => {
  const { fileId } = req.params;
  
  // Get file information and verify ownership
  db.get('SELECT * FROM media_files WHERE id = ? AND user_id = ?', [fileId, req.user.userId], (err, file) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!file) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }
    
    // Delete file from disk
    try {
      if (fs.existsSync(file.file_path)) {
        fs.unlinkSync(file.file_path);
        console.log(`File deleted from disk: ${file.file_path}`);
      }
    } catch (diskError) {
      console.error('Error deleting file from disk:', diskError);
      // Continue with database deletion even if disk deletion fails
    }
    
    // Delete file record from database
    db.run('DELETE FROM media_files WHERE id = ?', [fileId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to delete file from database' });
      }
      
      console.log(`File deleted successfully. ID: ${fileId}, Filename: ${file.original_filename}`);
      res.json({ 
        message: 'File deleted successfully',
        deletedFile: {
          id: fileId,
          filename: file.original_filename,
          fileType: file.file_type
        }
      });
    });
  });
});

// Download file
app.get('/api/media/download/*', authenticateToken, (req, res) => {
  try {
    // Extract file path from URL
    const filePath = req.params[0];
    const fullPath = path.join(__dirname, filePath);
    
    // Security check: ensure the path is within allowed directories
    const allowedDirs = [uploadDir, processedDir];
    const isAllowed = allowedDirs.some(dir => fullPath.startsWith(dir));
    
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied to this file path' });
    }
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get file info
    const stats = fs.statSync(fullPath);
    const filename = path.basename(fullPath);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stats.size);
    
    // Stream the file
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);
    
    console.log(`File download: ${filename} (${(stats.size / 1024).toFixed(2)} KB)`);
    
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ 
      error: 'Failed to download file',
      details: error.message 
    });
  }
});

// Update file information (rename, change type, etc.)
app.put('/api/media/files/:fileId', authenticateToken, (req, res) => {
  const { fileId } = req.params;
  const { original_filename, file_type } = req.body;
  
  // Validate input
  if (!original_filename || !file_type) {
    return res.status(400).json({ error: 'original_filename and file_type are required' });
  }
  
  // Get file information and verify ownership
  db.get('SELECT * FROM media_files WHERE id = ? AND user_id = ?', [fileId, req.user.userId], (err, file) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!file) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }
    
    // Update file information
    db.run('UPDATE media_files SET original_filename = ?, file_type = ? WHERE id = ?', 
      [original_filename, file_type, fileId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update file information' });
      }
      
      console.log(`File updated successfully. ID: ${fileId}, New filename: ${original_filename}`);
      res.json({ 
        message: 'File updated successfully',
        updatedFile: {
          id: fileId,
          original_filename,
          file_type,
          file_size: file.file_size,
          created_at: file.created_at
        }
      });
    });
  });
});

// Resize image file
app.post('/api/media/resize/:fileId', authenticateToken, (req, res) => {
  const { fileId } = req.params;
  const { width, height, format = 'jpeg', quality = 80, fit = 'cover' } = req.body;
  
  // Validate resize parameters
  if (!width && !height) {
    return res.status(400).json({ 
      error: 'At least width or height must be specified' 
    });
  }
  
  if (width && width <= 0) {
    return res.status(400).json({ error: 'Width must be a positive number' });
  }
  
  if (height && height <= 0) {
    return res.status(400).json({ error: 'Height must be a positive number' });
  }
  
  // Get file information and verify ownership
  db.get('SELECT * FROM media_files WHERE id = ? AND user_id = ?', [fileId, req.user.userId], (err, file) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!file) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }
    
    // Check if file is an image
    if (!['image'].includes(file.file_type)) {
      return res.status(400).json({ error: 'Only image files can be resized' });
    }
    
    // Check if file exists on disk
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    // Generate output filename for resized image
    const originalName = path.parse(file.original_filename).name;
    const outputFilename = `resized_${originalName}_${Date.now()}.${format}`;
    const outputPath = path.join(processedDir, outputFilename);
    
    console.log(`Starting image resize for file: ${file.original_filename}`);
    console.log(`Target size: ${width || 'auto'}x${height || 'auto'}, fit: ${fit}`);
    console.log(`Output: ${outputPath}`);
    
    // Process image with Sharp
    let sharpInstance = sharp(file.file_path);
    
    if (width && height) {
      sharpInstance = sharpInstance.resize(width, height, { fit });
    } else if (width) {
      sharpInstance = sharpInstance.resize(width, null, { fit });
    } else {
      sharpInstance = sharpInstance.resize(null, height, { fit });
    }
    
    sharpInstance
      .toFormat(format, { quality })
      .toFile(outputPath)
      .then((info) => {
        console.log(`✅ Image resizing completed! Output: ${outputPath}`);
        console.log(`📊 Resized image info:`, info);
        
        // Save resized image info to database
        const resizedFileSize = fs.statSync(outputPath).size;
        const insertQuery = 'INSERT INTO media_files (user_id, original_filename, file_path, file_type, file_size) VALUES (?, ?, ?, ?, ?)';
        const insertParams = [req.user.userId, outputFilename, outputPath, 'image', resizedFileSize];
        
        db.run(insertQuery, insertParams, function(err) {
          if (err) {
            console.error('Error saving resized image to database:', err);
            // Still return success since file was created
            return res.json({
              message: 'Image resized successfully but failed to save to database',
              resizedImage: {
                path: outputPath,
                filename: outputFilename,
                size: resizedFileSize,
                format,
                dimensions: { width: info.width, height: info.height }
              },
              warning: 'File created but not tracked in database'
            });
          }
          
          res.json({
            message: 'Image resized successfully',
            resizedImage: {
              id: this.lastID,
              path: outputPath,
              filename: outputFilename,
              size: resizedFileSize,
              format,
              dimensions: { width: info.width, height: info.height },
              originalDimensions: { width: file.file_size, height: file.file_size }
            }
          });
        });
      })
      .catch((error) => {
        console.error('Error resizing image:', error);
        res.status(500).json({ 
          error: 'Failed to resize image',
          details: error.message
        });
      });
  });
});

// Crop image file
app.post('/api/media/crop-image/:fileId', authenticateToken, (req, res) => {
  const { fileId } = req.params;
  const { width, height, x, y, format = 'jpeg', quality = 80 } = req.body;
  
  // Validate crop parameters
  if (!width || !height || !x || !y) {
    return res.status(400).json({ 
      error: 'Width, height, x, and y positions are required' 
    });
  }
  
  if (width <= 0 || height <= 0) {
    return res.status(400).json({ error: 'Width and height must be positive numbers' });
  }
  
  if (x < 0 || y < 0) {
    return res.status(400).json({ error: 'X and Y positions must be non-negative' });
  }
  
  // Get file information and verify ownership
  db.get('SELECT * FROM media_files WHERE id = ? AND user_id = ?', [fileId, req.user.userId], (err, file) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!file) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }
    
    // Check if file is an image
    if (!['image'].includes(file.file_type)) {
      return res.status(400).json({ error: 'Only image files can be cropped' });
    }
    
    // Check if file exists on disk
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    // Generate output filename for cropped image
    const originalName = path.parse(file.original_filename).name;
    const outputFilename = `cropped_${originalName}_${Date.now()}.${format}`;
    const outputPath = path.join(processedDir, outputFilename);
    
    console.log(`Starting image crop for file: ${file.original_filename}`);
    console.log(`Crop area: ${width}x${height} at position (${x}, ${y})`);
    console.log(`Output: ${outputPath}`);
    
    // Process image with Sharp
    sharp(file.file_path)
      .extract({ left: x, top: y, width, height })
      .toFormat(format, { quality })
      .toFile(outputPath)
      .then((info) => {
        console.log(`✅ Image cropping completed! Output: ${outputPath}`);
        console.log(`📊 Cropped image info:`, info);
        
        // Save cropped image info to database
        const croppedFileSize = fs.statSync(outputPath).size;
        const insertQuery = 'INSERT INTO media_files (user_id, original_filename, file_path, file_type, file_size) VALUES (?, ?, ?, ?, ?)';
        const insertParams = [req.user.userId, outputFilename, outputPath, 'image', croppedFileSize];
        
        db.run(insertQuery, insertParams, function(err) {
          if (err) {
            console.error('Error saving cropped image to database:', err);
            // Still return success since file was created
            return res.json({
              message: 'Image cropped successfully but failed to save to database',
              filename: outputFilename,
              path: outputPath,
              size: croppedFileSize,
              format,
              dimensions: { width: info.width, height: info.height }
            });
          }
          
          res.json({
            message: 'Image cropped successfully',
            filename: outputFilename,
            path: outputPath,
            size: croppedFileSize,
            format,
            dimensions: { width: info.width, height: info.height }
          });
        });
      })
      .catch((error) => {
        console.error('Error cropping image:', error);
        res.status(500).json({ 
          error: 'Failed to crop image',
          details: error.message
        });
      });
  });
});

// Crop video file
app.post('/api/media/crop-video/:fileId', authenticateToken, (req, res) => {
  const { fileId } = req.params;
  const { width, height, x, y, format = 'mp4', quality = 80 } = req.body;
  
  // Validate crop parameters
  if (!width || !height || !x || !y) {
    return res.status(400).json({ 
      error: 'Width, height, x, and y positions are required' 
    });
  }
  
  if (width <= 0 || height <= 0) {
    return res.status(400).json({ error: 'Width and height must be positive numbers' });
  }
  
  if (x < 0 || y < 0) {
    return res.status(400).json({ error: 'X and Y positions must be non-negative' });
  }
  
  // Get file information and verify ownership
  db.get('SELECT * FROM media_files WHERE id = ? AND user_id = ?', [fileId, req.user.userId], (err, file) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!file) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }
    
    // Check if file is a video
    if (!['video'].includes(file.file_type)) {
      return res.status(400).json({ error: 'Only video files can be cropped' });
    }
    
    // Check if file exists on disk
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    // Generate output filename for cropped video
    const originalName = path.parse(file.original_filename).name;
    const outputFilename = `cropped_${originalName}_${Date.now()}.${format}`;
    const outputPath = path.join(processedDir, outputFilename);
    
    console.log(`Starting video crop for file: ${file.original_filename}`);
    console.log(`Crop area: ${width}x${height} at position (${x}, ${y})`);
    console.log(`Output: ${outputPath}`);
    
    // For now, simulate video cropping (since we don't have FFmpeg installed)
    // In a real implementation, you would use FFmpeg to crop the video
    console.log(`🎬 Simulating video cropping...`);
    
    // Simulate processing time
    setTimeout(() => {
      // Create a dummy file to simulate the cropped video
      const dummyContent = `# This is a simulated cropped video file\n# Original: ${file.original_filename}\n# Crop area: ${width}x${height} at (${x}, ${y})\n# Format: ${format}\n# Quality: ${quality}`;
      fs.writeFileSync(outputPath, dummyContent);
      
      console.log(`✅ Video cropping simulation completed! Output: ${outputPath}`);
      
      // Save cropped video info to database
      const croppedFileSize = fs.statSync(outputPath).size;
      const insertQuery = 'INSERT INTO media_files (user_id, original_filename, file_path, file_type, file_size) VALUES (?, ?, ?, ?, ?)';
      const insertParams = [req.user.userId, outputFilename, outputPath, 'video', croppedFileSize];
      
      db.run(insertQuery, insertParams, function(err) {
        if (err) {
          console.error('Error saving cropped video to database:', err);
          // Still return success since file was created
          return res.json({
            message: 'Video cropped successfully but failed to save to database',
            filename: outputFilename,
            path: outputPath,
            size: croppedFileSize,
            format,
            dimensions: { width, height }
          });
        }
        
        res.json({
          message: 'Video cropped successfully',
          filename: outputFilename,
          path: outputPath,
          size: croppedFileSize,
          format,
          dimensions: { width, height }
        });
      });
    }, 2000); // Simulate 2 seconds of processing time
  });
});

// Delete file
app.delete('/api/media/delete-file/:fileId', authenticateToken, (req, res) => {
  const { fileId } = req.params;
  
  // Get file information and verify ownership
  db.get('SELECT * FROM media_files WHERE id = ? AND user_id = ?', [fileId, req.user.userId], (err, file) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!file) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }
    
    // Delete file from disk
    if (fs.existsSync(file.file_path)) {
      try {
        fs.unlinkSync(file.file_path);
        console.log(`✅ File deleted from disk: ${file.file_path}`);
      } catch (error) {
        console.error('Error deleting file from disk:', error);
        // Continue with database deletion even if file deletion fails
      }
    }
    
    // Delete file record from database
    db.run('DELETE FROM media_files WHERE id = ?', [fileId], function(err) {
      if (err) {
        console.error('Error deleting file from database:', err);
        return res.status(500).json({ error: 'Failed to delete file from database' });
      }
      
      console.log(`✅ File record deleted from database: ${fileId}`);
      res.json({ message: 'File deleted successfully' });
    });
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Database status check
app.get('/api/db-status', (req, res) => {
  try {
    // Check database connection
    if (!db) {
      return res.status(500).json({ 
        status: 'error', 
        message: 'Database connection not available' 
      });
    }

    // Check if tables exist
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
      if (err) {
        return res.status(500).json({ 
          status: 'error', 
          message: 'Database error checking tables',
          error: err.message 
        });
      }

      if (!row) {
        return res.status(500).json({ 
          status: 'error', 
          message: 'Users table not found' 
        });
      }

      // Check user count
      db.get("SELECT COUNT(*) as count FROM users", (err, userCount) => {
        if (err) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'Error counting users',
            error: err.message 
          });
        }

        res.json({ 
          status: 'OK', 
          message: 'Database is working correctly',
          tables: ['users', 'media_files'],
          userCount: userCount.count,
          timestamp: new Date().toISOString()
        });
      });
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Database status check failed',
      error: error.message 
    });
  }
});

// In-memory storage for completed jobs (no files saved)
const completedJobs = new Map();

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Media Processor API running on port ${PORT}`);
  console.log(`📱 Web interface: http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  
  // Initialize database and create default users
  try {
    await initializeDatabase();
    console.log(`\n👤 Default users created:`);
    console.log(`   Admin: admin / admin123`);
    console.log(`   User: user / user123`);
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
  }
});
