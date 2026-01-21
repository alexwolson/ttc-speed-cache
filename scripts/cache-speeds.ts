#!/usr/bin/env tsx

import { XMLParser } from 'fast-xml-parser';
import { Packr } from 'msgpackr';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const FETCH_INTERVAL_MS = 60 * 1000; // 1 minute
const DEFAULT_DURATION_DAYS = 30;
const CACHE_DIR = path.join(process.cwd(), 'speed-cache');
const ROUTES_FILE = path.join(CACHE_DIR, 'routes.json');

// Types
type SpeedRecord = [timestampMs: number, routeTag: string, speedKmh: number, vehicleCount: number];
type RoutesLookup = Record<string, string>; // routeTag -> routeTitle

// MessagePack codec
const packr = new Packr();

// Route title caching (1 hour TTL)
type RouteTitlesCache = {
    fetchedAtMs: number;
    titlesByRouteTag: RoutesLookup;
};

let routeTitlesCache: RouteTitlesCache | null = null;
const ROUTE_TITLES_TTL_MS = 60 * 60 * 1000; // 1 hour

// Utility functions
function asArray<T>(value: T | T[] | null | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function parseSpeedKmh(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (raw.length === 0) return null;

    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n < 0) return null;

    return n;
}

function getTodaysCacheFile(): string {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD UTC
    return path.join(CACHE_DIR, `speed-data-${today}.msgpack`);
}

async function getRouteTitlesByTag(parser: XMLParser): Promise<RoutesLookup> {
    const now = Date.now();
    if (routeTitlesCache && now - routeTitlesCache.fetchedAtMs < ROUTE_TITLES_TTL_MS) {
        return routeTitlesCache.titlesByRouteTag;
    }

    try {
        const resp = await fetch(
            'https://webservices.umoiq.com/service/publicXMLFeed?command=routeList&a=ttc'
        );
        if (!resp.ok) {
            console.warn(`Failed to fetch routeList (${resp.status}), continuing without titles`);
            return routeTitlesCache?.titlesByRouteTag ?? {};
        }

        const xml = await resp.text();
        const json = parser.parse(xml);

        const routes = asArray<Record<string, unknown>>(json?.body?.route);
        const titlesByRouteTag: RoutesLookup = {};

        for (const route of routes) {
            const tag = route['@_tag'];
            const title = route['@_title'];
            if (typeof tag !== 'string' || tag.length === 0) continue;
            if (typeof title !== 'string' || title.length === 0) continue;
            titlesByRouteTag[tag] = title;
        }

        routeTitlesCache = { fetchedAtMs: now, titlesByRouteTag };
        
        // Persist routes to file
        saveRoutes(titlesByRouteTag);
        
        return titlesByRouteTag;
    } catch (error) {
        console.warn('Error fetching route titles:', error);
        return routeTitlesCache?.titlesByRouteTag ?? {};
    }
}

function loadRoutes(): RoutesLookup {
    if (!fs.existsSync(ROUTES_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function saveRoutes(routes: RoutesLookup): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2), 'utf-8');
}

