// ============================================================
//  Sgela — WhatsApp user status (free questions / paid gating by phone number)
//  Stored in Upstash:  wauser:<number> = { firstSeen, paidUntil, msgCount }
// ============================================================

import { kvConfigured, kvGet, kvSet, kvIncr } from "./_kv.js";

export const FREE_QUESTIONS = 3; // free taste before the paywall
const PAID_DAYS = 30;
const DAY = 86400;

function now() { return Math.floor(Date.now() / 1000); }

// Load (or create) a user record. New numbers get FREE_QUESTIONS free, then pay.
export async function getUser(number) {
  if (!kvConfigured()) {
    // no store -> treat everyone as trial so the bot still works
    return { state: "trial", msgCount: 0, paidUntil: 0, _ephemeral: true };
  }
  let u = null;
  try { const raw = await kvGet(`wauser:${number}`); if (raw) u = JSON.parse(raw); } catch {}
  if (!u) {
    u = { firstSeen: now(), paidUntil: 0, msgCount: 0 };
    try { await kvSet(`wauser:${number}`, JSON.stringify(u), 400 * DAY); } catch {}
    try { await kvIncr("stat:newusers"); } catch {} // funnel: first-time students
  }
  return withState(u);
}

function withState(u) {
  const t = now();
  let state = "expired";
  if (u.paidUntil && u.paidUntil > t) state = "paid";
  else if ((u.msgCount || 0) < FREE_QUESTIONS) state = "trial"; // free questions left
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
  try { await kvSet(`wauser:${number}`, JSON.stringify(u), 400 * DAY); } catch {}
}

// Free questions remaining before this message is counted.
export function freeLeft(u) {
  return Math.max(0, FREE_QUESTIONS - (u.msgCount || 0));
}

// Days left on a paid subscription.
export function daysLeft(u) {
  const t = now();
  return Math.max(0, Math.ceil(((u.paidUntil || 0) - t) / DAY));
}
