// ============================================================
//  Skolo — PayFast helpers (signature + config)
//  PayFast handles the actual card/EFT on their secure page.
//  We only sign the request and verify their notification.
// ============================================================

import crypto from "crypto";

const MODE = process.env.PAYFAST_MODE || "sandbox";
const IS_SANDBOX = MODE !== "live";

// In sandbox mode we use PayFast's universal TEST merchant so you can test
// the full flow with fake money, no setup. In live mode we use YOUR real
// credentials from the environment variables.
export const PF = {
  mode: MODE,
  merchantId: IS_SANDBOX ? "10000100" : (process.env.PAYFAST_MERCHANT_ID || ""),
  merchantKey: IS_SANDBOX ? "46f0cd694581a" : (process.env.PAYFAST_MERCHANT_KEY || ""),
  passphrase: IS_SANDBOX ? "" : (process.env.PAYFAST_PASSPHRASE || ""),
};

export function pfConfigured() {
  return !!(PF.merchantId && PF.merchantKey);
}

export function pfProcessUrl() {
  return PF.mode === "live"
    ? "https://www.payfast.co.za/eng/process"
    : "https://sandbox.payfast.co.za/eng/process";
}
export function pfValidateUrl() {
  return PF.mode === "live"
    ? "https://www.payfast.co.za/eng/query/validate"
    : "https://sandbox.payfast.co.za/eng/query/validate";
}

// PHP urlencode() — PayFast builds its signature this way.
// (spaces -> "+", uppercase hex, and encode ! ' ( ) * ~ which JS leaves alone)
export function phpUrlEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/%20/g, "+")
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A")
    .replace(/~/g, "%7E");
}

// Build the MD5 signature over ordered name=value pairs (PayFast spec).
// `pairs` is an array of [name, value] in submission order.
export function pfSignature(pairs, passphrase = PF.passphrase) {
  const parts = [];
  for (const [k, v] of pairs) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${k}=${phpUrlEncode(String(v).trim())}`);
  }
  let str = parts.join("&");
  if (passphrase) str += `&passphrase=${phpUrlEncode(passphrase.trim())}`;
  return crypto.createHash("md5").update(str).digest("hex");
}

// Verify the signature on an incoming ITN (data is an object of posted fields).
export function pfVerifyItnSignature(data) {
  const received = data.signature;
  // rebuild from all posted fields EXCEPT signature, in the order received
  const pairs = Object.keys(data)
    .filter((k) => k !== "signature")
    .map((k) => [k, data[k]]);
  const expected = pfSignature(pairs);
  return received === expected;
}
