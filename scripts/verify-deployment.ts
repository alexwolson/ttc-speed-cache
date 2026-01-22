#!/usr/bin/env tsx

import { Client } from "@upstash/qstash";
import { list } from "@vercel/blob";
import * as fs from "fs";
import * as path from "path";

// Load .env file
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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

async function main() {
  console.log("🔍 Verifying TTC Speed Cache Deployment\n");

  // 1. Check QStash schedules
  console.log("1️⃣  Checking QStash schedules...");
  try {
    const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
    const schedules = await qstash.schedules.list();
    const activeSchedules = schedules.filter((s: any) => 
      s.destination?.includes("/api/collect-sample")
    );
    
    if (activeSchedules.length > 0) {
      console.log(`   ✅ Found ${activeSchedules.length} active schedule(s)`);
      activeSchedules.forEach((s: any) => {
        console.log(`      - ID: ${s.scheduleId}`);
        console.log(`      - Cron: ${s.cron}`);
        console.log(`      - Destination: ${s.destination}`);
      });
    } else {
      console.log("   ⚠️  No schedules found for /api/collect-sample");
    }
  } catch (err) {
    console.log(`   ❌ Error checking QStash: ${err}`);
  }

  // 2. Check Blob Storage files
  console.log("\n2️⃣  Checking Vercel Blob Storage...");
  try {
    const blobs = await list();
    const speedFiles = blobs.blobs.filter(b => b.pathname.startsWith("speed-data-"));
    const routeFiles = blobs.blobs.filter(b => b.pathname.startsWith("routes-"));
    
    console.log(`   ✅ Found ${speedFiles.length} speed data file(s)`);
    console.log(`   ✅ Found ${routeFiles.length} route file(s)`);
    
    if (speedFiles.length > 0) {
      console.log("\n   📊 Latest speed data files:");
      speedFiles
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
        .slice(0, 5)
        .forEach((f) => {
          const uploadedAt = new Date(f.uploadedAt);
          const minutesAgo = Math.floor((Date.now() - uploadedAt.getTime()) / 60000);
          console.log(`      - ${f.pathname} (${minutesAgo}m ago, ${(f.size / 1024).toFixed(1)} KB)`);
        });
    }
    
    if (routeFiles.length > 0) {
      console.log("\n   🚌 Route metadata files:");
      routeFiles.forEach((f) => {
        console.log(`      - ${f.pathname} (${(f.size / 1024).toFixed(1)} KB)`);
      });
    }

    if (speedFiles.length === 0 && routeFiles.length === 0) {
      console.log("   ⚠️  No files found yet - wait a few minutes for first execution");
    }
  } catch (err) {
    console.log(`   ❌ Error checking Blob Storage: ${err}`);
  }

  // 3. Test endpoint
  console.log("\n3️⃣  Testing endpoint...");
  try {
    const response = await fetch("https://ttc-speed-cache.vercel.app/api/collect-sample", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.CRON_SECRET || "test"}`,
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Endpoint responding: ${response.status}`);
      console.log(`      - Success: ${data.success}`);
      console.log(`      - Records collected: ${data.recordsCollected}`);
      console.log(`      - Execution time: ${data.executionTimeMs}ms`);
      if (data.speedsBlobUrl) {
        console.log(`      - Speeds uploaded: ✓`);
      }
      if (data.routesBlobUrl) {
        console.log(`      - Routes uploaded: ✓`);
      }
    } else {
      console.log(`   ⚠️  Endpoint returned: ${response.status}`);
      const text = await response.text();
      console.log(`      Response: ${text}`);
    }
  } catch (err) {
    console.log(`   ❌ Error testing endpoint: ${err}`);
  }

  console.log("\n✅ Verification complete!");
}

main().catch(console.error);
