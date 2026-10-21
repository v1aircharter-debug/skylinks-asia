#!/usr/bin/env node
/* ============================================================
   SKYLINKS ASIA — EMPTY LEGS JSON AUDIT TOOL
   Version: 1.0 | Created: 2026-10-18
   
   READ-ONLY. This script NEVER modifies data/flights.json.
   
   Purpose
   -------
   Read data/flights.json and print a full audit report in CMD:
     - Summary (totals, date range, seat estimate split)
     - Rule L6 filter violations (TLV, same-city, operator, reg)
     - Field completeness (origin/dest/date/aircraft/seats)
     - Cross-validation against data/airports.json + data/aircraft.json
     - Origin / destination / route / aircraft breakdowns
     - Warnings (past-dated flights, duplicates)
   
   Usage
   -----
     node audit.js
     node audit.js path\to\flights.json
   
   Exit codes
   ----------
     0 = PASS  (no violations, no warnings)
     1 = FAIL  (filter violations OR missing required fields)
     2 = WARN  (warnings present but no violations)
     3 = ERROR (file not found / JSON parse error / bad shape)
   ============================================================ */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---- Paths ----
const SITE_ROOT     = __dirname;
const DATA_DIR      = path.join(SITE_ROOT, 'data');
const FLIGHTS_FILE  = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(DATA_DIR, 'flights.json');
const AIRPORTS_FILE = path.join(DATA_DIR, 'airports.json');
const AIRCRAFT_FILE = path.join(DATA_DIR, 'aircraft.json');

// ---- ANSI color (safe fallback if NO_COLOR or dumb TERM) ----
const useColor = !process.env.NO_COLOR && process.env.TERM !== 'dumb';
const C = useColor
  ? { reset:'\x1b[0m', red:'\x1b[31m', green:'\x1b[32m',
      yellow:'\x1b[33m', cyan:'\x1b[36m', gray:'\x1b[90m', bold:'\x1b[1m' }
  : { reset:'', red:'', green:'', yellow:'', cyan:'', gray:'', bold:'' };

// ---- Console helpers ----
const hr    = (ch) => console.log((ch || '=').repeat(62));
const title = (t) => { hr('='); console.log(C.bold + t + C.reset); hr('='); };
const sec   = (t) => { console.log(''); console.log(C.cyan + t + C.reset); hr('-'); };
const ok    = (t) => console.log(`  ${C.green}[OK]${C.reset} ${t}`);
const warn  = (t) => console.log(`  ${C.yellow}[!!]${C.reset} ${t}`);
const fail  = (t) => console.log(`  ${C.red}[XX]${C.reset} ${t}`);
const info  = (t) => console.log(`       ${C.gray}${t}${C.reset}`);
const kv    = (k,v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

// ---- Field aliases (handles schema variations) ----
const F_ORIGIN    = ['origin','from','departure','dep_icao','dep_iata','origin_code'];
const F_DEST      = ['destination','to','arrival','arr_icao','arr_iata','dest_code'];
const F_DATE      = ['date','departure_date','dep_date','flight_date','departureDate'];
const F_AIRCRAFT  = ['aircraft','aircraft_type','type','ac_type','ac'];
const F_SEATS     = ['seats','capacity','pax','seat_count'];
const F_SEATS_EST = ['seats_est','estimated','seatsEstimated'];

function getField(obj, aliases) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of aliases) if (obj[k] != null && obj[k] !== '') return obj[k];
  return null;
}

function readJSON(file, label) {
  if (!fs.existsSync(file)) return { _missing: true, _label: label, _file: file };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`${C.red}ERROR: Cannot parse ${label}${C.reset}`);
    console.error(`       File: ${file}`);
    console.error(`       ${e.message}`);
    process.exit(3);
  }
}

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.flights)) return data.flights;
  if (data && Array.isArray(data.items))   return data.items;
  if (data && Array.isArray(data.data))    return data.data;
  if (data && typeof data === 'object') {
    // Fallback: object keyed by hubs, each value is an array
    const vals = Object.values(data);
    if (vals.length > 0 && vals.every(Array.isArray)) return vals.flat();
  }
  return null;
}

