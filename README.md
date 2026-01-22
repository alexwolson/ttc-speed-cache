# TTC Speed Cache

An automated cloud-based data collection tool for tracking TTC (Toronto Transit Commission) vehicle speeds across all routes over time. Collects speed data every minute from the TTC's public NextBus XML feed and stores it in efficient MessagePack format on Vercel Blob Storage for long-term analysis.

## 🎯 Purpose

The TTC has long struggled with slow transit speeds across its network, particularly on streetcar routes. This tool enables automated, long-term data collection to analyze speed patterns, identify problem routes, and support evidence-based advocacy for improvements like transit signal priority (TSP), dedicated lanes, and other speed-enhancing measures.

## 🚀 Getting Started

### Prerequisites
- Vercel account (free tier works)
- Node.js 20.x or later (for local development/testing)

### Deployment

```bash
# Clone the repository
git clone https://github.com/alexwolson/ttc-speed-cache.git
cd ttc-speed-cache

# Install dependencies (for local development)
npm install

# Deploy to Vercel
vercel
```

### Configuration

1. **Create Vercel Blob Store** in your project dashboard
2. **Set environment variables** in Vercel project settings:
  - `BLOB_READ_WRITE_TOKEN` - From your Vercel Blob Store
  - `CRON_SECRET` (optional) - Random string for cron authentication

3. **Deploy** - The cron job will automatically start running every minute

### How It Works

A Vercel Cron job (`/api/collect-sample`) runs every minute and:
- Fetches speed data from the TTC NextBus API
- Calculate average speeds per route based on active vehicles
- Stores each sample as `speed-data-YYYY-MM-DD-HHmm.msgpack` in Vercel Blob Storage
- Updates daily `routes-YYYY-MM-DD.json` file with route metadata
- Returns execution stats (routes collected, blob URLs, execution time)

## 📊 How It Works

1. **Data Fetching** — Fetches the TTC's live vehicle location feed every minute
2. **Speed Calculation** — Calculates average speed for each route based on active vehicles
   - **Data source**: TTC/UmoIQ NextBus public XML feed (`vehicleLocations` command)
   - **Speed attribute**: `speedKmHr` per vehicle
   - **Route averaging**: Simple arithmetic mean across all active vehicles on each route
   - **Validation**: Excludes missing, empty, non-numeric, or negative speeds; treats 0 km/h as valid (stopped)
3. **Data Storage** — Saves records as MessagePack for efficient storage
   - Each record: `[timestampMs, routeTag, avgSpeedKmh, vehicleCount]`
   - Daily files prevent unbounded growth
   - Routes metadata cached separately with 1-hour TTL
4. **Route Metadata** — Fetches route titles from TTC API and caches in `routes.json`

## 📁 Data Format

### Speed Records (Blob Storage: `speed-data-YYYY-MM-DD-HHmm.msgpack`)

Binary MessagePack file containing an array of records for a single minute:

```typescript
type SpeedRecord = [
  timestampMs: number,    // Unix timestamp in milliseconds
  routeTag: string,       // Route identifier (e.g., "501", "1")
  speedKmh: number,       // Average speed for this route at this time
  vehicleCount: number    // Number of vehicles averaged
]
```

**File naming**: `speed-data-2026-01-21-1430.msgpack` (YYYY-MM-DD-HHmm UTC)

### Route Metadata (Blob Storage: `routes-YYYY-MM-DD.json`)

JSON file mapping route tags to titles:

```json
{
  "501": "501-Queen",
  "1": "1-Yonge-University",
  ...
}
```

**File naming**: `routes-2026-01-21.json` (YYYY-MM-DD UTC, updated once daily)

## 🗂️ Project Structure

```
ttc-speed-cache/
├── api/
│   └── collect-sample.ts  # Vercel Cron endpoint for data collection
├── .copilot/              # Architecture plans and documentation
├── package.json
├── tsconfig.json
├── vercel.json            # Vercel Cron configuration
├── .env.example           # Environment variables template
└── README.md
```

## 🔧 Configuration

**Cron Schedule** - Edit [vercel.json](vercel.json) to change collection frequency:
- Default: `"* * * * *"` (every minute)
- Every 5 minutes: `"*/5 * * * *"`

**Data Access** - Download collected data from Vercel Blob Storage:
```bash
# Using Vercel CLI
vercel blob ls
vercel blob download speed-data-2026-01-21-1430.msgpack
```

## 📝 Notes

- Data is stored in Vercel Blob Storage (not in git repository)
- Files are named with UTC timestamps for consistent global time reference
- MessagePack format provides ~77% size reduction compared to JSON
- Routes are updated once per day to minimize API calls
- Cron continues on API errors (skips that minute, retries next execution)
- **Cost**: ~$0.01/month for storage (420 MB/month @ $0.015/GB)

## 📊 Data Analysis

Files can be downloaded and analyzed locally using the MessagePack format:

```typescript
import { Packr } from 'msgpackr';
import * as fs from 'fs';

const packr = new Packr();
const buffer = fs.readFileSync('speed-data-2026-01-21-1430.msgpack');
const records = packr.unpack(buffer);
console.log(records); // Array of [timestampMs, routeTag, speedKmh, vehicleCount]
```

## 🛠️ Development

```bash
# Lint code
npm run lint

# Type checking is built into the tsx runtime
```

## 📄 License

MIT

## 🙏 Acknowledgments

This project is derived from the [TTC Leaderboard](https://github.com/lukajvnic/ttc-leaderboard) by **Luka Jovanovic** and **Matthew Li**. The original project was a live web application displaying real-time TTC route speeds; this version focuses solely on the data collection component for long-term analysis.

Data provided by TTC via the UmoIQ NextBus public XML feed.