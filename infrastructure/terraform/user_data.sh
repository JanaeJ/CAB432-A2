#!/bin/bash

# User data script for Media Processor API EC2 instance
set -e

# Update system
yum update -y

# Install required packages
yum install -y docker git curl wget

# Start and enable Docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs

# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install
rm -rf aws awscliv2.zip

# Create application directory
mkdir -p /home/ec2-user/app
cd /home/ec2-user/app

# Clone application (replace with your actual repository)
# For now, we'll create a basic setup
echo "Setting up Media Processor API..."

# Create package.json
cat > package.json << 'EOF'
{
  "name": "media-processor-api",
  "version": "1.0.0",
  "description": "Cloud-based Media Processor API",
  "main": "app-cloud.js",
  "scripts": {
    "start": "node app-cloud.js",
    "dev": "nodemon app-cloud.js"
  },
  "dependencies": {
    "@aws-sdk/client-cognito-identity-provider": "^3.887.0",
    "@aws-sdk/client-dynamodb": "^3.887.0",
    "@aws-sdk/client-elasticache": "^3.887.0",
    "@aws-sdk/client-rds": "^3.887.0",
    "@aws-sdk/client-s3": "^3.887.0",
    "@aws-sdk/client-secrets-manager": "^3.887.0",
    "@aws-sdk/client-ssm": "^3.887.0",
    "@aws-sdk/s3-request-presigner": "^3.887.0",
    "aws-sdk": "^2.1691.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "helmet": "^7.1.0",
    "ioredis": "^5.3.2",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.33.0",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
EOF

# Create environment file
cat > .env << EOF
# Application Configuration
NODE_ENV=production
PORT=3000
DEBUG=false

# AWS Configuration
AWS_REGION=${aws_region}

# S3 Configuration
S3_BUCKET_NAME=${s3_bucket_name}

# DynamoDB Configuration
DYNAMODB_TABLE_NAME=${dynamodb_table_name}

# Cognito Configuration
COGNITO_USER_POOL_ID=${cognito_user_pool_id}
COGNITO_CLIENT_ID=${cognito_client_id}

# ElastiCache Configuration
REDIS_ENDPOINT=${redis_endpoint}
REDIS_PORT=6379

# RDS Configuration
RDS_ENDPOINT=${database_endpoint}
RDS_DATABASE_NAME=media_processor
RDS_PORT=5432

# Application URLs
FRONTEND_URL=https://${domain_name}
API_URL=https://${domain_name}/api

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
EOF

# Install dependencies
npm install

# Copy application files (you would typically clone from your repository)
# For now, create a basic server file
cat > app-cloud.js << 'EOF'
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    services: {
      aws_region: process.env.AWS_REGION,
      s3_bucket: process.env.S3_BUCKET_NAME,
      dynamodb_table: process.env.DYNAMODB_TABLE_NAME,
      redis_endpoint: process.env.REDIS_ENDPOINT
    }
  });
});

// Basic API endpoint
app.get('/api/status', (req, res) => {
  res.json({ 
    message: 'Media Processor API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.listen(PORT, () => {
  console.log(`🚀 Media Processor API running on port ${PORT}`);
  console.log(`📱 Web interface: http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
});
EOF

# Create public directory and basic HTML
mkdir -p public
cat > public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Media Processor API</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
        }
        .status {
            background: #e8f5e8;
            border: 1px solid #4caf50;
            border-radius: 5px;
            padding: 15px;
            margin: 20px 0;
        }
        .endpoint {
            background: #f8f9fa;
            border-left: 4px solid #007bff;
            padding: 10px;
            margin: 10px 0;
            font-family: monospace;
        }
        .feature {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 5px;
            padding: 15px;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Media Processor API</h1>
        
        <div class="status">
            <h3>✅ Cloud Infrastructure Ready</h3>
            <p>Your Media Processor API is running on AWS with the following services:</p>
            <ul>
                <li><strong>S3:</strong> File storage</li>
                <li><strong>DynamoDB:</strong> Metadata storage</li>
                <li><strong>Cognito:</strong> User authentication</li>
                <li><strong>ElastiCache:</strong> In-memory caching</li>
                <li><strong>Parameter Store:</strong> Configuration management</li>
                <li><strong>Secrets Manager:</strong> Secure credential storage</li>
            </ul>
        </div>

        <h3>📋 Available Endpoints</h3>
        <div class="endpoint">GET /health - Health check</div>
        <div class="endpoint">GET /api/status - API status</div>
        <div class="endpoint">POST /api/auth/register - User registration</div>
        <div class="endpoint">POST /api/auth/login - User login</div>
        <div class="endpoint">POST /api/media/upload - File upload</div>
        <div class="endpoint">GET /api/media/files - Get user files</div>
        <div class="endpoint">POST /api/media/process-video/:fileId - Process video</div>

        <div class="feature">
            <h4>🔧 Infrastructure as Code</h4>
            <p>This infrastructure was deployed using Terraform/CloudFormation templates.</p>
        </div>

        <div class="feature">
            <h4>🔐 Security Features</h4>
            <p>All sensitive data is encrypted and stored securely using AWS services.</p>
        </div>

        <div class="feature">
            <h4>📈 Scalability</h4>
            <p>The application is designed to scale horizontally using AWS managed services.</p>
        </div>
    </div>

    <script>
        // Check API status
        fetch('/api/status')
            .then(response => response.json())
            .then(data => {
                console.log('API Status:', data);
            })
            .catch(error => {
                console.error('Error checking API status:', error);
            });
    </script>
</body>
</html>
EOF

# Set proper permissions
chown -R ec2-user:ec2-user /home/ec2-user/app

# Create systemd service for the application
cat > /etc/systemd/system/media-processor-api.service << EOF
[Unit]
Description=Media Processor API
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/app
ExecStart=/usr/bin/node app-cloud.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
systemctl daemon-reload
systemctl enable media-processor-api
systemctl start media-processor-api

# Create a simple monitoring script
cat > /home/ec2-user/monitor.sh << 'EOF'
#!/bin/bash
echo "=== Media Processor API Status ==="
echo "Service Status:"
systemctl status media-processor-api --no-pager -l

echo -e "\nApplication Health:"
curl -s http://localhost:3000/health | python3 -m json.tool

echo -e "\nDisk Usage:"
df -h

echo -e "\nMemory Usage:"
free -h
EOF

chmod +x /home/ec2-user/monitor.sh

# Log completion
echo "Media Processor API setup completed successfully!" > /var/log/media-processor-setup.log
echo "Timestamp: $(date)" >> /var/log/media-processor-setup.log
echo "Environment: ${environment}" >> /var/log/media-processor-setup.log
echo "AWS Region: ${aws_region}" >> /var/log/media-processor-setup.log
echo "S3 Bucket: ${s3_bucket_name}" >> /var/log/media-processor-setup.log
echo "DynamoDB Table: ${dynamodb_table_name}" >> /var/log/media-processor-setup.log

# Send notification (optional)
echo "Media Processor API is now running on this instance!" | wall
