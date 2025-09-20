// AWS Configuration and Service Initialization
require('dotenv').config();

const { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand
} = require('@aws-sdk/client-s3');

const { 
  DynamoDBClient, 
  PutItemCommand, 
  GetItemCommand, 
  QueryCommand, 
  DeleteItemCommand,
  UpdateItemCommand,
  ScanCommand
} = require('@aws-sdk/client-dynamodb');

const { 
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminConfirmSignUpCommand,
  AdminInitiateAuthCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand,
  AdminRespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand,
  AdminSetUserMFAPreferenceCommand
} = require('@aws-sdk/client-cognito-identity-provider');

const { 
  SSMClient, 
  GetParameterCommand, 
  PutParameterCommand 
} = require('@aws-sdk/client-ssm');

const { 
  SecretsManagerClient, 
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand
} = require('@aws-sdk/client-secrets-manager');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const Redis = require('ioredis');

// AWS Configuration - Modified to support SSO credentials
const awsConfig = {
  region: process.env.AWS_REGION || 'ap-southeast-2'
  // Remove explicit credentials to use default credential provider chain
  // This will automatically use SSO credentials, AWS CLI credentials, or environment variables
};

// Only add explicit credentials if they are provided in environment
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  awsConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  };
}

// Initialize AWS Services
const s3Client = new S3Client(awsConfig);
const dynamoClient = new DynamoDBClient(awsConfig);
const cognitoClient = new CognitoIdentityProviderClient(awsConfig);
const ssmClient = new SSMClient(awsConfig);
const secretsClient = new SecretsManagerClient(awsConfig);

// Redis Configuration for ElastiCache
let redisClient = null;
if (process.env.REDIS_ENDPOINT) {
  redisClient = new Redis({
    host: process.env.REDIS_ENDPOINT,
    port: process.env.REDIS_PORT || 6379,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  });

  redisClient.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Connected to Redis/ElastiCache');
  });
}

// S3 Configuration
const s3Config = {
  bucketName: process.env.S3_BUCKET_NAME || 'media-processor-files',
  region: process.env.S3_BUCKET_REGION || 'ap-southeast-2'
};

// DynamoDB Configuration
const dynamoConfig = {
  tableName: process.env.DYNAMODB_TABLE_NAME || 'MediaFiles',
  region: process.env.DYNAMODB_REGION || 'ap-southeast-2'
};

// Cognito Configuration
const cognitoConfig = {
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
  clientSecret: process.env.COGNITO_CLIENT_SECRET
};

// Parameter Store Configuration
const parameterStoreConfig = {
  prefix: process.env.PARAMETER_STORE_PREFIX || '/media-processor/'
};

// Secrets Manager Configuration
const secretsConfig = {
  secretName: process.env.SECRETS_MANAGER_SECRET_NAME || 'media-processor/database-credentials'
};

module.exports = {
  // AWS Clients
  s3Client,
  dynamoClient,
  cognitoClient,
  ssmClient,
  secretsClient,
  redisClient,
  
  // Configurations
  awsConfig,
  s3Config,
  dynamoConfig,
  cognitoConfig,
  parameterStoreConfig,
  secretsConfig,
  
  // AWS SDK Commands
  S3Commands: {
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand
  },
  DynamoCommands: {
    PutItemCommand,
    GetItemCommand,
    QueryCommand,
    DeleteItemCommand,
    UpdateItemCommand,
    ScanCommand
  },
  CognitoCommands: {
    AdminCreateUserCommand,
    AdminConfirmSignUpCommand,
    AdminInitiateAuthCommand,
    AdminGetUserCommand,
    AdminUpdateUserAttributesCommand,
    AdminDeleteUserCommand,
    AdminRespondToAuthChallengeCommand,
    AssociateSoftwareTokenCommand,
    VerifySoftwareTokenCommand,
    SetUserMFAPreferenceCommand,
    AdminSetUserMFAPreferenceCommand
  },
  SSMCommands: {
    GetParameterCommand,
    PutParameterCommand
  },
  SecretsCommands: {
    GetSecretValueCommand,
    CreateSecretCommand,
    UpdateSecretCommand
  },
  
  // Utilities
  getSignedUrl
};