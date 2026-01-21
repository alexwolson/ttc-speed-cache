# TTC Speed Cache

A data collection tool for tracking TTC (Toronto Transit Commission) vehicle speeds across all routes over time. Collects speed data from the TTC's public NextBus XML feed and stores it in efficient MessagePack format for analysis.

## 🎯 Purpose

The TTC has long struggled with slow transit speeds across its network, particularly on streetcar routes. This tool enables long-term data collection to analyze speed patterns, identify problem routes, and support evidence-based advocacy for improvements like transit signal priority (TSP), dedicated lanes, and other speed-enhancing measures.

## 🚀 Getting Started

### Prerequisites
- Node.js 20.x or later
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ttc-speed-cache.git
cd ttc-speed-cache

# Install dependencies
npm install
```

### Usage

Collect TTC speed data over an extended period:

```bash
# Run with default 30-day collection period
npm run cache-speeds

# Or specify a custom duration in days
npm run cache-speeds 7
```

The script will:
- Fetch speed data every 60 seconds from the TTC NextBus API
- Calculate average speeds per route based on active vehicles
- Store data in `speed-cache/speed-data-YYYY-MM-DD.msgpack` (binary format)
- Maintain a `speed-cache/routes.json` file with route metadata
- Display collection statistics and progress

Press `Ctrl+C` to stop collection at any time. Statistics will be displayed on exit.

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

### Speed Records (`speed-cache/speed-data-YYYY-MM-DD.msgpack`)

Binary MessagePack file containing an array of records:

```typescript
type SpeedRecord = [
  timestampMs: number,    // Unix timestamp in milliseconds
  routeTag: string,       // Route identifier (e.g., "501", "1")
  speedKmh: number,       // Average speed for this route at this time
  vehicleCount: number    // Number of vehicles averaged
]
```

### Route Metadata (`speed-cache/routes.json`)

JSON file mapping route tags to titles:

```json
{
  "501": "501-Queen",
  "1": "1-Yonge-University",
  ...
}
```

## 🗂️ Project Structure

```
ttc-speed-cache/
├── scripts/
│   ├── cache-speeds.ts    # Main data collection script
│   └── README.md          # Detailed script documentation
├── speed-cache/           # Data output directory (gitignored)
│   ├── routes.json        # Route metadata
│   └── speed-data-*.msgpack  # Daily speed data files
├── package.json
├── tsconfig.json
├── eslint.config.js
└── README.md
```

## 🔧 Configuration

Edit constants in [scripts/cache-speeds.ts](scripts/cache-speeds.ts):

- `FETCH_INTERVAL_MS`: Data collection interval (default: 60 seconds)
- `DEFAULT_DURATION_DAYS`: Default collection duration (default: 30 days)
- `CACHE_DIR`: Output directory (default: `./speed-cache`)

## 📝 Notes

- The `speed-cache/` directory is gitignored by default to prevent committing large data files
- Data files are named by date in UTC timezone
- MessagePack format provides ~50% size reduction compared to JSON
- Route metadata is refreshed every hour to catch new routes
- Script continues on API errors to maintain uptime during network issues

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
└── package.json
```

## 👤 Author

**Luka Jovanovic** — [lukajvnic.com](https://lukajvnic.com)