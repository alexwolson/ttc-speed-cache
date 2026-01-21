# TTC Leaderboard Cloud Architecture Plan

## Overview
Migrate from local file-based caching to automated cloud infrastructure with database persistence, reducing 1.5 GB/month uncompressed to ~420-480 MB (database) + compressed archives.

## Current State Analysis

### Data Structure Inefficiencies
- **Redundant timestamps**: `timestamp` (ISO) + `timestampMs` (ms) both stored → 3.7% waste
- **Route metadata duplication**: `routeTitle` repeated per-record across ~95,000 records → 3.1% waste
- **Floating point precision**: Unnecessary decimal places on speedKmh → 0.8% waste
- **Top-level redundancy**: `startTime` + `startTimeMs` duplicated

### Optimization Potential
| Strategy | Reduction | Result |
|----------|-----------|--------|
| JSON structural optimization | 8.1% | 1.38 GB/month |
| GZIP compression | 83% | ~250 MB/month |
| Optimized + Database | ~70% | ~420-480 MB/month |

## Recommended Architecture

### 1. Database: Supabase PostgreSQL
- **Cost**: $25/month starter tier (500 GB storage)
- **Alternative**: Vercel Postgres ($13+/month), TimescaleDB ($30+/month)
- **Schema**: Normalized with `routes`, `speed_readings`, `batches` tables
  
**Tables**:
```sql
CREATE TABLE routes (
  route_id INT PRIMARY KEY AUTO_INCREMENT,
  route_tag VARCHAR(10) UNIQUE NOT NULL,
  route_title VARCHAR(100) NOT NULL
);

CREATE TABLE speed_readings (
  reading_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  route_id INT NOT NULL,
  timestamp_ms BIGINT NOT NULL,
  speed_kmh DECIMAL(5,1) NOT NULL,
  vehicle_count TINYINT UNSIGNED NOT NULL,
  batch_time_ms BIGINT NOT NULL,
  FOREIGN KEY (route_id) REFERENCES routes(route_id),
  INDEX idx_route_timestamp (route_id, timestamp_ms),
  INDEX idx_batch_time (batch_time_ms),
  INDEX idx_timestamp (timestamp_ms)
);

CREATE TABLE batches (
  batch_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  batch_time_ms BIGINT UNIQUE NOT NULL,
  record_count INT NOT NULL
);
```

### 2. Archive Storage: Vercel Blob Storage
- **Cost**: ~$0.015/GB (after free tier)
- **Strategy**: Daily job compresses batches >30 days old to blob storage
- **Format**: GZIP (~83% reduction)

### 3. Scheduler: Vercel Cron
- **Cost**: Free (included with Vercel)
- **Frequency**: Every 1-5 minutes (configurable)
- **Endpoint**: `/api/cache-speeds` (refactored from local script)

### 4. API Changes: `/api/ttc` Updated
- **Current**: Computes averages on-demand from KV + live data
- **New**: Queries pre-computed data from database, joins with routes table
- **No frontend changes needed**: API contract remains the same

## Implementation Roadmap

### Phase 1: Data Reduction ✅ COMPLETE
- [x] Optimize cache-speeds.ts script to reduce collected data
  - Migrated to MessagePack binary format (77% compression vs JSON)
  - Flattened record structure: `[timestampMs, routeTag, speedKmh, vehicleCount]`
  - Removed redundant fields: `timestamp` (ISO string), `startTime`
  - **Result**: 177 records = 3.7 KB (vs ~10 KB if JSON flattened)
- [x] Separate routes lookup file with hourly refresh
  - Created `routes.json` (5.6 KB for 212 routes)
  - Updated hourly, not per-record
  - Persisted independently from speed data
- [x] Daily file partitioning
  - Files named `speed-data-YYYY-MM-DD.msgpack` (UTC)
  - Automatic rollover at midnight UTC
  - Efficient archival by date

**Estimated Monthly Savings**:
- Old format: 1.5 GB/month (95 MB per day)
- New format: ~420 MB/month (.msgpack + routes.json)
- **Reduction: 72%** (1.08 GB saved/month)

### Phase 2: Cloud Setup
- [ ] Create Supabase project & configure tables
- [ ] Migrate cache-speeds logic to Vercel Cron function
- [ ] Set up archive pipeline (Blob Storage compression)
- [ ] Update `/api/ttc` to query database

### Phase 3: Decommission Local
- [ ] Verify cloud pipeline stability (1-2 weeks)
- [ ] Remove local cache-speeds.ts script
- [ ] Delete speed-data.json file
- [ ] Archive final copy to Blob Storage

## Cost Summary
| Component | Cost/Month | Notes |
|-----------|-----------|-------|
| Supabase Starter | $25 | 500 GB storage + bandwidth |
| Vercel Cron | $0 | Included with Vercel |
| Blob Storage | ~$0.60 | ~40 GB/month archived @ $0.015/GB |
| **Total** | **~$25.60** | vs. $30+ for uncompressed cloud storage |

## Open Questions
1. Will you need historical views on frontend (e.g., "speed over last 7 days for route 7")?
2. Archive strategy: 30 days hot (database) + compressed, or different retention?
3. Compression format preference: GZIP (83% reduction) or MessagePack (77%)?
4. Need read-only replicas for analytics queries, or single database sufficient?
