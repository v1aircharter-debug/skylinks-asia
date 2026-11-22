#!/usr/bin/env node
/*
 * Skylinks Asia: rebuild every flight block from data/flights.json.
 *
 *   node scripts/build.js                 rebuild all pages in place
 *   node scripts/build.js --check         change nothing; exit 1 if any page is out of date
 *   node scripts/build.js --today=2026-10-20   pretend today is another date (testing)
 *
 * Only the text between <!--FLIGHTS:x--> and <!--/FLIGHTS:x--> markers, the
 * <!--UPDATED--> date, and a flight ItemList in structured data are touched.
 * Everything else on every page is left byte-for-byte as it was.
 * If anything is wrong, nothing is written and the script exits 1,
 * which makes the Netlify deploy fail and keeps the previous site live.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var Core = require('./core.js');

var ROOT = path.resolve(__dirname, '..');
var args = process.argv.slice(2);
function flag(name) {
  var hit = args.filter(function (a) { return a === '--' + name || a.indexOf('--' + name + '=') === 0; })[0];
  if (!hit) return null;
  return hit.indexOf('=') > -1 ? hit.split('=')[1] : true;
}
var CHECK = !!flag('check');
var TODAY = flag('today') || Core.todayIso();

function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function fail(msgs) {
  console.error('\nBuild stopped. Nothing was changed.\n');
  msgs.forEach(function (m) { console.error('  - ' + m); });
  console.error('');
  process.exit(1);
}

var airports = readJson('data/airports.json');
var data = readJson('data/flights.json');
var pagesCfg = readJson('data/pages.json').pages;
var flights = data.flights || [];
// Ids are internal. Entries added by hand in the editor have none, so number them in file order.
flights.forEach(function (f, i) { f.id = i + 1; });
var geo = fs.existsSync(path.join(ROOT, 'data/cities.json')) ? readJson('data/cities.json').cities : {};
var aircraftTable = fs.existsSync(path.join(ROOT, 'data/aircraft.json')) ? readJson('data/aircraft.json') : {};
var core = Core.create(airports, { geo: geo, aircraft: aircraftTable });

var problems = core.validate(flights);
if (problems.length) fail(problems);

function indentOf(text, pos) {
  var ls = text.lastIndexOf('\n', pos - 1) + 1;
  var lead = text.slice(ls, pos);
  return /^\s*$/.test(lead) ? lead : '';
}
function dedent(block) {
  var lines = block.replace(/^\n+|\s+$/g, '').split('\n');
  var min = Infinity;
  lines.forEach(function (l) { if (l.trim()) min = Math.min(min, l.match(/^\s*/)[0].length); });
  if (!isFinite(min)) min = 0;
  return lines.map(function (l) { return l.slice(min); });
}

var errors = [];
var outputs = {};
var summary = [];
var updatedParts = Core.parseIso(data.updated || TODAY);
// Short form, e.g. "22 Nov 2026" (Boss request 2026-11-22).
var updatedText = updatedParts ? updatedParts.d + ' ' + Core.MON[updatedParts.m - 1] + ' ' + updatedParts.y : (data.updated || TODAY);

