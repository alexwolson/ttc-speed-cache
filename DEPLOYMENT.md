# Deployment Guide

## Prerequisites
- Vercel account (free tier works)
- Vercel CLI installed: `npm i -g vercel`
- Upstash account (for QStash per-minute scheduler)

## Steps

### 0. Upstash QStash Setup
Create and configure QStash to trigger the collection endpoint every minute.

1. Sign up / log in at https://upstash.com
2. In the dashboard, create a new **QStash** project.
3. Open the QStash project and note:
	 - **QSTASH_TOKEN**: Found under Settings → API Keys
	 - **Signing Keys**: Found under Settings → Signing Keys
		 - `QSTASH_CURRENT_SIGNING_KEY`
		 - `QSTASH_NEXT_SIGNING_KEY` (optional; used when rotating keys)
4. Keep these values handy; we’ll add them to Vercel in the next step.

### 1. Deploy to Vercel
```bash
# From project root
vercel

# Follow prompts:
# - Set up and deploy? Y
# - Which scope? (select your account)
# - Link to existing project? N
# - Project name? ttc-speed-cache (or your choice)
# - Directory? ./
# - Override settings? N
```

### 2. Create Blob Store
1. Go to https://vercel.com/dashboard
2. Select your project (`ttc-speed-cache`)
3. Go to **Storage** tab
4. Click **Create Database**
5. Select **Blob**
6. Click **Create**
7. Copy the `BLOB_READ_WRITE_TOKEN` from the **Environment Variables** section

### 3. Set Environment Variables
```bash
# Set BLOB_READ_WRITE_TOKEN (already set automatically when you created the Blob store)
# Verify it exists:
vercel env ls

# Optional: Add CRON_SECRET for authentication
vercel env add CRON_SECRET
# Paste a random secret (e.g., generate with: openssl rand -hex 32)
# Select: Production, Preview, Development

# Upstash QStash (per-minute scheduler)
vercel env add QSTASH_TOKEN
vercel env add QSTASH_CURRENT_SIGNING_KEY
vercel env add QSTASH_NEXT_SIGNING_KEY
```

If you prefer local dev, also export them for the schedule script:

```bash
export QSTASH_TOKEN="<your-upstash-token>"
export QSTASH_CURRENT_SIGNING_KEY="<your-current-signing-key>"
export QSTASH_NEXT_SIGNING_KEY="<your-next-signing-key>"
export CRON_SECRET="<same-as-vercel-env>"
```

### 4. Verify Deployment
```bash
# Check deployment status
vercel ls

# View logs
vercel logs
```

### 5. Create Upstash QStash Schedule (Every Minute)
After deploying, create a QStash schedule that POSTs to your endpoint every minute.

```bash
# Set your deployed endpoint URL
export COLLECT_ENDPOINT_URL="https://<your-app>.vercel.app/api/collect-sample"

# Ensure env vars are available locally (QStash token & optional CRON secret)
export QSTASH_TOKEN="<your-upstash-token>"
export CRON_SECRET="<same-as-vercel-env>"

# Create the schedule
npm run schedule:qstash
```

You can also create the schedule from the Upstash console and verify it under Schedules.

Alternative (Upstash Console):
1. In QStash project, go to **Schedules** → **Create**
2. Set `destination` to `https://<your-app>.vercel.app/api/collect-sample`
3. Set `cron` to `* * * * *` (every minute)
4. Method: `POST`
5. Headers: Add `Authorization: Bearer <CRON_SECRET>` (optional if you use signature auth)
6. Save and verify deliveries in the **Schedules** and **Messages** views

### 6. Monitor Collection
1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Deployments** tab > Latest deployment > **Functions** tab
4. Click on `/api/collect-sample` to view execution logs
5. Go to **Storage** tab > Your Blob store > **Browse** to see collected files
6. In Upstash console, ensure the schedule is active and successful deliveries appear

### 6. Download Data
```bash
# List all files
vercel blob ls

# Download a specific file
vercel blob download speed-data-2026-01-21-1430.msgpack

# Download all files for a date
vercel blob ls | grep "speed-data-2026-01-21" | xargs -I {} vercel blob download {}
```

## Verification Checklist

- [ ] Deployment successful (`vercel ls` shows your project)
- [ ] Blob store created and token set
- [ ] QStash schedule created (Upstash console > Schedules)
- [ ] First execution succeeded (Functions > `/api/collect-sample`)
- [ ] Files appear in Blob storage (Storage > Browse)
- [ ] `speed-data-*.msgpack` files accumulating every minute
- [ ] `routes-*.json` file exists
 - [ ] Upstash Messages show 200 responses for deliveries

## Troubleshooting

**QStash schedule not firing:**
- Confirm `QSTASH_TOKEN` is valid (Upstash console)
- Verify schedule destination URL matches your deployed endpoint
- Ensure your endpoint allows either Upstash signature (`Upstash-Signature`) or `Authorization: Bearer <CRON_SECRET>`
 - Check Upstash **Messages** for errors (e.g., DNS, 401, 5xx)
 - Ensure the endpoint is publicly accessible (Production deployment)

