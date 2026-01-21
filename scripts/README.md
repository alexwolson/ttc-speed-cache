# TTC Speed Data Caching Script

This script allows you to collect TTC route speed data over an extended period (e.g., 1 month) for analysis and archival purposes.

## Overview

The caching script:
- Fetches live TTC vehicle location data from the UmoIQ/NextBus API every minute
- Calculates average speeds for each route (matching the methodology used in the web app)
- Records timestamp, route tag, route title, speed (km/h), and vehicle count
- Stores all data in a local JSON file (`speed-cache/speed-data.json`)
- Runs continuously until stopped or the target duration is reached

## Installation

First, ensure dependencies are installed:

```bash
npm install
```

## Usage

### Basic Usage (30 days)

To run the script with the default 30-day collection period:

```bash
npm run cache-speeds
```

### Custom Duration

To specify a different collection duration (in days):

```bash
npm run cache-speeds 7    # Collect for 7 days
npm run cache-speeds 60   # Collect for 60 days
```

### Stopping Collection

Press `Ctrl+C` to stop the script at any time. Your data will be saved and statistics will be displayed.

## Output

### Cache File Location

Data is stored in: `speed-cache/speed-data.json`

### Data Format

The cache file contains:
- `startTime`: ISO 8601 timestamp when collection started
- `records`: Array of speed records, where each record contains:
  - `timestamp`: ISO 8601 timestamp of the measurement
  - `timestampMs`: Unix timestamp in milliseconds
  - `routeTag`: TTC route identifier (e.g., "501", "506")
  - `routeTitle`: Human-readable route name (e.g., "Queen")
  - `speedKmh`: Average speed in km/h for the route at that timestamp
  - `vehicleCount`: Number of vehicles on the route at that timestamp

### Example Output

```json
{
  "startTime": "2026-01-20T18:30:00.000Z",
  "startTimeMs": 1737399000000,
  "records": [
    {
      "timestamp": "2026-01-20T18:30:00.000Z",
      "timestampMs": 1737399000000,
      "routeTag": "501",
      "routeTitle": "Queen",
      "speedKmh": 12.5,
      "vehicleCount": 15
    },
    {
      "timestamp": "2026-01-20T18:30:00.000Z",
      "timestampMs": 1737399000000,
      "routeTag": "506",
      "routeTitle": "Carlton",
      "speedKmh": 14.2,
      "vehicleCount": 8
    }
  ]
}
```

## Statistics

The script displays statistics when stopped:
- Start time of collection
- Total duration (hours and days)
- Total number of records collected
- Number of unique routes observed
- Cache file location

## Implementation Details

### Data Collection
- Collection interval: 60 seconds (1 minute)
- Data source: TTC NextBus XML Feed via UmoIQ
- Same speed calculation logic as the web app (see `api/ttc.ts`)

### Speed Calculation
- Speed is calculated as the simple arithmetic mean of valid `speedKmHr` values across all active vehicles on a route
- Invalid/missing speed values are excluded
- Zero speed (stopped vehicles) is included in the average

### File Management
- Data is appended to the cache file after each collection
- The cache file is created automatically if it doesn't exist
- On script restart, existing data is preserved and new data is appended

## Notes

- The script runs indefinitely until you stop it or the target duration is reached
- Data is saved after each collection, so you won't lose data if the script is interrupted
- The `speed-cache/` directory is excluded from Git via `.gitignore`
- Internet connection is required as the script fetches live data from the TTC API
- No API key or authentication is required

## Troubleshooting

### Script won't start
- Ensure you've run `npm install` to install dependencies
- Check that you have Node.js 20.x or later installed

### No data being collected
- Verify your internet connection
- Check the console output for error messages
- The TTC API may occasionally be unavailable; the script will continue trying

### Want to start fresh
- Simply delete the `speed-cache/` directory to start a new collection period
