# Media Processor API Infrastructure - Terraform Configuration
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Purpose      = "assessment-2"
      QutUsername  = var.qut_username
      Environment  = var.environment
      ManagedBy    = "terraform"
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-2"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "group77-fay-janae.cab432.com"
}

variable "qut_username" {
  description = "QUT username for resource tagging"
  type        = string
  default     = "group77-fay-janae"
}

variable "allowed_cidr" {
  description = "CIDR block allowed to access the application"
  type        = string
  default     = "0.0.0.0/0"
}

variable "database_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
  default     = "ChangeThisPassword123!"
  validation {
    condition     = length(var.database_password) >= 8
    error_message = "Database password must be at least 8 characters long."
  }
}

# Local values
locals {
  name_prefix = "media-processor-${var.environment}"
  common_tags = {
    Purpose     = "assessment-2"
    QutUsername = var.qut_username
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# VPC and Networking
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-igw"
  })
}

# Public Subnets
resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index + 1}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-subnet-${count.index + 1}"
    Type = "public"
  })
}

# Private Subnets
resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 11}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-private-subnet-${count.index + 1}"
    Type = "private"
  })
}

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-rt"
  })
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-private-rt"
  })
}

# Route Table Associations
resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# Security Groups
resource "aws_security_group" "web" {
  name_prefix = "${local.name_prefix}-web-"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  ingress {
    description = "Application Port"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-web-sg"
  })
}

resource "aws_security_group" "database" {
  name_prefix = "${local.name_prefix}-database-"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.web.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-database-sg"
  })
}

resource "aws_security_group" "redis" {
  name_prefix = "${local.name_prefix}-redis-"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.web.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-sg"
  })
}

# S3 Bucket for media files
resource "aws_s3_bucket" "media_files" {
  bucket = "${local.name_prefix}-media-files"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-media-files"
  })
}

resource "aws_s3_bucket_versioning" "media_files" {
  bucket = aws_s3_bucket.media_files.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "media_files" {
  bucket = aws_s3_bucket.media_files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "media_files" {
  bucket = aws_s3_bucket.media_files.id

  rule {
    id     = "delete_incomplete_multipart_uploads"
    status = "Enabled"

    filter {
      prefix = ""
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  rule {
    id     = "transition_to_ia"
    status = "Enabled"

    filter {
      prefix = ""
    }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
  }
}

# DynamoDB Tables
resource "aws_dynamodb_table" "media_files" {
  name           = "${local.name_prefix}-media-files"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "fileId"
  range_key      = "userId"

  attribute {
    name = "fileId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "UserIdIndex"
    hash_key        = "userId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-media-files"
  })
}

resource "aws_dynamodb_table" "processing_jobs" {
  name           = "${local.name_prefix}-processing-jobs"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "jobId"
  range_key      = "userId"

  attribute {
    name = "jobId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "UserIdIndex"
    hash_key        = "userId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-processing-jobs"
  })
}

# Cognito User Pool
resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-user-pool"

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  auto_verified_attributes = ["email"]
  username_attributes      = ["email"]

  schema {
    attribute_data_type = "String"
    name                = "email"
    required            = true
    mutable             = true
  }

  schema {
    attribute_data_type = "String"
    name                = "username"
    required            = true
    mutable             = true
  }

  schema {
    attribute_data_type = "String"
    name                = "role"
    mutable             = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-user-pool"
  })
}

resource "aws_cognito_user_pool_client" "main" {
  name         = "${local.name_prefix}-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = true

  explicit_auth_flows = [
    "ADMIN_NO_SRP_AUTH",
    "USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  supported_identity_providers = ["COGNITO"]

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
}

# ElastiCache Redis Cluster
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-redis-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-subnet-group"
  })
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${local.name_prefix}-redis"
  description                = "Redis cluster for Media Processor API caching"
  node_type                  = "cache.t3.micro"
  port                       = 6379
  num_cache_clusters         = 1
  engine                     = "redis"
  engine_version             = "7.0"
  parameter_group_name       = "default.redis7"
  security_group_ids         = [aws_security_group.redis.id]
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis"
  })
}

# RDS PostgreSQL Database
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-subnet-group"
  })
}

resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-db"

  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.t3.micro"

  db_name  = "media_processor"
  username = "admin"
  password = var.database_password

  allocated_storage     = 20
  storage_type          = "gp2"
  storage_encrypted     = true
  backup_retention_period = 7
  multi_az             = false
  publicly_accessible  = false

  vpc_security_group_ids = [aws_security_group.database.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  skip_final_snapshot = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db"
  })
}

# IAM Role for EC2 instances
resource "aws_iam_role" "ec2_instance" {
  name = "${local.name_prefix}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-ec2-role"
  })
}

resource "aws_iam_role_policy_attachment" "ec2_s3" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
  role       = aws_iam_role.ec2_instance.name
}