// Turn airports/aircraft JSON into a Set of uppercase codes/types
function toCodeSet(data) {
  if (!data || data._missing) return null;
  if (Array.isArray(data)) {
    return new Set(
      data.map(x => x && (x.icao || x.iata || x.code || x.type || x.name))
          .filter(Boolean)
          .map(x => String(x).toUpperCase())
    );
  }
  if (typeof data === 'object') {
    return new Set(Object.keys(data).map(k => String(k).toUpperCase()));
  }
  return null;
}

function bar(n, max, width) {
  width = width || 20;
  if (!max || max <= 0) return '';
  const filled = Math.max(1, Math.round((n / max) * width));
  return '#'.repeat(filled).padEnd(width, '.');
}

// ---- Today (local) ----
const _d = new Date();
const TODAY = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
const STAMP = _d.toLocaleString('sv-SE'); // YYYY-MM-DD HH:MM:SS

// ============================================================
// 1. LOAD
// ============================================================
console.log('');
title('SKYLINKS ASIA — EMPTY LEGS JSON AUDIT v1.0');
kv('Flights file:', FLIGHTS_FILE);
kv('Run at:',       STAMP);
kv('Site root:',    SITE_ROOT);

const raw = readJSON(FLIGHTS_FILE, 'flights.json');
if (raw._missing) {
  console.error(`\n${C.red}ERROR: flights.json not found.${C.reset}`);
  console.error(`       Expected: ${FLIGHTS_FILE}`);
  console.error(`       Run from site root, or pass a file path: node audit.js data\\flights.json`);
  process.exit(3);
}

const flights = asArray(raw);
if (!flights) {
  console.error(`\n${C.red}ERROR: flights.json has an unexpected shape.${C.reset}`);
  console.error(`       Expected one of:`);
  console.error(`         [ {...}, {...} ]`);
  console.error(`         { "flights": [ ... ] }`);
  console.error(`         { "items":   [ ... ] }`);
  console.error(`         { "data":    [ ... ] }`);
  process.exit(3);
}

const airportsData = readJSON(AIRPORTS_FILE, 'airports.json');
const aircraftData = readJSON(AIRCRAFT_FILE, 'aircraft.json');
const validAirports = toCodeSet(airportsData);
const validAircraft = toCodeSet(aircraftData);

// ============================================================
// 2. VALIDATE
// ============================================================
const issues = {
  tlv: [], sameCity: [], hasOperator: [], hasReg: [],
  missOrigin: [], missDest: [], missDate: [], missAircraft: [], missSeats: [],
  badOrigin: [], badDest: [], badAircraft: [],
  pastDate: [], dupes: [], seatsEstNoValue: []
};

const origins = {}, dests = {}, routes = {}, acTypes = {};
let seatActual = 0, seatEstimates = 0;
let dateMin = null, dateMax = null;
const seen = new Map();

