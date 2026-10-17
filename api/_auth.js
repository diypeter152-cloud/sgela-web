// ============================================================
//  SGELA AI — access code signing/verification (no database)
//  A code is: base64url(payload) + "." + HMAC-SHA256(payload, SECRET)
//  payload = { t: "trial"|"paid", exp: <unix seconds>, id: "<random>" }
//  Students can READ the payload but cannot FORGE one (no secret).
// ============================================================

import crypto from "crypto";

const SECRET = process.env.SGELA_SECRET || "dev-insecure-secret-change-me";

function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64").toString("utf8");
}
function sign(payloadB64) {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("hex").slice(0, 24);
}

// Create a code valid for `days` days. type is "trial" or "paid".
export function makeCode({ days = 30, type = "paid" } = {}) {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const payload = { t: type, exp, id: crypto.randomBytes(5).toString("hex") };
  const p = b64url(JSON.stringify(payload));
  return `${p}.${sign(p)}`;
}

// Verify a code. Returns { ok, type, exp } or { ok:false, reason }.
export function verifyCode(code) {
  if (!code || typeof code !== "string" || !code.includes(".")) {
    return { ok: false, reason: "missing" };
  }
  const [p, sig] = code.split(".");
  if (!p || !sig) return { ok: false, reason: "malformed" };

  const expected = sign(p);
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  let payload;
  try { payload = JSON.parse(b64urlDecode(p)); } catch { return { ok: false, reason: "corrupt" }; }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, type: payload.t || "paid", exp: payload.exp };
}