resource "aws_iam_role_policy_attachment" "ec2_dynamodb" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
  role       = aws_iam_role.ec2_instance.name
}

resource "aws_iam_role_policy_attachment" "ec2_cognito" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonCognitoPowerUser"
  role       = aws_iam_role.ec2_instance.name
}

resource "aws_iam_role_policy_attachment" "ec2_elasticache" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonElastiCacheFullAccess"
  role       = aws_iam_role.ec2_instance.name
}

resource "aws_iam_role_policy_attachment" "ec2_rds" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonRDSFullAccess"
  role       = aws_iam_role.ec2_instance.name
}

resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMFullAccess"
  role       = aws_iam_role.ec2_instance.name
}

resource "aws_iam_role_policy_attachment" "ec2_secrets" {
  policy_arn = "arn:aws:iam::aws:policy/SecretsManagerReadWrite"
  role       = aws_iam_role.ec2_instance.name
}

resource "aws_iam_instance_profile" "ec2_instance" {
  name = "${local.name_prefix}-ec2-profile"
  role = aws_iam_role.ec2_instance.name

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-ec2-profile"
  })
}

# Parameter Store Parameters
resource "aws_ssm_parameter" "app_url" {
  name  = "/media-processor/${var.environment}/app-url"
  type  = "String"
  value = "https://${var.domain_name}"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-app-url-param"
  })
}

resource "aws_ssm_parameter" "api_url" {
  name  = "/media-processor/${var.environment}/api-url"
  type  = "String"
  value = "https://${var.domain_name}/api"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api-url-param"
  })
}

resource "aws_ssm_parameter" "frontend_url" {
  name  = "/media-processor/${var.environment}/frontend-url"
  type  = "String"
  value = "https://${var.domain_name}"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-frontend-url-param"
  })
}

resource "aws_ssm_parameter" "max_file_size" {
  name  = "/media-processor/${var.environment}/max-file-size"
  type  = "String"
  value = "500MB"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-max-file-size-param"
  })
}

resource "aws_ssm_parameter" "allowed_file_types" {
  name  = "/media-processor/${var.environment}/allowed-file-types"
  type  = "String"
  value = "mp4,avi,mov,mkv,mp3,wav,flac,aac,jpg,jpeg,png,gif"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-allowed-file-types-param"
  })
}

# Secrets Manager Secrets
resource "aws_secretsmanager_secret" "database_credentials" {
  name        = "/media-processor/${var.environment}/database-credentials"
  description = "Database connection credentials"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-database-credentials-secret"
  })
}

resource "aws_secretsmanager_secret_version" "database_credentials" {
  secret_id = aws_secretsmanager_secret.database_credentials.id
  secret_string = jsonencode({
    host     = aws_db_instance.main.endpoint
    port     = aws_db_instance.main.port
    database = aws_db_instance.main.db_name
    username = aws_db_instance.main.username
    password = var.database_password
    ssl      = "true"
  })
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "/media-processor/${var.environment}/jwt-secret"
  description = "JWT secret key for authentication"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-jwt-secret-secret"
  })
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id = aws_secretsmanager_secret.jwt_secret.id
  secret_string = jsonencode({
    jwt_secret = "your-super-secure-jwt-secret-key-${var.environment}"
    createdAt  = timestamp()
  })
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "s3_access" {
  name              = "/aws/s3/${local.name_prefix}"
  retention_in_days = 30

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-s3-access-logs"
  })
}

resource "aws_cloudwatch_log_group" "application" {
  name              = "/aws/ec2/${local.name_prefix}"
  retention_in_days = 14

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-application-logs"
  })
}

# EC2 Instance
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = "t3.micro"
  vpc_security_group_ids = [aws_security_group.web.id]
  subnet_id              = aws_subnet.public[0].id
  iam_instance_profile   = aws_iam_instance_profile.ec2_instance.name

  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    aws_region                = var.aws_region
    s3_bucket_name           = aws_s3_bucket.media_files.bucket
    dynamodb_table_name      = aws_dynamodb_table.media_files.name
    cognito_user_pool_id     = aws_cognito_user_pool.main.id
    cognito_client_id        = aws_cognito_user_pool_client.main.id
    redis_endpoint           = aws_elasticache_replication_group.main.primary_endpoint_address
    database_endpoint        = aws_db_instance.main.endpoint
    environment              = var.environment
    domain_name              = var.domain_name
    PORT                     = "3000"
  }))

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-ec2"
  })
}

# Route53 (using existing cab432.com hosted zone)

resource "aws_route53_record" "app" {
  zone_id = "Z02680423BHWEVRU2JZDQ"
  name    = var.domain_name
  type    = "A" 
  ttl     = 300
  records = [aws_instance.app.public_ip]
}