flights.forEach((f, i) => {
  const idx = i + 1;
  const o   = getField(f, F_ORIGIN);
  const d   = getField(f, F_DEST);
  const dt  = getField(f, F_DATE);
  const ac  = getField(f, F_AIRCRAFT);
  const st  = getField(f, F_SEATS);
  const est = getField(f, F_SEATS_EST);

  const O = String(o || '').toUpperCase();
  const D = String(d || '').toUpperCase();
  const A = String(ac || '').toUpperCase();

  // Origin
  if (!o) issues.missOrigin.push(idx);
  else {
    origins[O] = (origins[O] || 0) + 1;
    if (O === 'TLV') issues.tlv.push(idx);
    if (validAirports && !validAirports.has(O)) issues.badOrigin.push({ i: idx, v: O });
  }
  // Destination
  if (!d) issues.missDest.push(idx);
  else {
    dests[D] = (dests[D] || 0) + 1;
    if (D === 'TLV') issues.tlv.push(idx);
    if (validAirports && !validAirports.has(D)) issues.badDest.push({ i: idx, v: D });
  }
  // Same-city
  if (o && d && O === D) issues.sameCity.push(idx);
  // Route
  if (o && d) { const r = `${O}->${D}`; routes[r] = (routes[r] || 0) + 1; }
  // Date
  if (!dt) issues.missDate.push(idx);
  else {
    const ds = String(dt).slice(0, 10);
    if (!dateMin || ds < dateMin) dateMin = ds;
    if (!dateMax || ds > dateMax) dateMax = ds;
    if (ds < TODAY) issues.pastDate.push({ i: idx, d: ds });
  }
  // Aircraft
  if (!ac) issues.missAircraft.push(idx);
  else {
    acTypes[A] = (acTypes[A] || 0) + 1;
    if (validAircraft && !validAircraft.has(A)) issues.badAircraft.push({ i: idx, v: A });
  }
  // Seats
  const estOn = (est === true || est === 'true' || est === 1);
  if (st == null && !estOn) issues.missSeats.push(idx);
  else if (estOn && st == null) issues.seatsEstNoValue.push(idx);
  else if (estOn) seatEstimates++;
  else if (st != null) seatActual++;
  // Operator / Registration (must be stripped per Rule L6)
  const keys = Object.keys(f || {}).map(k => k.toLowerCase());
  if (keys.some(k => ['operator','operator_name','operatorname','operators'].includes(k)))
    issues.hasOperator.push(idx);
  if (keys.some(k => ['registration','reg','tail','tail_number','tailnumber'].includes(k)))
    issues.hasReg.push(idx);
  // Duplicate detection
  const key = `${O}|${D}|${String(dt).slice(0, 10)}|${A}`;
  if (seen.has(key)) issues.dupes.push({ a: seen.get(key), b: idx, key });
  else seen.set(key, idx);
});

// ============================================================
// 3. REPORT
// ============================================================
sec('SUMMARY');
kv('Total flights:',             flights.length);
kv('Unique origins:',            Object.keys(origins).length);
kv('Unique destinations:',       Object.keys(dests).length);
kv('Unique routes (O->D):',      Object.keys(routes).length);
kv('Unique aircraft types:',     Object.keys(acTypes).length);
kv('Date range:',                (dateMin && dateMax) ? `${dateMin}  ->  ${dateMax}` : '(none)');
kv('Seats: actual / estimated:', `${seatActual} / ${seatEstimates}`);

// ---- Filter violations ----
sec('RULE L6 FILTER VIOLATIONS   (must be 0)');
const vChecks = [
  ['Tel Aviv (TLV) flights:',     issues.tlv],
  ['Same-city flights:',          issues.sameCity],
  ['Operator field present:',     issues.hasOperator],
  ['Registration field present:', issues.hasReg]
];
vChecks.forEach(([label, arr]) => {
  if (arr.length === 0) ok(`${label} 0`);
  else {
    fail(`${label} ${arr.length}`);
    arr.slice(0, 5).forEach(i => info(`flight #${i}`));
    if (arr.length > 5) info(`...and ${arr.length - 5} more`);
  }
});

// ---- Field completeness ----
sec('FIELD COMPLETENESS');
const fChecks = [
  ['Missing origin:',      issues.missOrigin],
  ['Missing destination:', issues.missDest],
  ['Missing date:',        issues.missDate],
  ['Missing aircraft:',    issues.missAircraft],
  ['Missing seats:',       issues.missSeats]
];
fChecks.forEach(([label, arr]) => {
  if (arr.length === 0) ok(`${label} 0`);
  else {
    fail(`${label} ${arr.length}`);
    arr.slice(0, 5).forEach(i => info(`flight #${i}`));
    if (arr.length > 5) info(`...and ${arr.length - 5} more`);
  }
});

// ---- Cross-validation ----
if (validAirports) {
  sec('AIRPORT VALIDATION   (against data/airports.json)');
  if (!issues.badOrigin.length) ok('All origins recognised');
  else {
    fail(`Unknown origins: ${issues.badOrigin.length}`);
    issues.badOrigin.slice(0, 10).forEach(x => warn(`Flight #${x.i}: unknown origin "${x.v}"`));
    if (issues.badOrigin.length > 10) info(`...and ${issues.badOrigin.length - 10} more`);
  }
  if (!issues.badDest.length) ok('All destinations recognised');
  else {
    fail(`Unknown destinations: ${issues.badDest.length}`);
    issues.badDest.slice(0, 10).forEach(x => warn(`Flight #${x.i}: unknown destination "${x.v}"`));
    if (issues.badDest.length > 10) info(`...and ${issues.badDest.length - 10} more`);
  }
} else {
  sec('AIRPORT VALIDATION');
  warn('data/airports.json not found — skipping airport code validation');
}

