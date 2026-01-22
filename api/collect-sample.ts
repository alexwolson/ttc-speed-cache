import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put, list } from '@vercel/blob';
import { XMLParser } from 'fast-xml-parser';
import { Packr } from 'msgpackr';
import { Receiver } from '@upstash/qstash';

// Types
type SpeedRecord = [timestampMs: number, routeTag: string, speedKmh: number, vehicleCount: number];
type RoutesLookup = Record<string, string>;

// MessagePack codec
const packr = new Packr();

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

async function getRouteTitlesByTag(parser: XMLParser): Promise<RoutesLookup> {
    try {
        const resp = await fetch(
            'https://webservices.umoiq.com/service/publicXMLFeed?command=routeList&a=ttc'
        );
        if (!resp.ok) {
            console.warn(`Failed to fetch routeList (${resp.status})`);
            return {};
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

        return titlesByRouteTag;
    } catch (error) {
        console.warn('Error fetching route titles:', error);
        return {};
    }
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

async function uploadRoutesToBlob(routes: RoutesLookup, dateStr: string): Promise<string | null> {
    try {
        const filename = `routes-${dateStr}.json`;
        const blob = await put(filename, JSON.stringify(routes, null, 2), {
            access: 'public',
            contentType: 'application/json',
        });
        return blob.url;
    } catch (error) {
        console.error('Error uploading routes to Blob:', error);
        return null;
    }
}

async function uploadSpeedsToBlob(records: SpeedRecord[], dateStr: string, timeStr: string): Promise<string | null> {
    try {
        const filename = `speed-data-${dateStr}-${timeStr}.msgpack`;
        const buffer = packr.pack(records);
        const blob = await put(filename, buffer, {
            access: 'public',
            contentType: 'application/octet-stream',
        });
        return blob.url;
    } catch (error) {
        console.error('Error uploading speeds to Blob:', error);
        return null;
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Authentication: allow either Upstash signature or CRON_SECRET
    const cronSecret = process.env.CRON_SECRET;
    const upstashSignature = req.headers['upstash-signature'] as string | undefined;
    const hasSigningKeys = !!process.env.QSTASH_CURRENT_SIGNING_KEY;
    if (upstashSignature && hasSigningKeys) {
        try {
            const receiver = new Receiver({
                currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
                nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? process.env.QSTASH_CURRENT_SIGNING_KEY!,
            });
            // Construct absolute URL for verification (protocol + host + path)
            const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
            const host = req.headers['host'] as string;
            const fullUrl = host ? `${proto}://${host}${req.url ?? ''}` : (req.url ?? '');
            await receiver.verify({
                url: fullUrl,
                body: '',
                signature: upstashSignature,
            });
        } catch (_e) {
            return res.status(401).json({ error: 'Unauthorized (invalid Upstash signature)' });
        }
    } else {
        // Fall back to shared secret header when signature or keys are not available
        if (cronSecret && req.headers['authorization'] === `Bearer ${cronSecret}`) {
            // authorized via shared secret
        } else {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    const startTime = Date.now();
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toISOString().slice(11, 16).replace(':', ''); // HHmm

    try {
        // Fetch current speeds
        const records = await fetchCurrentSpeeds();
        
        if (records.length === 0) {
            console.warn('No speed data collected');
            return res.status(200).json({
                success: false,
                message: 'No data collected (TTC API may be down)',
                timestamp: now.toISOString(),
            });
        }

        // Upload speeds to Blob Storage
        const speedsBlobUrl = await uploadSpeedsToBlob(records, dateStr, timeStr);
        
        if (!speedsBlobUrl) {
            return res.status(500).json({
                success: false,
                message: 'Failed to upload speeds to Blob Storage',
                timestamp: now.toISOString(),
            });
        }

        // Upload routes once per day: if routes-{date}.json doesn't exist
        let routesBlobUrl: string | null = null;
        try {
            const existing = await list({ prefix: `routes-${dateStr}` });
            if ((existing.blobs ?? []).length === 0) {
                const parser = new XMLParser({
                    ignoreAttributes: false,
                    attributeNamePrefix: '@_',
                });
                const routes = await getRouteTitlesByTag(parser);
                if (routes && Object.keys(routes).length > 0) {
                    routesBlobUrl = await uploadRoutesToBlob(routes, dateStr);
                }
            }
        } catch (_err) {
            // Non-fatal: skip routes upload if listing fails
        }

        const executionTime = Date.now() - startTime;

        return res.status(200).json({
            success: true,
            timestamp: now.toISOString(),
            dateStr,
            timeStr,
            recordsCollected: records.length,
            speedsBlobUrl,
            routesBlobUrl,
            executionTimeMs: executionTime,
        });
    } catch (error) {
        console.error('Error in collect-sample handler:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: now.toISOString(),
        });
    }
}
