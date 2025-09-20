#!/bin/bash

# CloudFormation Deployment Script for Media Processor API
set -e

# Configuration
STACK_NAME="media-processor-api"
ENVIRONMENT="prod"
DOMAIN_NAME="your-subdomain.cab432.com"
QUT_USERNAME="n1234567@qut.edu.au"
DATABASE_PASSWORD="ChangeThisPassword123!"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials are not configured. Please run 'aws configure' first."
    exit 1
fi

print_status "Starting CloudFormation deployment..."

# Validate template
print_status "Validating CloudFormation template..."
if aws cloudformation validate-template --template-body file://infrastructure/cloudformation-template.yaml; then
    print_success "Template validation successful"
else
    print_error "Template validation failed"
    exit 1
fi

# Deploy stack
print_status "Deploying CloudFormation stack: $STACK_NAME"
aws cloudformation deploy \
    --template-file infrastructure/cloudformation-template.yaml \
    --stack-name $STACK_NAME \
    --parameter-overrides \
        Environment=$ENVIRONMENT \
        DomainName=$DOMAIN_NAME \
        QutUsername=$QUT_USERNAME \
        DatabasePassword=$DATABASE_PASSWORD \
    --capabilities CAPABILITY_NAMED_IAM \
    --region us-east-1

if [ $? -eq 0 ]; then
    print_success "CloudFormation stack deployed successfully!"
    
    # Get stack outputs
    print_status "Retrieving stack outputs..."
    aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region us-east-1 \
        --query 'Stacks[0].Outputs' \
        --output table
    
    # Get important resource information
    print_status "Getting resource information..."
    
    # S3 Bucket
    BUCKET_NAME=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`MediaFilesBucketName`].OutputValue' \
        --output text)
    
    # DynamoDB Table
    TABLE_NAME=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`MediaFilesTableName`].OutputValue' \
        --output text)
    
    # Cognito User Pool
    USER_POOL_ID=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
        --output text)
    
    # Redis Endpoint
    REDIS_ENDPOINT=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`RedisEndpoint`].OutputValue' \
        --output text)
    
    # Database Endpoint
    DB_ENDPOINT=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
        --output text)
    
    # EC2 Instance
    EC2_INSTANCE_ID=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`EC2InstanceId`].OutputValue' \
        --output text)
    
    # Application URL
    APP_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`ApplicationURL`].OutputValue' \
        --output text)
    
    print_success "Deployment completed successfully!"
    echo ""
    echo "📋 Deployment Summary:"
    echo "====================="
    echo "Stack Name: $STACK_NAME"
    echo "Environment: $ENVIRONMENT"
    echo "Domain: $DOMAIN_NAME"
    echo "S3 Bucket: $BUCKET_NAME"
    echo "DynamoDB Table: $TABLE_NAME"
    echo "Cognito User Pool: $USER_POOL_ID"
    echo "Redis Endpoint: $REDIS_ENDPOINT"
    echo "Database Endpoint: $DB_ENDPOINT"
    echo "EC2 Instance: $EC2_INSTANCE_ID"
    echo "Application URL: $APP_URL"
    echo ""
    
    # Create environment file for the application
    print_status "Creating environment configuration file..."
    cat > .env.production << EOF
# Application Configuration
NODE_ENV=production
PORT=3000
DEBUG=false

# AWS Configuration
AWS_REGION=us-east-1

# S3 Configuration
S3_BUCKET_NAME=$BUCKET_NAME

# DynamoDB Configuration
DYNAMODB_TABLE_NAME=$TABLE_NAME

# Cognito Configuration
COGNITO_USER_POOL_ID=$USER_POOL_ID

# ElastiCache Configuration
REDIS_ENDPOINT=$REDIS_ENDPOINT
REDIS_PORT=6379

# RDS Configuration
RDS_ENDPOINT=$DB_ENDPOINT
RDS_DATABASE_NAME=media_processor
RDS_PORT=5432

# Route53 Configuration
DOMAIN_NAME=$DOMAIN_NAME

# Application URLs
FRONTEND_URL=$APP_URL
API_URL=$APP_URL/api

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
EOF
    
    print_success "Environment configuration saved to .env.production"
    
    # Get EC2 instance public IP
    EC2_PUBLIC_IP=$(aws ec2 describe-instances \
        --instance-ids $EC2_INSTANCE_ID \
        --region us-east-1 \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text)
    
    print_status "EC2 Instance Public IP: $EC2_PUBLIC_IP"
    print_warning "You may need to update your DNS records to point to this IP address"
    
    echo ""
    print_status "Next steps:"
    echo "1. Update your DNS records to point $DOMAIN_NAME to $EC2_PUBLIC_IP"
    echo "2. Configure Route53 hosted zone if needed"
    echo "3. Test the application at $APP_URL"
    echo "4. Update Parameter Store and Secrets Manager with actual values"
    echo ""
    
else
    print_error "CloudFormation deployment failed"
    exit 1
fi
