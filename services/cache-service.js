// Cache Service using Redis/ElastiCache for in-memory caching
const { redisClient } = require('./aws-config');

class CacheService {
  constructor() {
    this.client = redisClient;
    this.isConnected = false;
    this.initializeConnection();
  }

  /**
   * Initialize Redis connection
   */
  async initializeConnection() {
    if (!this.client) {
      console.warn('⚠️ Redis client not configured - caching disabled');
      return;
    }

    try {
      await this.client.connect();
      this.isConnected = true;
      console.log('✅ Connected to Redis/ElastiCache');
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      this.isConnected = false;
    }
  }

  /**
   * Check if cache is available
   * @returns {boolean} Cache availability
   */
  isAvailable() {
    return this.client && this.isConnected;
  }

  /**
   * Set cache value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   * @returns {Promise<Object>} Cache result
   */
  async set(key, value, ttl = null) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'Cache not available'
      };
    }

    try {
      const serializedValue = JSON.stringify(value);
      
      if (ttl) {
        await this.client.setex(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }

      console.log(`✅ Cached: ${key} (TTL: ${ttl || 'no expiration'})`);

      return {
        success: true,
        key,
        ttl
      };
    } catch (error) {
      console.error('❌ Cache set error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get cache value
   * @param {string} key - Cache key
   * @returns {Promise<Object>} Cache result
   */
  async get(key) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'Cache not available'
      };
    }

    try {
      const value = await this.client.get(key);
      
      if (value === null) {
        return {
          success: true,
          value: null,
          hit: false
        };
      }

      const parsedValue = JSON.parse(value);

      console.log(`✅ Cache hit: ${key}`);

      return {
        success: true,
        value: parsedValue,
        hit: true
      };
    } catch (error) {
      console.error('❌ Cache get error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete cache value
   * @param {string} key - Cache key
   * @returns {Promise<Object>} Delete result
   */
  async delete(key) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'Cache not available'
      };
    }

    try {
      const result = await this.client.del(key);

      console.log(`✅ Cache deleted: ${key}`);

      return {
        success: true,
        key,
        deleted: result > 0
      };
    } catch (error) {
      console.error('❌ Cache delete error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<Object>} Existence result
   */
  async exists(key) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'Cache not available'
      };
    }

    try {
      const result = await this.client.exists(key);

      return {
        success: true,
        key,
        exists: result > 0
      };
    } catch (error) {
      console.error('❌ Cache exists check error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Set cache value with expiration
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} seconds - Expiration time in seconds
   * @returns {Promise<Object>} Cache result
   */
  async setex(key, value, seconds) {
    return this.set(key, value, seconds);
  }

  /**
   * Get multiple cache values
   * @param {string[]} keys - Array of cache keys
   * @returns {Promise<Object>} Cache results
   */
  async mget(keys) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'Cache not available'
      };
    }

    try {
      const values = await this.client.mget(keys);
      
      const results = keys.map((key, index) => ({
        key,
        value: values[index] ? JSON.parse(values[index]) : null,
        hit: values[index] !== null
      }));

      console.log(`✅ Cache mget: ${keys.length} keys`);

      return {
        success: true,
        results
      };
    } catch (error) {
      console.error('❌ Cache mget error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cache user files list
   * @param {string} userId - User ID
   * @param {Array} files - Files array
   * @param {number} ttl - Cache TTL in seconds (default: 300 = 5 minutes)
   * @returns {Promise<Object>} Cache result
   */
  async cacheUserFiles(userId, files, ttl = 300) {
    const key = `user_files:${userId}`;
    return this.set(key, files, ttl);
  }

  /**
   * Get cached user files list
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Cache result
   */
  async getCachedUserFiles(userId) {
    const key = `user_files:${userId}`;
    return this.get(key);
  }

  /**
   * Cache file metadata
   * @param {string} fileId - File ID
   * @param {Object} metadata - File metadata
   * @param {number} ttl - Cache TTL in seconds (default: 600 = 10 minutes)
   * @returns {Promise<Object>} Cache result
   */
  async cacheFileMetadata(fileId, metadata, ttl = 600) {
    const key = `file_metadata:${fileId}`;
    return this.set(key, metadata, ttl);
  }

  /**
   * Get cached file metadata
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} Cache result
   */
  async getCachedFileMetadata(fileId) {
    const key = `file_metadata:${fileId}`;
    return this.get(key);
  }

  /**
   * Cache processing job status
   * @param {string} jobId - Job ID
   * @param {Object} jobData - Job data
   * @param {number} ttl - Cache TTL in seconds (default: 1800 = 30 minutes)
   * @returns {Promise<Object>} Cache result
   */
  async cacheJobStatus(jobId, jobData, ttl = 1800) {
    const key = `job_status:${jobId}`;
    return this.set(key, jobData, ttl);
  }

  /**
   * Get cached processing job status
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} Cache result
   */
  async getCachedJobStatus(jobId) {
    const key = `job_status:${jobId}`;
    return this.get(key);
  }

  /**
   * Cache application configuration
   * @param {Object} config - Application configuration
   * @param {number} ttl - Cache TTL in seconds (default: 3600 = 1 hour)
   * @returns {Promise<Object>} Cache result
   */
  async cacheAppConfig(config, ttl = 3600) {
    const key = 'app_config';
    return this.set(key, config, ttl);
  }

  /**
   * Get cached application configuration
   * @returns {Promise<Object>} Cache result
   */
  async getCachedAppConfig() {
    const key = 'app_config';
    return this.get(key);
  }

  /**
   * Cache user session data
   * @param {string} userId - User ID
   * @param {Object} sessionData - Session data
   * @param {number} ttl - Cache TTL in seconds (default: 86400 = 24 hours)
   * @returns {Promise<Object>} Cache result
   */
  async cacheUserSession(userId, sessionData, ttl = 86400) {
    const key = `user_session:${userId}`;
    return this.set(key, sessionData, ttl);
  }

  /**
   * Get cached user session data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Cache result
   */
  async getCachedUserSession(userId) {
    const key = `user_session:${userId}`;
    return this.get(key);
  }

  /**
   * Invalidate user-related cache entries
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Invalidation result
   */
  async invalidateUserCache(userId) {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'Cache not available'
      };
    }

    try {
      const keys = [
        `user_files:${userId}`,
        `user_session:${userId}`
      ];

      const results = [];
      for (const key of keys) {
        const result = await this.delete(key);
        results.push({ key, success: result.success });
      }

      console.log(`✅ User cache invalidated: ${userId}`);

      return {
        success: true,
        userId,
        invalidated: results
      };
    } catch (error) {
      console.error('❌ Cache invalidation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getStats() {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'Cache not available'
      };
    }

    try {
      const info = await this.client.info('memory');
      const dbSize = await this.client.dbsize();

      return {
        success: true,
        stats: {
          connected: this.isConnected,
          dbSize,
          memoryInfo: info
        }
      };
    } catch (error) {
      console.error('❌ Cache stats error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clear all cache entries (use with caution)
   * @returns {Promise<Object>} Clear result
   */
  async clearAll() {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'Cache not available'
      };
    }

    try {
      await this.client.flushall();

      console.log('✅ All cache entries cleared');

      return {
        success: true,
        message: 'All cache entries cleared'
      };
    } catch (error) {
      console.error('❌ Cache clear error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new CacheService();