async function fetchCurrentSpeeds(): Promise<SpeedRecord[]> {
    const nowMs = Date.now();

    try {
        const response = await fetch(
            'https://webservices.umoiq.com/service/publicXMLFeed?command=vehicleLocations&a=ttc'
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch TTC data: ${response.status}`);
        }

        const xmlData = await response.text();

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
        });
        const jsonData = parser.parse(xmlData);

        const vehicles = asArray<Record<string, unknown>>(jsonData?.body?.vehicle);
        const routeData: { [key: string]: { total_speed: number; total_trams: number } } = {};

        for (const vehicle of vehicles) {
            const route = vehicle['@_routeTag'];
            if (typeof route !== 'string' || route.length === 0) {
                continue;
            }
            const speedKmh = parseSpeedKmh(vehicle['@_speedKmHr']);
            if (speedKmh === null) {
                continue;
            }
            if (!routeData[route]) {
                routeData[route] = {
                    total_speed: 0,
                    total_trams: 0
                };
            }
            routeData[route].total_speed += speedKmh;
            routeData[route].total_trams += 1;
        }

        await getRouteTitlesByTag(parser); // Refresh routes lookup
        const records: SpeedRecord[] = [];

        for (const [routeTag, data] of Object.entries(routeData)) {
            if (data.total_trams <= 0) continue;
            const avgSpeed = parseFloat((data.total_speed / data.total_trams).toFixed(1));
            const record: SpeedRecord = [nowMs, routeTag, avgSpeed, data.total_trams];
            records.push(record);
        }

        return records;
    } catch (error) {
        console.error('Error fetching speeds:', error);
        return [];
    }
}

function loadCache(): SpeedRecord[] {
    const file = getTodaysCacheFile();
    if (!fs.existsSync(file)) return [];

    try {
        const buffer = fs.readFileSync(file);
        return packr.unpack(buffer) as SpeedRecord[];
    } catch (error) {
        console.error('Error loading cache, starting fresh:', error);
        return [];
    }
}

function saveCache(records: SpeedRecord[]): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    const file = getTodaysCacheFile();
    const buffer = packr.pack(records);
    fs.writeFileSync(file, buffer);
}

async function collectSample(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Fetching speed data...`);
    const records = await fetchCurrentSpeeds();
    
    if (records.length === 0) {
        console.log('  No data fetched (possibly an error or no vehicles active)');
        return;
    }

    const cache = loadCache();
    cache.push(...records);
    saveCache(cache);

    console.log(`  Collected ${records.length} route speed records`);
    console.log(`  Total records in cache: ${cache.length}`);
}

function printStats(records: SpeedRecord[]): void {
    if (records.length === 0) {
        console.log('No data collected yet');
        return;
    }

    const routeTags = new Set<string>();
    let minTimestampMs = Infinity;
    let maxTimestampMs = -Infinity;

    for (const record of records) {
        routeTags.add(record[1]); // routeTag is at index 1
        minTimestampMs = Math.min(minTimestampMs, record[0]);
        maxTimestampMs = Math.max(maxTimestampMs, record[0]);
    }

    const durationHours = (maxTimestampMs - minTimestampMs) / (1000 * 60 * 60);
    const cacheFile = getTodaysCacheFile();
    const fileSizeBytes = fs.existsSync(cacheFile) ? fs.statSync(cacheFile).size : 0;
    const routesFileSize = fs.existsSync(ROUTES_FILE) ? fs.statSync(ROUTES_FILE).size : 0;

    console.log('\n=== Cache Statistics ===');
    console.log(`Collection date: ${new Date(minTimestampMs).toISOString().split('T')[0]}`);
    console.log(`Duration: ${durationHours.toFixed(2)} hours (${(durationHours / 24).toFixed(2)} days)`);
    console.log(`Total records: ${records.length}`);
    console.log(`Unique routes: ${routeTags.size}`);
    console.log(`Cache file: ${cacheFile}`);
    console.log(`Cache file size: ${(fileSizeBytes / 1024).toFixed(2)} KB`);
    console.log(`Routes file: ${ROUTES_FILE}`);
    console.log(`Routes file size: ${(routesFileSize / 1024).toFixed(2)} KB`);
    console.log('========================\n');
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const durationDays = args.length > 0 ? parseInt(args[0], 10) : DEFAULT_DURATION_DAYS;

    if (isNaN(durationDays) || durationDays <= 0) {
        console.error('Invalid duration. Usage: npm run cache-speeds [days]');
        process.exit(1);
    }

    console.log('=================================================');
    console.log('TTC Speed Data Caching Script');
    console.log('=================================================');
    console.log(`Collection interval: ${FETCH_INTERVAL_MS / 1000} seconds`);
    console.log(`Target duration: ${durationDays} days`);
    console.log(`Cache directory: ${CACHE_DIR}`);
    console.log('=================================================\n');
    console.log('Press Ctrl+C to stop collection\n');

    // Load existing cache and routes
    let cache = loadCache();
    const routes = loadRoutes();
    routeTitlesCache = Object.keys(routes).length > 0 ? { fetchedAtMs: Date.now(), titlesByRouteTag: routes } : null;
    
    printStats(cache);

    // Collect first sample immediately
    await collectSample();

    // Reload cache for tracking startTimeMs
    cache = loadCache();
    const startTimeMs = cache.length > 0 ? cache[0][0] : Date.now();

    // Flag to control the collection loop
    let isRunning = true;

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\nStopping data collection...');
        isRunning = false;
    });

    // Serialized collection loop to prevent race conditions
    while (isRunning) {
        // Wait for the next collection interval
        await new Promise(resolve => setTimeout(resolve, FETCH_INTERVAL_MS));

        if (!isRunning) break;

        await collectSample();
        
        // Check if we've reached the target duration
        const nowMs = Date.now();
        const elapsedDays = (nowMs - startTimeMs) / (1000 * 60 * 60 * 24);
        
        if (elapsedDays >= durationDays) {
            console.log(`\nTarget duration of ${durationDays} days reached.`);
            const finalCache = loadCache();
            printStats(finalCache);
            process.exit(0);
        }
    }

    // If we exit the loop due to SIGINT, show final stats
    const finalCache = loadCache();
    printStats(finalCache);
    process.exit(0);
}

// Run the script
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
