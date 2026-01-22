# GitHub Actions Setup Script
# Run this after creating a Vercel token at https://vercel.com/account/tokens

echo "Setting up GitHub secrets for TTC Speed Cache deployment..."
echo ""

# Check for .env file
if [ ! -f .env ]; then
  echo "Error: .env file not found!"
  exit 1
fi

# Source .env and strip quotes
export $(cat .env | grep -v '^#' | sed 's/"//g' | sed "s/'//g" | xargs)

# Add Upstash QStash secrets
echo "Adding Upstash QStash secrets..."
echo "$QSTASH_TOKEN" | gh secret set QSTASH_TOKEN
echo "$QSTASH_CURRENT_SIGNING_KEY" | gh secret set QSTASH_CURRENT_SIGNING_KEY
echo "$QSTASH_NEXT_SIGNING_KEY" | gh secret set QSTASH_NEXT_SIGNING_KEY

# Add Vercel Blob token
echo "Adding Vercel Blob token..."
echo "$BLOB_READ_WRITE_TOKEN" | gh secret set BLOB_READ_WRITE_TOKEN

# Generate and add CRON_SECRET if not in .env
if [ -z "$CRON_SECRET" ]; then
  echo "Generating new CRON_SECRET..."
  CRON_SECRET=$(openssl rand -hex 32)
  echo "CRON_SECRET=$CRON_SECRET" >> .env
fi
echo "$CRON_SECRET" | gh secret set CRON_SECRET

echo ""
echo "✅ Environment secrets added"
echo ""
echo "Now add Vercel deployment credentials:"
echo "1. Get Vercel token from: https://vercel.com/account/tokens"
echo "2. Run: gh secret set VERCEL_TOKEN"
echo ""
echo "3. If .vercel/project.json doesn't exist, run: vercel link"
echo "4. Then extract and add:"
echo "   gh secret set VERCEL_ORG_ID"
echo "   gh secret set VERCEL_PROJECT_ID"
echo ""
echo "After setup, trigger workflows from GitHub Actions tab!"
