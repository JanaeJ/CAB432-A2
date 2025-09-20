// Parameter Store Service for application configuration
const { 
  ssmClient, 
  parameterStoreConfig, 
  SSMCommands 
} = require('./aws-config');

class ParameterStoreService {
  constructor() {
    this.prefix = parameterStoreConfig.prefix;
  }

  /**
   * Get parameter value
   * @param {string} parameterName - Parameter name (without prefix)
   * @param {boolean} withDecryption - Whether to decrypt the parameter
   * @returns {Promise<Object>} Parameter value
   */
  async getParameter(parameterName, withDecryption = false) {
    try {
      const fullParameterName = `${this.prefix}${parameterName}`;
      
      const command = new SSMCommands.GetParameterCommand({
        Name: fullParameterName,
        WithDecryption: withDecryption
      });

      const result = await ssmClient.send(command);

      console.log(`✅ Parameter retrieved: ${parameterName}`);

      return {
        success: true,
        name: parameterName,
        value: result.Parameter.Value,
        type: result.Parameter.Type,
        version: result.Parameter.Version,
        lastModifiedDate: result.Parameter.LastModifiedDate
      };
    } catch (error) {
      console.error('❌ Parameter Store get error:', error);
      
      if (error.name === 'ParameterNotFound') {
        return {
          success: false,
          error: 'Parameter not found'
        };
      }
      
      throw new Error(`Failed to get parameter: ${error.message}`);
    }
  }

  /**
   * Put parameter value
   * @param {string} parameterName - Parameter name (without prefix)
   * @param {string} value - Parameter value
   * @param {string} type - Parameter type (String, StringList, SecureString)
   * @param {string} description - Parameter description
   * @param {boolean} overwrite - Whether to overwrite existing parameter
   * @returns {Promise<Object>} Put result
   */
  async putParameter(parameterName, value, type = 'String', description = '', overwrite = true) {
    try {
      const fullParameterName = `${this.prefix}${parameterName}`;
      
      const command = new SSMCommands.PutParameterCommand({
        Name: fullParameterName,
        Value: value,
        Type: type,
        Description: description,
        Overwrite: overwrite
      });

      const result = await ssmClient.send(command);

      console.log(`✅ Parameter stored: ${parameterName}`);

      return {
        success: true,
        name: parameterName,
        version: result.Version,
        tier: result.Tier
      };
    } catch (error) {
      console.error('❌ Parameter Store put error:', error);
      throw new Error(`Failed to put parameter: ${error.message}`);
    }
  }

  /**
   * Get application configuration parameters
   * @returns {Promise<Object>} Application configuration
   */
  async getApplicationConfig() {
    try {
      const configParams = [
        'app-url',
        'api-url',
        'frontend-url',
        'max-file-size',
        'allowed-file-types',
        'cpu-test-duration',
        'rate-limit-max-requests'
      ];

      const config = {};
      const errors = [];

      // Get all configuration parameters
      for (const paramName of configParams) {
        try {
          const result = await this.getParameter(paramName);
          if (result.success) {
            config[paramName.replace(/-/g, '_')] = result.value;
          } else {
            errors.push(`${paramName}: not found`);
          }
        } catch (error) {
          errors.push(`${paramName}: ${error.message}`);
        }
      }

      console.log(`✅ Application configuration loaded: ${Object.keys(config).length} parameters`);

      return {
        success: true,
        config,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      console.error('❌ Error loading application config:', error);
      throw new Error(`Failed to load application configuration: ${error.message}`);
    }
  }

  /**
   * Store application configuration
   * @param {Object} config - Configuration object
   * @returns {Promise<Object>} Storage result
   */
  async storeApplicationConfig(config) {
    try {
      const results = [];
      const errors = [];

      // Store each configuration parameter
      for (const [key, value] of Object.entries(config)) {
        try {
          const paramName = key.replace(/_/g, '-');
          const result = await this.putParameter(
            paramName,
            value.toString(),
            'String',
            `Application configuration: ${paramName}`
          );
          
          if (result.success) {
            results.push(`${paramName}: stored`);
          }
        } catch (error) {
          errors.push(`${key}: ${error.message}`);
        }
      }

      console.log(`✅ Application configuration stored: ${results.length} parameters`);

      return {
        success: true,
        stored: results,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      console.error('❌ Error storing application config:', error);
      throw new Error(`Failed to store application configuration: ${error.message}`);
    }
  }

  /**
   * Initialize default application parameters
   * @returns {Promise<Object>} Initialization result
   */
  async initializeDefaultParameters() {
    try {
      const defaultConfig = {
        'app-url': process.env.API_URL || 'https://your-subdomain.cab432.com',
        'api-url': process.env.API_URL || 'https://your-subdomain.cab432.com/api',
        'frontend-url': process.env.FRONTEND_URL || 'https://your-subdomain.cab432.com',
        'max-file-size': process.env.MAX_FILE_SIZE || '500MB',
        'allowed-file-types': 'mp4,avi,mov,mkv,mp3,wav,flac,aac,jpg,jpeg,png,gif',
        'cpu-test-duration': process.env.CPU_TEST_DURATION || '30',
        'rate-limit-max-requests': process.env.RATE_LIMIT_MAX_REQUESTS || '100',
        'aws-region': process.env.AWS_REGION || 'us-east-1',
        's3-bucket-name': process.env.S3_BUCKET_NAME || 'media-processor-files',
        'dynamodb-table-name': process.env.DYNAMODB_TABLE_NAME || 'MediaFiles'
      };

      const result = await this.storeApplicationConfig(defaultConfig);

      console.log(`✅ Default parameters initialized`);

      return result;
    } catch (error) {
      console.error('❌ Error initializing default parameters:', error);
      throw new Error(`Failed to initialize default parameters: ${error.message}`);
    }
  }

  /**
   * Get specific application URLs
   * @returns {Promise<Object>} Application URLs
   */
  async getApplicationUrls() {
    try {
      const urls = {};
      
      const urlParams = ['app-url', 'api-url', 'frontend-url'];
      
      for (const paramName of urlParams) {
        try {
          const result = await this.getParameter(paramName);
          if (result.success) {
            urls[paramName.replace(/-/g, '_')] = result.value;
          }
        } catch (error) {
          console.warn(`Warning: Could not get ${paramName}:`, error.message);
        }
      }

      return {
        success: true,
        urls
      };
    } catch (error) {
      console.error('❌ Error getting application URLs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get file upload configuration
   * @returns {Promise<Object>} File upload configuration
   */
  async getFileUploadConfig() {
    try {
      const config = {};
      
      const fileParams = ['max-file-size', 'allowed-file-types'];
      
      for (const paramName of fileParams) {
        try {
          const result = await this.getParameter(paramName);
          if (result.success) {
            config[paramName.replace(/-/g, '_')] = result.value;
          }
        } catch (error) {
          console.warn(`Warning: Could not get ${paramName}:`, error.message);
        }
      }

      return {
        success: true,
        config
      };
    } catch (error) {
      console.error('❌ Error getting file upload config:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new ParameterStoreService();
