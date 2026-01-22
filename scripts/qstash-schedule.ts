#!/usr/bin/env tsx

import { Client } from "@upstash/qstash";
import * as fs from "fs";
import * as path from "path";

// Load .env file if it exists
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

// Usage:
//   COLLECT_ENDPOINT_URL=https://your-vercel-app.vercel.app/api/collect-sample \
//   npx tsx scripts/qstash-schedule.ts
//
// Required env vars:
// - QSTASH_TOKEN
// - COLLECT_ENDPOINT_URL
// - Optional: CRON_SECRET (will be sent as Authorization header)

async function main() {
  const token = process.env.QSTASH_TOKEN;
  const url = process.env.COLLECT_ENDPOINT_URL || "https://ttc-speed-cache.vercel.app/api/collect-sample";
  const cronSecret = process.env.CRON_SECRET;
  if (!token) throw new Error("QSTASH_TOKEN is required");
  if (!url) throw new Error("COLLECT_ENDPOINT_URL is required");

  const client = new Client({ token });

  // Delete existing schedules for this endpoint to avoid duplicates
  console.log("Checking for existing schedules...");
  const existingSchedules = await client.schedules.list();
  const matchingSchedules = existingSchedules.filter((s: any) => 
    s.destination?.includes("/api/collect-sample")
  );
  
  for (const schedule of matchingSchedules) {
    console.log(`Deleting existing schedule: ${schedule.scheduleId}`);
    await client.schedules.delete(schedule.scheduleId);
  }

  // Create schedule: every minute
  const schedule = await client.schedules.create({
    destination: url,
    cron: "* * * * *",
    method: "POST",
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : undefined,
  });

  console.log("Created schedule:", schedule);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
