// Secrets Manager Service for secure credential storage
const { 
  secretsClient, 
  secretsConfig, 
  SecretsCommands 
} = require('./aws-config');

class SecretsManagerService {
  constructor() {
    this.secretName = secretsConfig.secretName;
  }

  /**
   * Get secret value
   * @param {string} secretName - Secret name (optional, uses default if not provided)
   * @returns {Promise<Object>} Secret value
   */
  async getSecret(secretName = null) {
    try {
      const name = secretName || this.secretName;
      
      const command = new SecretsCommands.GetSecretValueCommand({
        SecretId: name
      });

      const result = await secretsClient.send(command);

      let secretValue;
      try {
        secretValue = JSON.parse(result.SecretString);
      } catch (parseError) {
        // If it's not JSON, treat as plain text
        secretValue = result.SecretString;
      }

      console.log(`✅ Secret retrieved: ${name}`);

      return {
        success: true,
        secretName: name,
        value: secretValue,
        versionId: result.VersionId,
        versionStages: result.VersionStages,
        createdDate: result.CreatedDate,
        lastModifiedDate: result.LastModifiedDate
      };
    } catch (error) {
      console.error('❌ Secrets Manager get error:', error);
      
      if (error.name === 'ResourceNotFoundException') {
        return {
          success: false,
          error: 'Secret not found'
        };
      }
      
      throw new Error(`Failed to get secret: ${error.message}`);
    }
  }

  /**
   * Create or update secret
   * @param {string} secretName - Secret name
   * @param {Object|string} secretValue - Secret value (object will be JSON stringified)
   * @param {string} description - Secret description
   * @returns {Promise<Object>} Creation/update result
   */
  async putSecret(secretName, secretValue, description = '') {
    try {
      const secretString = typeof secretValue === 'object' 
        ? JSON.stringify(secretValue, null, 2) 
        : secretValue.toString();

      // Try to create new secret first
      try {
        const createCommand = new SecretsCommands.CreateSecretCommand({
          Name: secretName,
          Description: description,
          SecretString: secretString
        });

        const result = await secretsClient.send(createCommand);

        console.log(`✅ Secret created: ${secretName}`);

        return {
          success: true,
          action: 'created',
          secretName,
          versionId: result.VersionId,
          arn: result.ARN
        };
      } catch (createError) {
        if (createError.name === 'ResourceExistsException') {
          // Secret exists, update it
          const updateCommand = new SecretsCommands.UpdateSecretCommand({
            SecretId: secretName,
            SecretString: secretString,
            Description: description
          });

          const result = await secretsClient.send(updateCommand);

          console.log(`✅ Secret updated: ${secretName}`);

          return {
            success: true,
            action: 'updated',
            secretName,
            versionId: result.VersionId,
            arn: result.ARN
          };
        } else {
          throw createError;
        }
      }
    } catch (error) {
      console.error('❌ Secrets Manager put error:', error);
      throw new Error(`Failed to put secret: ${error.message}`);
    }
  }

  /**
   * Get database credentials
   * @returns {Promise<Object>} Database credentials
   */
  async getDatabaseCredentials() {
    try {
      const result = await this.getSecret(this.secretName);
      
      if (!result.success) {
        return {
          success: false,
          error: 'Database credentials not found'
        };
      }

      const credentials = result.value;
      
      // Validate required fields
      const requiredFields = ['host', 'port', 'database', 'username', 'password'];
      const missingFields = requiredFields.filter(field => !credentials[field]);
      
      if (missingFields.length > 0) {
        return {
          success: false,
          error: `Missing required database credential fields: ${missingFields.join(', ')}`
        };
      }

      console.log(`✅ Database credentials retrieved`);

      return {
        success: true,
        credentials: {
          host: credentials.host,
          port: parseInt(credentials.port),
          database: credentials.database,
          username: credentials.username,
          password: credentials.password,
          ssl: credentials.ssl === 'true' || false
        }
      };
    } catch (error) {
      console.error('❌ Error getting database credentials:', error);
      throw new Error(`Failed to get database credentials: ${error.message}`);
    }
  }

  /**
   * Store database credentials
   * @param {Object} credentials - Database credentials
   * @returns {Promise<Object>} Storage result
   */
  async storeDatabaseCredentials(credentials) {
    try {
      const { host, port, database, username, password, ssl = false } = credentials;
      
      const secretValue = {
        host,
        port: port.toString(),
        database,
        username,
        password,
        ssl: ssl.toString(),
        createdAt: new Date().toISOString(),
        description: 'Database connection credentials for Media Processor API'
      };

      const result = await this.putSecret(
        this.secretName,
        secretValue,
        'Database connection credentials for Media Processor API'
      );

      console.log(`✅ Database credentials stored`);

      return result;
    } catch (error) {
      console.error('❌ Error storing database credentials:', error);
      throw new Error(`Failed to store database credentials: ${error.message}`);
    }
  }

