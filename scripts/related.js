#!/usr/bin/env node
/*
 * Skylinks Asia: "Related reading" links (v1.0, 2026-11-24).
 * Adds a short list of internal links just above the footer of the pages named in
 * data/related.json. Only the text between <!--RELATED--> and <!--/RELATED--> is
 * touched. Link text is the target page's own <title>. Safe by design: any problem
 * is reported and that page is left alone. It never stops the Netlify deploy.
 *
 *   node scripts/related.js            write the blocks
 *   node scripts/related.js --check    change nothing; report which pages would change
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.resolve(__dirname, '..');

function pageTitle(file) {
  var html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  var m = /<title>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return null;
  var t = m[1].replace(/\s+/g, ' ').trim().split(' | ')[0].trim();
  return t.replace(/&(?!#?\w+;)/g, '&amp;');
}
function rel(from, to) {
  var fromDir = path.posix.dirname(from);
  return fromDir === '.' ? to : path.posix.relative(fromDir, to);
}

function run(opts) {
  opts = opts || {};
  var check = !!opts.check, notes = [], changed = [], done = 0;
  var cfgPath = path.join(ROOT, 'data/related.json');
  if (!fs.existsSync(cfgPath)) return { changed: changed, notes: ['data/related.json not found, nothing to do'] };
  var cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).pages || {};
  Object.keys(cfg).forEach(function (file) {
    try {
      var full = path.join(ROOT, file);
      if (!fs.existsSync(full)) { notes.push(file + ': page not found, skipped'); return; }
      var html = fs.readFileSync(full, 'utf8');
      var clean = html.replace(/\n?[ \t]*<!--RELATED-->[\s\S]*?<!--\/RELATED-->[ \t]*\n?/g, '\n');
      var at = clean.indexOf('<footer');
      if (at < 0) { notes.push(file + ': no footer found, skipped'); return; }
      var items = [];
      (cfg[file].links || []).forEach(function (target) {
        if (target === file) return;
        if (!fs.existsSync(path.join(ROOT, target))) { notes.push(file + ': link target ' + target + ' not found, left out'); return; }
        var t = pageTitle(target);
        if (!t) { notes.push(file + ': no title on ' + target + ', left out'); return; }
        items.push('        <li><a href="' + rel(file, target) + '" class="text-teal-500 hover:underline">' + t + '</a></li>');
      });
      if (!items.length) { notes.push(file + ': no valid links, skipped'); return; }
      var heading = cfg[file].heading || 'Related reading';
      var block = '<!--RELATED-->\n' +
        '  <section class="bg-navy-900 border-t border-navy-800 py-10" data-skylinks-related>\n' +
        '    <div class="max-w-5xl mx-auto px-6">\n' +
        '      <h2 class="text-lg text-white font-display font-bold mb-4">' + heading + '</h2>\n' +
        '      <ul class="grid gap-3 md:grid-cols-2">\n' + items.join('\n') + '\n      </ul>\n' +
        '    </div>\n  </section>\n  <!--/RELATED-->\n\n  ';
      var lineStart = clean.lastIndexOf('\n', at) + 1;
      var out = clean.slice(0, lineStart) + '  ' + block.replace(/\n\n  $/, '\n') + clean.slice(lineStart);
      done++;
      if (out !== html) { changed.push(file); if (!check) fs.writeFileSync(full, out); }
    } catch (e) { notes.push(file + ': ' + e.message + ', skipped'); }
  });
  notes.unshift('Related links: ' + done + ' page(s) processed, ' + changed.length + ' ' + (check ? 'would change' : 'updated'));
  return { changed: changed, notes: notes };
}
module.exports = { run: run };
if (require.main === module) {
  var r = run({ check: process.argv.indexOf('--check') > -1 });
  r.notes.forEach(function (n) { console.log(n); });
}