**"Unauthorized" error in logs:**
- If using QStash signature, set `QSTASH_CURRENT_SIGNING_KEY` (and optional `QSTASH_NEXT_SIGNING_KEY`)
- If using header auth, ensure `CRON_SECRET` matches what your schedule sends
 - For signature verification: the endpoint verifies against empty body; schedules sending bodies must update verification accordingly

**"Failed to upload to Blob" error:**
- Verify `BLOB_READ_WRITE_TOKEN` is set
- Check token has write permissions (not read-only)

**No files in Blob storage:**
- Wait 1-2 minutes for first execution
- Check function logs for errors
- Verify TTC API is reachable (might be down)
- Ensure `BLOB_READ_WRITE_TOKEN` has write permissions
 - Confirm Upstash delivery shows 200 OK from your endpoint

## Cost Monitoring

View costs in Vercel dashboard:
- Project > Settings > Usage
- Expected: ~$0.01/month for storage
- Cron executions: Free (within limits)

## Updating Configuration

**Change schedule frequency:**
1. Update the cron string in `scripts/qstash-schedule.ts` (e.g., `*/5 * * * *` for every 5 minutes)
2. Re-run `npm run schedule:qstash` or update in Upstash console

**Update collection logic:**
1. Edit `api/collect-sample.ts`
2. Deploy: `vercel --prod`
3. Monitor logs for errors

## Testing the Endpoint Manually

Before enabling QStash, validate the endpoint in production with `CRON_SECRET`:

```bash
curl -i \
	-H "Authorization: Bearer <CRON_SECRET>" \
	https://<your-app>.vercel.app/api/collect-sample
```

Expected response: JSON success payload with `speedsBlobUrl` and optional `routesBlobUrl`.

## GitHub Actions Deployment

### Prerequisites
1. **Vercel Token**: Get from https://vercel.com/account/tokens (create with appropriate scope)
2. **Vercel Org & Project IDs**: Run `vercel link` locally, then extract `orgId` and `projectId` from `.vercel/project.json`
3. **Environment Variables**: All secrets from your `.env` file

### Setup GitHub Secrets

Run these commands to add all required secrets:

```bash
# Add Upstash QStash secrets
gh secret set QSTASH_TOKEN --body "YOUR_QSTASH_TOKEN"
gh secret set QSTASH_CURRENT_SIGNING_KEY --body "YOUR_CURRENT_SIGNING_KEY"
gh secret set QSTASH_NEXT_SIGNING_KEY --body "YOUR_NEXT_SIGNING_KEY"

# Add Vercel Blob token
gh secret set BLOB_READ_WRITE_TOKEN --body "YOUR_BLOB_TOKEN"

# Optional: Add CRON_SECRET for additional authentication
gh secret set CRON_SECRET --body "$(openssl rand -hex 32)"

# Add Vercel deployment credentials
gh secret set VERCEL_TOKEN  # Paste token from vercel.com/account/tokens
gh secret set VERCEL_ORG_ID  # From .vercel/project.json
gh secret set VERCEL_PROJECT_ID  # From .vercel/project.json
```

### Manual Deployment Workflows

Two GitHub Actions workflows are available for manual deployment:

#### 1. Deploy to Vercel (`deploy-vercel.yml`)
Deploys code to Vercel production and syncs all environment variables to production, preview, and development environments.

**To trigger:**
1. Go to GitHub repository → **Actions** tab
2. Select **Deploy to Vercel** workflow
3. Click **Run workflow** → **Run workflow**

**What it does:**
- Links to Vercel project using org/project IDs
- Deploys code to production
- Syncs all environment variables (QSTASH_TOKEN, signing keys, BLOB_READ_WRITE_TOKEN, CRON_SECRET) to all Vercel environments

#### 2. Deploy QStash Schedule (`deploy-qstash.yml`)
Recreates the per-minute QStash schedule (deletes existing schedules first to avoid duplicates).

**To trigger:**
1. Go to GitHub repository → **Actions** tab
2. Select **Deploy QStash Schedule** workflow
3. Click **Run workflow** → **Run workflow**

**What it does:**
- Checks for existing schedules pointing to `/api/collect-sample`
- Deletes any found schedules to prevent duplicates
- Creates fresh per-minute schedule with current configuration

### Verification After Workflow Runs

After running **Deploy to Vercel**:
- [ ] Check Vercel deployment succeeded (Vercel dashboard → Deployments)
- [ ] Verify environment variables synced (Vercel → Settings → Environment Variables)
- [ ] Test endpoint: `curl -H "Authorization: Bearer <CRON_SECRET>" https://ttc-speed-cache.vercel.app/api/collect-sample`

After running **Deploy QStash Schedule**:
- [ ] Verify schedule active in Upstash console (QStash → Schedules)
- [ ] Check for successful deliveries (QStash → Messages, look for 200 responses)
- [ ] Confirm Blob Storage files accumulating (run `npm run verify` locally)
