#!/bin/bash

# Terraform Deployment Script for Media Processor API
set -e

# Configuration
ENVIRONMENT="prod"
DOMAIN_NAME="your-subdomain.cab432.com"
QUT_USERNAME="n1234567@qut.edu.au"
DATABASE_PASSWORD="ChangeThisPassword123!"
AWS_REGION="us-east-1"

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

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    print_error "Terraform is not installed. Please install it first."
    exit 1
fi

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

print_status "Starting Terraform deployment..."

# Change to infrastructure directory
cd infrastructure/terraform

# Initialize Terraform
print_status "Initializing Terraform..."
terraform init

# Create terraform.tfvars file
print_status "Creating terraform.tfvars..."
cat > terraform.tfvars << EOF
aws_region        = "$AWS_REGION"
environment       = "$ENVIRONMENT"
domain_name       = "$DOMAIN_NAME"
qut_username      = "$QUT_USERNAME"
database_password = "$DATABASE_PASSWORD"
create_hosted_zone = false
EOF

# Plan deployment
print_status "Planning Terraform deployment..."
terraform plan -var-file="terraform.tfvars"

# Ask for confirmation
echo ""
read -p "Do you want to proceed with the deployment? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Deployment cancelled by user"
    exit 0
fi

# Apply deployment
print_status "Applying Terraform deployment..."
terraform apply -var-file="terraform.tfvars" -auto-approve

if [ $? -eq 0 ]; then
    print_success "Terraform deployment completed successfully!"
    
    # Get outputs
    print_status "Retrieving deployment outputs..."
    
    # S3 Bucket
    BUCKET_NAME=$(terraform output -raw s3_bucket_name 2>/dev/null || echo "N/A")
    
    # DynamoDB Table
    TABLE_NAME=$(terraform output -raw dynamodb_table_name 2>/dev/null || echo "N/A")
    
    # Cognito User Pool
    USER_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "N/A")
    
    # Redis Endpoint
    REDIS_ENDPOINT=$(terraform output -raw redis_endpoint 2>/dev/null || echo "N/A")
    
    # Database Endpoint
    DB_ENDPOINT=$(terraform output -raw database_endpoint 2>/dev/null || echo "N/A")
    
    # EC2 Instance
    EC2_INSTANCE_ID=$(terraform output -raw ec2_instance_id 2>/dev/null || echo "N/A")
    
    # VPC ID
    VPC_ID=$(terraform output -raw vpc_id 2>/dev/null || echo "N/A")
    
    # Application URL
    APP_URL=$(terraform output -raw application_url 2>/dev/null || echo "N/A")
    
    print_success "Deployment completed successfully!"
    echo ""
    echo "📋 Deployment Summary:"
    echo "====================="
    echo "Environment: $ENVIRONMENT"
    echo "Domain: $DOMAIN_NAME"
    echo "S3 Bucket: $BUCKET_NAME"
    echo "DynamoDB Table: $TABLE_NAME"
    echo "Cognito User Pool: $USER_POOL_ID"
    echo "Redis Endpoint: $REDIS_ENDPOINT"
    echo "Database Endpoint: $DB_ENDPOINT"
    echo "EC2 Instance: $EC2_INSTANCE_ID"
    echo "VPC ID: $VPC_ID"
    echo "Application URL: $APP_URL"
    echo ""
    
    # Create environment file for the application
    print_status "Creating environment configuration file..."
    cat > ../../.env.production << EOF
# Application Configuration
NODE_ENV=production
PORT=3000
DEBUG=false

# AWS Configuration
AWS_REGION=$AWS_REGION

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
    if [ "$EC2_INSTANCE_ID" != "N/A" ]; then
        EC2_PUBLIC_IP=$(aws ec2 describe-instances \
            --instance-ids $EC2_INSTANCE_ID \
            --region $AWS_REGION \
            --query 'Reservations[0].Instances[0].PublicIpAddress' \
            --output text)
        
        print_status "EC2 Instance Public IP: $EC2_PUBLIC_IP"
        print_warning "You may need to update your DNS records to point to this IP address"
    fi
    
    echo ""
    print_status "Next steps:"
    echo "1. Update your DNS records to point $DOMAIN_NAME to $EC2_PUBLIC_IP"
    echo "2. Configure Route53 hosted zone if needed"
    echo "3. Test the application at $APP_URL"
    echo "4. Update Parameter Store and Secrets Manager with actual values"
    echo ""
    
    # Show Terraform state information
    print_status "Terraform state information:"
    echo "State file: terraform.tfstate"
    echo "To destroy infrastructure: terraform destroy -var-file='terraform.tfvars'"
    echo ""
    
else
    print_error "Terraform deployment failed"
    exit 1
fi

# Return to original directory
cd ../..
