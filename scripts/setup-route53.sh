#!/bin/bash

# Route53 DNS Configuration Script for Media Processor API
set -e

# Configuration
DOMAIN_NAME="your-subdomain.cab432.com"
EC2_PUBLIC_IP=""
HOSTED_ZONE_ID=""
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

print_status "Setting up Route53 DNS for Media Processor API..."

# Get parameters from user if not provided
if [ -z "$DOMAIN_NAME" ]; then
    read -p "Enter your subdomain (e.g., your-subdomain.cab432.com): " DOMAIN_NAME
fi

if [ -z "$EC2_PUBLIC_IP" ]; then
    read -p "Enter your EC2 instance public IP address: " EC2_PUBLIC_IP
fi

# Validate IP address format
if ! [[ $EC2_PUBLIC_IP =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    print_error "Invalid IP address format: $EC2_PUBLIC_IP"
    exit 1
fi

# Check if hosted zone exists for cab432.com
print_status "Checking for existing hosted zone for cab432.com..."
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='cab432.com.'].Id" --output text | sed 's|/hostedzone/||')

if [ -z "$HOSTED_ZONE_ID" ]; then
    print_warning "No hosted zone found for cab432.com"
    print_status "You have two options:"
    echo "1. Create a new hosted zone (requires domain ownership verification)"
    echo "2. Use an existing hosted zone ID"
    echo ""
    
    read -p "Do you want to create a new hosted zone? (y/N): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Creating hosted zone for cab432.com..."
        HOSTED_ZONE_ID=$(aws route53 create-hosted-zone \
            --name cab432.com \
            --caller-reference "media-processor-$(date +%s)" \
            --query 'HostedZone.Id' \
            --output text | sed 's|/hostedzone/||')
        
        if [ $? -eq 0 ]; then
            print_success "Hosted zone created: $HOSTED_ZONE_ID"
            print_warning "You will need to update the NS records with your domain registrar"
            
            # Get nameservers
            NAMESERVERS=$(aws route53 get-hosted-zone --id $HOSTED_ZONE_ID --query 'DelegationSet.NameServers' --output text)
            echo ""
            print_status "Nameservers to configure with your domain registrar:"
            for ns in $NAMESERVERS; do
                echo "  $ns"
            done
            echo ""
        else
            print_error "Failed to create hosted zone"
            exit 1
        fi
    else
        read -p "Enter existing hosted zone ID: " HOSTED_ZONE_ID
    fi
else
    print_success "Found existing hosted zone: $HOSTED_ZONE_ID"
fi

# Check if DNS record already exists
print_status "Checking for existing DNS record..."
EXISTING_RECORD=$(aws route53 list-resource-record-sets \
    --hosted-zone-id $HOSTED_ZONE_ID \
    --query "ResourceRecordSets[?Name=='$DOMAIN_NAME.'].Name" \
    --output text)

if [ ! -z "$EXISTING_RECORD" ]; then
    print_warning "DNS record already exists for $DOMAIN_NAME"
    read -p "Do you want to update it? (y/N): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "DNS configuration cancelled"
        exit 0
    fi
fi

# Create or update DNS record
print_status "Creating/updating DNS record for $DOMAIN_NAME..."

# Create change batch
cat > /tmp/dns-change.json << EOF
{
    "Comment": "Media Processor API DNS record",
    "Changes": [
        {
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": "$DOMAIN_NAME",
                "Type": "A",
                "TTL": 300,
                "ResourceRecords": [
                    {
                        "Value": "$EC2_PUBLIC_IP"
                    }
                ]
            }
        }
    ]
}
EOF

# Apply the change
CHANGE_ID=$(aws route53 change-resource-record-sets \
    --hosted-zone-id $HOSTED_ZONE_ID \
    --change-batch file:///tmp/dns-change.json \
    --query 'ChangeInfo.Id' \
    --output text)

if [ $? -eq 0 ]; then
    print_success "DNS record created/updated successfully!"
    print_status "Change ID: $CHANGE_ID"
    
    # Wait for DNS propagation
    print_status "Waiting for DNS propagation..."
    aws route53 wait resource-record-sets-changed --id $CHANGE_ID
    
    print_success "DNS propagation completed!"
    
    # Test DNS resolution
    print_status "Testing DNS resolution..."
    sleep 10  # Give a bit more time for propagation
    
    RESOLVED_IP=$(dig +short $DOMAIN_NAME | head -1)
    
    if [ "$RESOLVED_IP" = "$EC2_PUBLIC_IP" ]; then
        print_success "DNS resolution successful: $DOMAIN_NAME -> $RESOLVED_IP"
    else
        print_warning "DNS resolution may not be fully propagated yet"
        print_status "Expected: $EC2_PUBLIC_IP"
        print_status "Resolved: $RESOLVED_IP"
        print_status "This may take a few minutes to propagate globally"
    fi
    
    # Create CNAME record for www subdomain (optional)
    read -p "Do you want to create a CNAME record for www.$DOMAIN_NAME? (y/N): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Creating CNAME record for www.$DOMAIN_NAME..."
        
        cat > /tmp/cname-change.json << EOF
{
    "Comment": "Media Processor API WWW CNAME record",
    "Changes": [
        {
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": "www.$DOMAIN_NAME",
                "Type": "CNAME",
                "TTL": 300,
                "ResourceRecords": [
                    {
                        "Value": "$DOMAIN_NAME"
                    }
                ]
            }
        }
    ]
}
EOF
        
        CNAME_CHANGE_ID=$(aws route53 change-resource-record-sets \
            --hosted-zone-id $HOSTED_ZONE_ID \
            --change-batch file:///tmp/cname-change.json \
            --query 'ChangeInfo.Id' \
            --output text)
        
        if [ $? -eq 0 ]; then
            print_success "WWW CNAME record created successfully!"
        else
            print_error "Failed to create WWW CNAME record"
        fi
    fi
    
    echo ""
    print_success "DNS configuration completed successfully!"
    echo ""
    echo "📋 DNS Configuration Summary:"
    echo "============================="
    echo "Domain: $DOMAIN_NAME"
    echo "Type: A Record"
    echo "Value: $EC2_PUBLIC_IP"
    echo "TTL: 300 seconds"
    echo "Hosted Zone ID: $HOSTED_ZONE_ID"
    echo "Change ID: $CHANGE_ID"
    echo ""
    
    print_status "Next steps:"
    echo "1. Wait for DNS propagation (up to 48 hours for full global propagation)"
    echo "2. Test your application at https://$DOMAIN_NAME"
    echo "3. Configure SSL certificate for HTTPS (for Assessment 3)"
    echo "4. Update your application configuration with the new domain"
    echo ""
    
    print_status "Testing commands:"
    echo "  nslookup $DOMAIN_NAME"
    echo "  dig $DOMAIN_NAME"
    echo "  curl -I http://$DOMAIN_NAME"
    
else
    print_error "Failed to create/update DNS record"
    exit 1
fi

# Clean up temporary files
rm -f /tmp/dns-change.json /tmp/cname-change.json

print_success "Route53 DNS setup completed!"
