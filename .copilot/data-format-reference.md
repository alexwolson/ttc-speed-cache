# New Data Format Reference

## File Structure

### speed-data-YYYY-MM-DD.msgpack
Binary MessagePack-encoded array of SpeedRecord tuples.

**Format**: `[timestampMs, routeTag, speedKmh, vehicleCount][]`

**Encoding**:
```typescript
import { Packr } from 'msgpackr';
const packr = new Packr();

// Encoding (write)
const records: SpeedRecord[] = [
  [1769036796096, "7", 8.9, 17],
  [1769036796096, "8", 9.8, 4],
];
const buffer = packr.pack(records);
fs.writeFileSync(`speed-data-${date}.msgpack`, buffer);

// Decoding (read)
const buffer = fs.readFileSync(`speed-data-${date}.msgpack`);
const records = packr.unpack(buffer) as SpeedRecord[];
```

**Size Estimate**: ~14 MB/day (vs 95 MB/day in old JSON format)

---

### routes.json
Plain JSON lookup table, updated hourly.

**Format**: `Record<routeTag, routeTitle>`

**Example**:
```json
{
  "1": "1-Bloor",
  "2": "2-Bloor West",
  "7": "7-Bathurst",
  "8": "8-Broadview",
  ...
}
```

**Size Estimate**: ~5-10 KB (grows slowly with new routes)

---

## Data Types

### SpeedRecord
```typescript
type SpeedRecord = [
  timestampMs: number,    // Unix timestamp in milliseconds (e.g., 1769036796096)
  routeTag: string,       // Route identifier (e.g., "7", "501", "1")
  speedKmh: number,       // Average speed, 1 decimal place (e.g., 8.9)
  vehicleCount: number    // Number of vehicles sampled (e.g., 17)
];
```

### Decoding to Readable Format
```typescript
const routes = JSON.parse(fs.readFileSync('routes.json', 'utf-8'));
const record = [1769036796096, "7", 8.9, 17] as SpeedRecord;

const readable = {
  timestamp: new Date(record[0]).toISOString(),  // "2026-01-21T23:06:36.096Z"
  routeTag: record[1],                           // "7"
  routeTitle: routes[record[1]],                 // "7-Bathurst"
  speedKmh: record[2],                           // 8.9
  vehicleCount: record[3]                        // 17
};
```

---

## File Rotation

Files rotate automatically at **midnight UTC** based on `new Date().toISOString().split('T')[0]`.

**Current file** (during collection):
- Path: `speed-cache/speed-data-2026-01-21.msgpack`
- Gets appended to until midnight UTC
- At midnight, new file created: `speed-data-2026-01-22.msgpack`

**Example timeline**:
```
2026-01-21 23:50:00 UTC → speed-data-2026-01-21.msgpack
2026-01-22 00:00:00 UTC → switches to speed-data-2026-01-22.msgpack
2026-01-22 23:50:00 UTC → speed-data-2026-01-22.msgpack
```

---

## Backward Compatibility

**Old `speed-data.json` format no longer used.**

If you need to archive or migrate old data:
```typescript
// Parse old JSON
const oldData = JSON.parse(fs.readFileSync('speed-data.json', 'utf-8')) as CacheData;

// Convert records to new format
const newRecords: SpeedRecord[] = oldData.records.map(r => [
  r.timestampMs,
  r.routeTag,
  r.speedKmh,
  r.vehicleCount
]);

// Save as MessagePack with appropriate date
const packr = new Packr();
const buffer = packr.pack(newRecords);
fs.writeFileSync(`speed-cache/speed-data-${date}.msgpack`, buffer);
```

---

## Query Examples

### Read all records from a specific date
```typescript
const { Packr } = require('msgpackr');
const fs = require('fs');
const packr = new Packr();

const buffer = fs.readFileSync('speed-cache/speed-data-2026-01-21.msgpack');
const records = packr.unpack(buffer) as SpeedRecord[];

console.log(`Records from 2026-01-21: ${records.length}`);
```

### Find all records for a specific route
```typescript
const records = packr.unpack(buffer) as SpeedRecord[];
const route7Records = records.filter(r => r[1] === "7");
console.log(`Route 7 samples: ${route7Records.length}`);
```

### Calculate average speed for a route over a day
```typescript
const records = packr.unpack(buffer) as SpeedRecord[];
const route7Records = records.filter(r => r[1] === "7");
const avgSpeed = route7Records.reduce((sum, r) => sum + r[2], 0) / route7Records.length;
console.log(`Route 7 average speed: ${avgSpeed.toFixed(1)} km/h`);
```

---

## Storage Efficiency

| Metric | Old Format | New Format | Savings |
|--------|-----------|-----------|---------|
| Per-day file size | 95 MB | 14 MB | 85% |
| Per-month | 1.5 GB | 420 MB | 72% |
| Per-year | 18 GB | 5 GB | 72% |
| Unique route metadata | Per-record | Hourly lookup | 99% |

**Cost Impact** (for cloud storage):
- Old: $34.50/month @ $0.023/GB (S3)
- New: $9.70/month @ $0.023/GB (S3)
- **Annual savings: ~$299**