Object.keys(pagesCfg).forEach(function (file) {
  var cfg = pagesCfg[file];
  var full = path.join(ROOT, file);
  if (!fs.existsSync(full)) { errors.push(file + ': page file not found.'); return; }
  var html = fs.readFileSync(full, 'utf8');
  var counts = [];

  (cfg.slots || []).forEach(function (slot) {
    var open = '<!--FLIGHTS:' + slot.id + '-->';
    var close = '<!--/FLIGHTS:' + slot.id + '-->';
    var a = html.indexOf(open);
    var b = html.indexOf(close);
    if (a < 0 || b < a) { errors.push(file + ': markers for "' + slot.id + '" are missing or out of order.'); return; }
    var pad = indentOf(html, a);
    var list = core.slotFlights(slot, flights, TODAY);
    // Main page option (Boss request 2026-11-22): "show_unlisted" adds every live flight that has no
    // landing page of its own, on top of the normal limit, so such routes are never held back.
    if (slot.show_unlisted) {
      var everyLive = core.slotFlights({ rules: slot.rules }, flights, TODAY);
      var hasOwnPage = function (f) {
        return Object.keys(pagesCfg).some(function (other) {
          return other !== file && (pagesCfg[other].slots || []).some(function (s2) { return core.matches(s2, f); });
        });
      };
      var extra = everyLive.filter(function (f) { return !hasOwnPage(f); });
      var seenId = {};
      extra.forEach(function (f) { seenId[f.id] = true; });
      list = list.filter(function (f) { return !seenId[f.id]; }).concat(extra);
      list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
    }
    counts.push(slot.id + '=' + list.length);

    var body;
    if (list.length) {
      body = core.gridHtml(list, cfg.style, pad).replace(/fade-in/g, '');
    } else {
      var after = html.slice(b + close.length);
      var m = /^\s*<!--FLIGHTS-EMPTY:([\w-]+)\n([\s\S]*?)\n\s*-->/.exec(after);
      if (m && m[1] === slot.id) {
        body = dedent(m[2]).map(function (l) { return l ? pad + l : l; }).join('\n');
      } else {
        body = core.defaultEmptyHtml(cfg.style, pad);
      }
    }
    html = html.slice(0, a) + open + '\n' + body + '\n' + pad + close + html.slice(b + close.length);
  });

  // Every empty-legs page shows "Updated on 22 Nov 2026" in the text just above the flight cards
  // (Boss request 2026-11-22). Pages that already have such a line keep it; others get one.
  html = html.replace(/Updated (?:on )?<!--UPDATED-->/g, 'Updated on <!--UPDATED-->');
  var firstOpen = html.indexOf('<!--FLIGHTS:' + (cfg.slots[0] || {}).id + '-->');
  if (firstOpen > -1 && html.indexOf('data-skylinks-updated-top') === -1) {
    var secAt = html.lastIndexOf('<section', firstOpen);
    var region = secAt > -1 ? html.slice(secAt, firstOpen) : '';
    if (region && region.indexOf('<!--UPDATED-->') === -1) {
      var h2At = region.indexOf('<h2');
      var endDiv = h2At > -1 ? region.indexOf('</div>', h2At) : -1;
      if (endDiv > -1) {
        var at = secAt + endDiv, ind = indentOf(html, at);
        var line = ind + '  <p class="text-xs text-gray-500 mt-4" data-skylinks-updated-top>Updated on <!--UPDATED-->x<!--/UPDATED--> &middot; Subject to prior sale</p>\n';
        var ls = html.lastIndexOf('\n', at) + 1;
        html = html.slice(0, ls) + line + html.slice(ls);
      }
    }
  }

  // "Updated 4 October 2026" lines
  html = html.replace(/<!--UPDATED-->[^<]*<!--\/UPDATED-->/g, '<!--UPDATED-->' + updatedText + '<!--/UPDATED-->');

  // Disclaimer text beside the updated label (Boss request 2026-11-09).
  // Inserted once per page — idempotent via data attribute marker.
  var DISCLAIMER_MARKER = 'data-skylinks-flight-disclaimer';
  if (html.indexOf('<!--UPDATED-->') > -1 && html.indexOf(DISCLAIMER_MARKER) === -1) {
    var disclaimerSpan = '<span class="block text-xs text-gray-500 italic mt-2" ' + DISCLAIMER_MARKER + '>Availability and pricing remain subject to operator confirmation and final aircraft positioning.</span>';
    html = html.replace(/(<!--UPDATED-->[^<]*<!--\/UPDATED-->)/, '$1' + disclaimerSpan);
  }

  // Structured data list of flights (Asia and Middle East pages).
  // Only the itemListElement array of that one list is replaced; the rest of the block is untouched.
  if (cfg.itemlist) {
    var done = false;
    var k = html.indexOf('"name": ' + JSON.stringify(cfg.itemlist.name));
    var ak = k > -1 ? html.indexOf('"itemListElement"', k) : -1;
    var br = ak > -1 ? html.indexOf('[', ak) : -1;
    if (br > -1) {
      var depth = 0, inStr = false, i = br;
      for (; i < html.length; i++) {
        var ch = html[i];
        if (inStr) { if (ch === '\\') i++; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '[') depth++;
        else if (ch === ']') { depth--; if (depth === 0) break; }
      }
      var oldArr = html.slice(br + 1, i);
      var itemIndent = (/\n([ \t]*)\{/.exec(oldArr) || [, '          '])[1];
      var closeIndent = (/\n([ \t]*)$/.exec(oldArr) || [, '        '])[1];
      var top = core.slotFlights(cfg.slots[0], flights, TODAY).slice(0, cfg.itemlist.count || 5);
      var items = top.map(function (f, n) {
        return itemIndent + '{ "@type": "ListItem", "position": ' + (n + 1) + ', "name": ' + JSON.stringify(core.listName(f)) + ' }';
      });
      html = html.slice(0, br + 1) + (items.length ? '\n' + items.join(',\n') + '\n' + closeIndent : '') + html.slice(i);
      done = true;
    }
    if (!done) errors.push(file + ': structured data list "' + cfg.itemlist.name + '" not found.');
  }

  outputs[file] = html;
  summary.push([file, counts.join('  ')]);
});

if (errors.length) fail(errors);

var changed = [];
Object.keys(outputs).forEach(function (file) {
  var full = path.join(ROOT, file);
  var before = fs.readFileSync(full, 'utf8');
  if (before !== outputs[file]) {
    changed.push(file);
    if (!CHECK) fs.writeFileSync(full, outputs[file]);
  }
});

console.log('Flights in data: ' + flights.length + '   Today: ' + TODAY + '   Pages: ' + summary.length);
summary.forEach(function (s) { console.log('  ' + (s[0] + '                                    ').slice(0, 38) + s[1]); });
console.log(changed.length
  ? (CHECK ? 'Out of date: ' : 'Rebuilt: ') + changed.length + ' page(s)'
  : 'All pages already match the data.');
if (CHECK && changed.length) process.exit(1);