  /**
   * Get API keys and external service credentials
   * @returns {Promise<Object>} API credentials
   */
  async getAPICredentials() {
    try {
      const apiSecretName = `${this.secretName.replace('/database-credentials', '')}/api-credentials`;
      const result = await this.getSecret(apiSecretName);
      
      if (!result.success) {
        return {
          success: false,
          error: 'API credentials not found'
        };
      }

      console.log(`✅ API credentials retrieved`);

      return {
        success: true,
        credentials: result.value
      };
    } catch (error) {
      console.error('❌ Error getting API credentials:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Store API keys and external service credentials
   * @param {Object} credentials - API credentials
   * @returns {Promise<Object>} Storage result
   */
  async storeAPICredentials(credentials) {
    try {
      const apiSecretName = `${this.secretName.replace('/database-credentials', '')}/api-credentials`;
      
      const secretValue = {
        ...credentials,
        createdAt: new Date().toISOString(),
        description: 'API keys and external service credentials for Media Processor API'
      };

      const result = await this.putSecret(
        apiSecretName,
        secretValue,
        'API keys and external service credentials for Media Processor API'
      );

      console.log(`✅ API credentials stored`);

      return result;
    } catch (error) {
      console.error('❌ Error storing API credentials:', error);
      throw new Error(`Failed to store API credentials: ${error.message}`);
    }
  }

  /**
   * Get JWT secret key
   * @returns {Promise<Object>} JWT secret
   */
  async getJWTSecret() {
    try {
      const jwtSecretName = `${this.secretName.replace('/database-credentials', '')}/jwt-secret`;
      const result = await this.getSecret(jwtSecretName);
      
      if (!result.success) {
        return {
          success: false,
          error: 'JWT secret not found'
        };
      }

      console.log(`✅ JWT secret retrieved`);

      return {
        success: true,
        secret: result.value
      };
    } catch (error) {
      console.error('❌ Error getting JWT secret:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Store JWT secret key
   * @param {string} jwtSecret - JWT secret key
   * @returns {Promise<Object>} Storage result
   */
  async storeJWTSecret(jwtSecret) {
    try {
      const jwtSecretName = `${this.secretName.replace('/database-credentials', '')}/jwt-secret`;
      
      const secretValue = {
        jwt_secret: jwtSecret,
        createdAt: new Date().toISOString(),
        description: 'JWT secret key for Media Processor API authentication'
      };

      const result = await this.putSecret(
        jwtSecretName,
        secretValue,
        'JWT secret key for Media Processor API authentication'
      );

      console.log(`✅ JWT secret stored`);

      return result;
    } catch (error) {
      console.error('❌ Error storing JWT secret:', error);
      throw new Error(`Failed to store JWT secret: ${error.message}`);
    }
  }

  /**
   * Initialize default secrets
   * @returns {Promise<Object>} Initialization result
   */
  async initializeDefaultSecrets() {
    try {
      const results = [];
      const errors = [];

      // Initialize database credentials (example - replace with actual values)
      try {
        const dbCredentials = {
          host: process.env.RDS_ENDPOINT || 'your-rds-endpoint.region.rds.amazonaws.com',
          port: process.env.RDS_PORT || '5432',
          database: process.env.RDS_DATABASE_NAME || 'media_processor',
          username: process.env.RDS_USERNAME || 'admin',
          password: process.env.RDS_PASSWORD || 'your-secure-password',
          ssl: 'true'
        };

        const dbResult = await this.storeDatabaseCredentials(dbCredentials);
        results.push(`Database credentials: ${dbResult.action}`);
      } catch (error) {
        errors.push(`Database credentials: ${error.message}`);
      }

      // Initialize JWT secret
      try {
        const jwtSecret = process.env.JWT_SECRET || 'your-super-secure-jwt-secret-key';
        const jwtResult = await this.storeJWTSecret(jwtSecret);
        results.push(`JWT secret: ${jwtResult.action}`);
      } catch (error) {
        errors.push(`JWT secret: ${error.message}`);
      }

      // Initialize API credentials (example)
      try {
        const apiCredentials = {
          external_api_key: process.env.EXTERNAL_API_KEY || 'your-external-api-key',
          third_party_token: process.env.THIRD_PARTY_TOKEN || 'your-third-party-token'
        };

        const apiResult = await this.storeAPICredentials(apiCredentials);
        results.push(`API credentials: ${apiResult.action}`);
      } catch (error) {
        errors.push(`API credentials: ${error.message}`);
      }

      console.log(`✅ Default secrets initialized: ${results.length} secrets`);

      return {
        success: true,
        initialized: results,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      console.error('❌ Error initializing default secrets:', error);
      throw new Error(`Failed to initialize default secrets: ${error.message}`);
    }
  }
}

module.exports = new SecretsManagerService();
