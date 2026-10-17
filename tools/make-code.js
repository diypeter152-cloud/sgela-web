// ============================================================
//  Sgela — access code generator (run this when someone pays)
//
//  Usage (from the project folder):
//    SGELA_SECRET="your-secret" node tools/make-code.js            -> 30-day code
//    SGELA_SECRET="your-secret" node tools/make-code.js 60         -> 60-day code
//
//  The SGELA_SECRET must be the SAME value you set in Vercel's
//  environment variables, or the codes won't work on the live site.
// ============================================================

import crypto from "crypto";

const SECRET = process.env.SGELA_SECRET;
if (!SECRET) {
  console.error("\n❌ Set SGELA_SECRET first. Example:\n   SGELA_SECRET=\"your-secret\" node tools/make-code.js\n");
  process.exit(1);
}

const days = parseInt(process.argv[2] || "30", 10);

function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const exp = Math.floor(Date.now() / 1000) + days * 86400;
const payload = { t: "paid", exp, id: crypto.randomBytes(5).toString("hex") };
const p = b64url(JSON.stringify(payload));
const sig = crypto.createHmac("sha256", SECRET).update(p).digest("hex").slice(0, 24);
const code = `${p}.${sig}`;

const expDate = new Date(exp * 1000).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
console.log("\n✅ New Sgela access code (" + days + " days, expires " + expDate + "):\n");
console.log("   " + code + "\n");
console.log("Send this to the student. They tap 'Enter access code' and paste it.\n");