if (validAircraft) {
  sec('AIRCRAFT VALIDATION   (against data/aircraft.json)');
  if (!issues.badAircraft.length) ok('All aircraft types recognised');
  else {
    fail(`Unknown aircraft types: ${issues.badAircraft.length}`);
    issues.badAircraft.slice(0, 10).forEach(x => warn(`Flight #${x.i}: unknown aircraft "${x.v}"`));
    if (issues.badAircraft.length > 10) info(`...and ${issues.badAircraft.length - 10} more`);
  }
} else {
  sec('AIRCRAFT VALIDATION');
  warn('data/aircraft.json not found — skipping aircraft validation');
}

// ---- Breakdowns ----
function breakdown(t, obj, limit) {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return;
  sec(t);
  const max = entries[0][1];
  entries.slice(0, limit).forEach(([k, n]) => {
    console.log(`  ${String(k).padEnd(10)} ${String(n).padStart(4)}  ${bar(n, max)}`);
  });
  if (entries.length > limit) info(`(${entries.length - limit} more...)`);
}
breakdown('ORIGIN BREAKDOWN',      origins, 15);
breakdown('DESTINATION BREAKDOWN', dests,   15);
breakdown('ROUTE BREAKDOWN',       routes,  20);
breakdown('AIRCRAFT BREAKDOWN',    acTypes, 15);

// ---- Warnings ----
sec('WARNINGS');
let warnCount = 0;
if (issues.pastDate.length) {
  warnCount += issues.pastDate.length;
  warn(`${issues.pastDate.length} flight(s) with date in the past (today = ${TODAY}):`);
  issues.pastDate.slice(0, 10).forEach(x => info(`Flight #${x.i}: ${x.d}`));
  if (issues.pastDate.length > 10) info(`...and ${issues.pastDate.length - 10} more`);
}
if (issues.dupes.length) {
  warnCount += issues.dupes.length;
  warn(`${issues.dupes.length} duplicate flight(s) (same O-D-date-aircraft):`);
  issues.dupes.slice(0, 10).forEach(x => info(`Flight #${x.a} == #${x.b}  [${x.key}]`));
  if (issues.dupes.length > 10) info(`...and ${issues.dupes.length - 10} more`);
}
if (issues.seatsEstNoValue.length) {
  warnCount += issues.seatsEstNoValue.length;
  warn(`${issues.seatsEstNoValue.length} flight(s) with seats_est=true but no seats value:`);
  issues.seatsEstNoValue.slice(0, 10).forEach(i => info(`flight #${i}`));
}
if (warnCount === 0) ok('No warnings — data is clean.');

// ============================================================
// 4. EXIT CODE
// ============================================================
const failCount =
  [...vChecks, ...fChecks].reduce((s, [, arr]) => s + arr.length, 0) +
  issues.badOrigin.length +
  issues.badDest.length +
  issues.badAircraft.length;

console.log('');
hr('=');
if (failCount > 0) {
  console.log(`${C.red}${C.bold}AUDIT RESULT: FAIL${C.reset} — ${failCount} violation(s) / missing field(s).`);
  console.log(`Fix data/flights.json before pushing. Netlify rebuild will use this file.`);
  hr('=');
  process.exit(1);
} else if (warnCount > 0) {
  console.log(`${C.yellow}${C.bold}AUDIT RESULT: WARN${C.reset} — 0 violations, ${warnCount} warning(s). Review above.`);
  hr('=');
  process.exit(2);
} else {
  console.log(`${C.green}${C.bold}AUDIT RESULT: PASS${C.reset} — 0 violations, 0 warnings. Safe to push.`);
  hr('=');
  process.exit(0);
}