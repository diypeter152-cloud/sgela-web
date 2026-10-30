// ============================================================
//  Skolo — WhatsApp user status (free questions / paid gating by phone number)
//  Stored in Upstash:  wauser:<number> = { firstSeen, paidUntil, msgCount,
//                        refCode, refBy, refCount, refRewarded, refCredited }
//  Referral lookup:    refcode:<CODE> = <number>
// ============================================================

import crypto from "crypto";
import { kvConfigured, kvGet, kvSet, kvIncr } from "./_kv.js";

export const FREE_QUESTIONS = 3;   // free taste before the paywall
export const REF_GOAL = 3;         // paid referrals needed for 1 free month
const REF_REWARD_DAYS = 30;        // free month granted at each goal
const PAID_DAYS = 30;
const DAY = 86400;

function now() { return Math.floor(Date.now() / 1000); }

// Deterministic, friendly referral code for a number, e.g. "SK7F2A".
export function refCodeFor(number) {
  const h = crypto.createHash("sha1").update("skolo:" + number).digest("hex");
  const base = parseInt(h.slice(0, 12), 16).toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return "SK" + (base + "0000").slice(0, 4);
}

// Load (or create) a user record. New numbers get FREE_QUESTIONS free, then pay.
export async function getUser(number) {
  if (!kvConfigured()) {
    return { state: "trial", msgCount: 0, paidUntil: 0, refCode: refCodeFor(number), refCount: 0, _ephemeral: true };
  }
  let u = null;
  try { const raw = await kvGet(`wauser:${number}`); if (raw) u = JSON.parse(raw); } catch {}
  let isNew = false;
  if (!u) {
    u = { firstSeen: now(), paidUntil: 0, msgCount: 0 };
    isNew = true;
  }
  // assign/backfill a referral code + reverse lookup
  if (!u.refCode) {
    u.refCode = refCodeFor(number);
    try { await kvSet(`refcode:${u.refCode}`, number, 400 * DAY); } catch {}
    try { await kvSet(`wauser:${number}`, JSON.stringify(u), 400 * DAY); } catch {}
  } else if (isNew) {
    try { await kvSet(`wauser:${number}`, JSON.stringify(u), 400 * DAY); } catch {}
  }
  if (isNew) { try { await kvIncr("stat:newusers"); } catch {} }
  return withState(u);
}

function withState(u) {
  const t = now();
  let state = "expired";
  if (u.paidUntil && u.paidUntil > t) state = "paid";
  else if ((u.msgCount || 0) < FREE_QUESTIONS) state = "trial";
  return { ...u, state };
}

export async function bumpCount(number, u) {
  if (!kvConfigured() || u._ephemeral) return;
  u.msgCount = (u.msgCount || 0) + 1;
  const { state, _ephemeral, ...clean } = u;
  try { await kvSet(`wauser:${number}`, JSON.stringify(clean), 400 * DAY); } catch {}
}

// Mark a number as paid for 30 days (called from the PayFast notification).
export async function markPaid(number, days = PAID_DAYS) {
  if (!kvConfigured()) return;
  let u = {};
  try { const raw = await kvGet(`wauser:${number}`); if (raw) u = JSON.parse(raw); } catch {}
  u.paidUntil = now() + days * DAY;
  if (!u.firstSeen) u.firstSeen = now();
  if (!u.refCode) u.refCode = refCodeFor(number);
  try { await kvSet(`wauser:${number}`, JSON.stringify(u), 400 * DAY); } catch {}
  try { await kvSet(`refcode:${u.refCode}`, number, 400 * DAY); } catch {}
}

// Extend a subscription by N days (used for the referral reward).
async function extendPaid(number, days) {
  let u = {};
  try { const raw = await kvGet(`wauser:${number}`); if (raw) u = JSON.parse(raw); } catch {}
  const base = (u.paidUntil && u.paidUntil > now()) ? u.paidUntil : now();
  u.paidUntil = base + days * DAY;
  try { await kvSet(`wauser:${number}`, JSON.stringify(u), 400 * DAY); } catch {}
}

// A user enters a friend's referral code (during their free questions / before paying).
// Returns a status string: "ok" | "self" | "already" | "unknown".
export async function setReferredBy(number, codeRaw) {
  if (!kvConfigured()) return "unknown";
  const code = String(codeRaw || "").toUpperCase().trim();
  if (code === refCodeFor(number)) return "self";
  const owner = await kvGet(`refcode:${code}`);
  if (!owner) return "unknown";
  let u = {};
  try { const raw = await kvGet(`wauser:${number}`); if (raw) u = JSON.parse(raw); } catch {}
  if (u.refBy) return "already";
  u.refBy = code;
  if (!u.refCode) u.refCode = refCodeFor(number);
  try { await kvSet(`wauser:${number}`, JSON.stringify(u), 400 * DAY); } catch {}
  return "ok";
}

// Called once when a referee first pays. Credits the referrer; grants a free
// month every REF_GOAL paid referrals. Returns null or
// { referrer, count, rewarded }.
export async function creditReferral(refereeNumber) {
  if (!kvConfigured()) return null;
  let ref = {};
  try { const raw = await kvGet(`wauser:${refereeNumber}`); if (raw) ref = JSON.parse(raw); } catch {}
  if (!ref.refBy || ref.refCredited) return null;       // no code, or already counted
  ref.refCredited = true;
  try { await kvSet(`wauser:${refereeNumber}`, JSON.stringify(ref), 400 * DAY); } catch {}

  const referrerNumber = await kvGet(`refcode:${ref.refBy}`);
  if (!referrerNumber || referrerNumber === refereeNumber) return null;

  let rr = {};
  try { const raw = await kvGet(`wauser:${referrerNumber}`); if (raw) rr = JSON.parse(raw); } catch {}
  rr.refCount = (rr.refCount || 0) + 1;
  rr.refRewarded = rr.refRewarded || 0;
  let rewarded = false;
  if (rr.refCount % REF_GOAL === 0 && rr.refCount / REF_GOAL > rr.refRewarded) {
    rr.refRewarded += 1;
    rewarded = true;
  }
  try { await kvSet(`wauser:${referrerNumber}`, JSON.stringify(rr), 400 * DAY); } catch {}
  if (rewarded) await extendPaid(referrerNumber, REF_REWARD_DAYS);
  return { referrer: referrerNumber, count: rr.refCount, rewarded };
}

export function freeLeft(u) {
  return Math.max(0, FREE_QUESTIONS - (u.msgCount || 0));
}

export function daysLeft(u) {
  const t = now();
  return Math.max(0, Math.ceil(((u.paidUntil || 0) - t) / DAY));
}
