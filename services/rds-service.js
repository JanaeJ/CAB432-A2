// RDS Service for PostgreSQL database operations
const { Pool } = require('pg');
const secretsManagerService = require('./secrets-manager-service');

class RDSService {
  constructor() {
    this.pool = null;
    this.isInitialized = false;
  }

  /**
   * Initialize database connection pool
   */
  async initialize() {
    try {
      // Get database credentials from Secrets Manager
      const dbCredentials = await secretsManagerService.getDatabaseCredentials();
      
      if (!dbCredentials.success) {
        throw new Error('Failed to get database credentials');
      }

      const credentials = dbCredentials.credentials;
      
      // Create connection pool
      this.pool = new Pool({
        host: credentials.host,
        port: parseInt(credentials.port),
        database: credentials.database,
        user: credentials.username,
        password: credentials.password,
        ssl: credentials.ssl === 'true' ? { rejectUnauthorized: false } : false,
        max: 10, // Maximum number of connections
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      await this.testConnection();
      
      // Create tables if they don't exist
      await this.createTables();
      
      this.isInitialized = true;
      console.log('✅ RDS PostgreSQL service initialized successfully');
      
      return { success: true };
    } catch (error) {
      console.error('❌ RDS initialization error:', error);
      throw error;
    }
  }

  /**
   * Test database connection
   */
  async testConnection() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      
      console.log('✅ RDS connection test successful:', result.rows[0].now);
      return { success: true };
    } catch (error) {
      console.error('❌ RDS connection test failed:', error);
      throw error;
    }
  }

  /**
   * Create required tables
   */
  async createTables() {
    const queries = [
      // User processing history table
      `CREATE TABLE IF NOT EXISTS user_processing_history (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        file_id VARCHAR(255) NOT NULL,
        original_filename VARCHAR(500) NOT NULL,
        processing_type VARCHAR(100) NOT NULL,
        processing_parameters JSONB,
        status VARCHAR(50) DEFAULT 'processing',
        progress INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        processing_duration_ms INTEGER,
        file_size_bytes BIGINT,
        output_file_path VARCHAR(1000),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // User preferences and settings
      `CREATE TABLE IF NOT EXISTS user_preferences (
        user_id VARCHAR(255) PRIMARY KEY,
        default_output_format VARCHAR(20) DEFAULT 'mp4',
        default_quality INTEGER DEFAULT 80,
        auto_delete_originals BOOLEAN DEFAULT FALSE,
        notification_preferences JSONB DEFAULT '{}',
        processing_preferences JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // File processing analytics
      `CREATE TABLE IF NOT EXISTS processing_analytics (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        user_id VARCHAR(255),
        processing_type VARCHAR(100),
        total_files_processed INTEGER DEFAULT 0,
        total_processing_time_ms BIGINT DEFAULT 0,
        total_file_size_bytes BIGINT DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, user_id, processing_type)
      )`,
      
      // Create indexes for better performance
      `CREATE INDEX IF NOT EXISTS idx_user_processing_history_user_id 
       ON user_processing_history(user_id)`,
       
      `CREATE INDEX IF NOT EXISTS idx_user_processing_history_status 
       ON user_processing_history(status)`,
       
      `CREATE INDEX IF NOT EXISTS idx_processing_analytics_date 
       ON processing_analytics(date)`,
    ];

    for (const query of queries) {
      try {
        await this.pool.query(query);
      } catch (error) {
        console.error('Error creating table:', error);
        throw error;
      }
    }

    console.log('✅ RDS tables created successfully');
  }

  /**
   * Record a new processing job
   */
  async createProcessingRecord(processingData) {
    if (!this.isInitialized) await this.initialize();

    try {
      const query = `
        INSERT INTO user_processing_history 
        (user_id, file_id, original_filename, processing_type, processing_parameters, file_size_bytes)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;
      
      const values = [
        processingData.userId,
        processingData.fileId,
        processingData.originalFilename,
        processingData.processingType,
        JSON.stringify(processingData.parameters || {}),
        processingData.fileSizeBytes || 0
      ];

      const result = await this.pool.query(query, values);
      
      console.log(`✅ Processing record created with ID: ${result.rows[0].id}`);
      
      return {
        success: true,
        recordId: result.rows[0].id
      };
    } catch (error) {
      console.error('❌ Error creating processing record:', error);
      throw error;
    }
  }

  /**
   * Update processing record status
   */
  async updateProcessingRecord(recordId, updateData) {
    if (!this.isInitialized) await this.initialize();

    try {
      const query = `
        UPDATE user_processing_history 
        SET status = $1, progress = $2, completed_at = $3, 
            processing_duration_ms = $4, error_message = $5, updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *
      `;
      
      const values = [
        updateData.status,
        updateData.progress || 0,
        updateData.completedAt || null,
        updateData.processingDurationMs || null,
        updateData.errorMessage || null,
        recordId
      ];

      const result = await this.pool.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Processing record not found');
      }
      
      console.log(`✅ Processing record ${recordId} updated`);
      
      return {
        success: true,
        record: result.rows[0]
      };
    } catch (error) {
      console.error('❌ Error updating processing record:', error);
      throw error;
    }
  }

  /**
   * Get user processing history
   */
  async getUserProcessingHistory(userId, limit = 50, offset = 0) {
    if (!this.isInitialized) await this.initialize();

    try {
      const query = `
        SELECT * FROM user_processing_history 
        WHERE user_id = $1 
        ORDER BY started_at DESC 
        LIMIT $2 OFFSET $3
      `;
      
      const result = await this.pool.query(query, [userId, limit, offset]);
      
      return {
        success: true,
        history: result.rows,
        total: result.rowCount
      };
    } catch (error) {
      console.error('❌ Error getting processing history:', error);
      throw error;
    }
  }

  /**
   * Get processing analytics
   */
  async getProcessingAnalytics(userId, days = 30) {
    if (!this.isInitialized) await this.initialize();

    try {
      const query = `
        SELECT 
          date,
          processing_type,
          total_files_processed,
          total_processing_time_ms,
          success_count,
          error_count
        FROM processing_analytics 
        WHERE user_id = $1 AND date >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY date DESC
      `;
      
      const result = await this.pool.query(query, [userId]);
      
      return {
        success: true,
        analytics: result.rows
      };
    } catch (error) {
      console.error('❌ Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Close database connection pool
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('✅ RDS connection pool closed');
    }
  }
}

module.exports = new RDSService();