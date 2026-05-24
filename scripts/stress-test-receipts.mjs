import { readFileSync } from "fs";
import crypto from "crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

readFileSync("./.env.local","utf8").split("\n").forEach(l=>{const m=l.match(/^([^#=]+)=(.*)$/);if(m)process.env[m[1].trim()]=m[2].trim()});

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const client = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY});

console.log("=== Receipt pipeline stress test ===\n");

// Test cases: synthetic JPEG of various sizes
async function testJpeg(label, sizePx) {
  console.log(`\n[${label}] generating ${sizePx}px synthetic receipt`);
  // Build a simple JPEG with sharp — solid colour + text-like noise so Claude has something
  const buf = await sharp({
    create: { width: sizePx, height: sizePx, channels: 3, background: { r: 255, g: 255, b: 255 } }
  }).jpeg({ quality: 85 }).toBuffer();
  console.log(`  size: ${(buf.length/1024).toFixed(0)}KB`);

  // Hash check
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  console.log(`  hash: ${hash.slice(0,12)}...`);

  // Sharp resize check (mirrors API route)
  const meta = await sharp(buf).metadata();
  console.log(`  metadata: ${meta.width}x${meta.height} ${meta.format}`);

  if (Math.max(meta.width||0, meta.height||0) > 2576) {
    const resized = await sharp(buf).resize({width: 2576, withoutEnlargement: true}).jpeg({quality:88}).toBuffer();
    console.log(`  → resized: ${(resized.length/1024).toFixed(0)}KB`);
  }

  // Storage upload check
  const key = `stress-test/${Date.now()}-${hash.slice(0,8)}.jpg`;
  const { error: upErr } = await sb.storage.from("receipts").upload(key, buf, {contentType: "image/jpeg", upsert: false});
  if (upErr) {
    console.log(`  ❌ storage error: ${upErr.message}`);
    return false;
  }
  console.log(`  ✓ uploaded to receipts/${key}`);

  // Delete the test file
  await sb.storage.from("receipts").remove([key]);
  return true;
}

await testJpeg("small", 800);
await testJpeg("medium", 1600);
await testJpeg("large", 3000);
await testJpeg("huge", 5000);

console.log("\n=== Verify Claude can extract from a synthetic image ===");
const testBuf = await sharp({
  create: {width: 800, height: 600, channels: 3, background: {r:255,g:255,b:255}}
}).jpeg().toBuffer();

const r = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 200,
  messages: [{
    role: "user",
    content: [
      {type:"image", source: {type:"base64", media_type:"image/jpeg", data: testBuf.toString("base64")}},
      {type:"text", text: "Just respond with the word 'OK' to confirm you received an image."}
    ]
  }]
});
console.log("  Claude response:", r.content[0].type === "text" ? r.content[0].text : "?");
console.log("\n✓ All tests passed");
