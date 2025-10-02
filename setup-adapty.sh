#!/bin/bash

# AIdrobe Firebase - Adapty Integration Deployment Script
# This script helps you set up the Adapty integration step by step

set -e  # Exit on error

echo "🚀 AIdrobe Firebase - Adapty Integration Setup"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "firebase.json" ]; then
    echo -e "${RED}❌ Error: firebase.json not found${NC}"
    echo "Please run this script from the root of your Firebase project"
    exit 1
fi

echo -e "${GREEN}✅ Firebase project detected${NC}"
echo ""

# Step 1: Check if Adapty secret is set
echo "📋 Step 1: Checking Adapty Secret Key..."
echo "========================================="

if firebase functions:secrets:access ADAPTY_SECRET_KEY &> /dev/null; then
    echo -e "${GREEN}✅ ADAPTY_SECRET_KEY is already set${NC}"
    read -p "Do you want to update it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Please enter your Adapty Secret Key:"
        firebase functions:secrets:set ADAPTY_SECRET_KEY
    fi
else
    echo -e "${YELLOW}⚠️  ADAPTY_SECRET_KEY is not set${NC}"
    echo ""
    echo "To get your Adapty Secret Key:"
    echo "1. Go to https://app.adapty.io/"
    echo "2. Navigate to App Settings → General → API Keys"
    echo "3. Copy your Secret Key (starts with 'secret_live_' or 'secret_test_')"
    echo ""
    read -p "Do you want to set it now? (Y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo "Please enter your Adapty Secret Key:"
        firebase functions:secrets:set ADAPTY_SECRET_KEY
        echo -e "${GREEN}✅ Secret key set successfully${NC}"
    else
        echo -e "${RED}❌ Deployment cancelled. Please set ADAPTY_SECRET_KEY before deploying.${NC}"
        exit 1
    fi
fi

echo ""

# Step 2: Check if FAL_KEY is set
echo "📋 Step 2: Checking FAL API Key..."
echo "===================================="

if firebase functions:secrets:access FAL_KEY &> /dev/null; then
    echo -e "${GREEN}✅ FAL_KEY is already set${NC}"
else
    echo -e "${YELLOW}⚠️  FAL_KEY is not set${NC}"
    read -p "Do you want to set it now? (Y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo "Please enter your FAL API Key:"
        firebase functions:secrets:set FAL_KEY
        echo -e "${GREEN}✅ FAL_KEY set successfully${NC}"
    fi
fi

echo ""

# Step 3: Install dependencies
echo "📦 Step 3: Installing dependencies..."
echo "======================================"

cd functions
if [ -f "package.json" ]; then
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ package.json not found in functions directory${NC}"
    exit 1
fi
cd ..

echo ""

# Step 4: Deploy functions
echo "🚀 Step 4: Deploying functions..."
echo "=================================="
echo ""
echo "This will deploy the following functions:"
echo "  - analyzeClothingImage (updated)"
echo "  - virtualTryOn (updated)"
echo "  - getOutfitSuggestion (updated)"
echo "  - getUserTier"
echo "  - syncUserWithAdapty (new)"
echo "  - adaptyWebhook (new)"
echo ""

read -p "Continue with deployment? (Y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    firebase deploy --only functions
    
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ Functions deployed successfully!${NC}"
        echo ""
        
        # Get project ID
        PROJECT_ID=$(firebase use | grep "active project" | sed 's/.*(\(.*\)).*/\1/')
        
        if [ -z "$PROJECT_ID" ]; then
            # Try alternative method
            PROJECT_ID=$(grep "\"project_id\"" .firebaserc | sed 's/.*: "\(.*\)".*/\1/')
        fi
        
        if [ ! -z "$PROJECT_ID" ]; then
            echo "📌 Your webhook URL is:"
            echo -e "${GREEN}https://us-central1-${PROJECT_ID}.cloudfunctions.net/adaptyWebhook${NC}"
            echo ""
            echo "🔧 Next steps:"
            echo "1. Copy the webhook URL above"
            echo "2. Go to https://app.adapty.io/"
            echo "3. Navigate to App Settings → Integrations"
            echo "4. Add a new webhook with the URL above"
            echo "5. Select these events:"
            echo "   ✓ subscription_initial_purchase"
            echo "   ✓ subscription_renewed"
            echo "   ✓ subscription_refunded"
            echo "   ✓ subscription_expired"
            echo "   ✓ subscription_cancelled"
            echo ""
        fi
        
        echo "📚 For more information, see:"
        echo "  - ADAPTY_SETUP_GUIDE.md - Complete setup guide"
        echo "  - API_REFERENCE.md - API documentation"
        echo ""
        echo -e "${GREEN}✨ Setup complete!${NC}"
    else
        echo ""
        echo -e "${RED}❌ Deployment failed${NC}"
        echo "Please check the error messages above"
        exit 1
    fi
else
    echo "Deployment cancelled"
fi

echo ""
echo "=============================================="
echo "🎉 Thank you for using AIdrobe Firebase!"
echo "=============================================="
