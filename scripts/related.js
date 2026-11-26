#!/usr/bin/env node
/*
 * Skylinks Asia: "Related reading" links (v1.2, 2026-11-26; v1.1 2026-11-25; v1.0 2026-11-24).
 * v1.2: when a page already has its own related-articles card section, the links are added
 *       to that section as cards in the page's own card style (one section, one layout).
 *       Pages without such a section keep the plain list above the footer.
 * v1.1: links the page body already carries are left out; no block when none remain.
 * Only the text between <!--RELATED--> and <!--/RELATED--> is touched. Safe by design:
 * any problem is reported and that page is left alone. It never stops the Netlify deploy.
 *
 *   node scripts/related.js            write the blocks
 *   node scripts/related.js --check    change nothing; report which pages would change
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.resolve(__dirname, '..');
var HEADINGS = /<h[234]\b[^>]*>\s*(Similar Aviation Insights|Related Reading|Related Aviation Insights|Related Articles|Continue Reading|Continue Learning|Continue Exploring)\s*<\/h[234]>/gi;

function esc(t) { return t.replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function info(file) {
  var html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  var m = /<title>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return null;
  var title = m[1].replace(/\s+/g, ' ').trim().split(' | ')[0].trim().replace(/&(?!#?\w+;)/g, '&amp;');
  var d = (/<meta name="description" content="([^"]*)"/i.exec(html) || [, ''])[1];
  var s = d.split(/(?<=\.)\s/)[0];
  if (s.length > 140) s = s.slice(0, 137).replace(/\s+\S*$/, '') + '&hellip;';
  var img = (/<meta property="og:image" content="https:\/\/www\.skylinks\.asia\/([^"]+)"/i.exec(html) || [, ''])[1];
  if (img && !fs.existsSync(path.join(ROOT, img))) img = '';
  return { title: title, desc: s.replace(/&(?!#?\w+;)/g, '&amp;'), img: img };
}
function rel(from, to) {
  var fromDir = path.posix.dirname(from);
  return fromDir === '.' ? to : path.posix.relative(fromDir, to);
}
function label(target) {
  if (/^private-jets\/|private-jet|jet-charter|business-aviation/.test(target)) return 'Private Jets';
  if (/empty-leg/.test(target)) return 'Empty Legs';
  if (/acmi/.test(target)) return 'ACMI';
  if (/dangerous|dgr|lithium/.test(target)) return 'Dangerous Goods';
  if (/cargo|freighter|a321p2f|perishable|pharma|live-animal|oil-gas|mining/.test(target)) return 'Cargo';
  return 'Insights';
}
// Find the page's own related-articles grid: returns { at: index of the grid's closing tag, card: first card html }
function findGrid(html, from, to) {
  var body = html.slice(from, to), m, last = null;
  HEADINGS.lastIndex = 0;
  while ((m = HEADINGS.exec(body))) last = m;
  if (!last) return null;
  var g = /<div class="[^"]*\bgrid\b[^"]*"[^>]*>/g;
  g.lastIndex = last.index + last[0].length;
  var gm = g.exec(body);
  if (!gm) return null;
  var re = /<(\/?)div\b[^>]*>/g, depth = 1, x;
  re.lastIndex = gm.index + gm[0].length;
  while ((x = re.exec(body))) { depth += x[1] ? -1 : 1; if (depth === 0) break; }
  if (!x) return null;
  var inner = body.slice(gm.index + gm[0].length, x.index);
  var c = /<a\b[^>]*>[\s\S]*?<\/a>/.exec(inner.replace(/<!--RELATED-->[\s\S]*?<!--\/RELATED-->/g, ''));
  if (!c || /<a\b/.test(c[0].slice(2))) return null;
  var indent = (/\n([ \t]*)<a\b/.exec(inner) || [, '          '])[1];
  return { at: from + x.index, card: c[0], indent: indent };
}
function makeCard(tpl, href, t, tag, isPost) {
  var c = tpl;
  if (!isPost) c = c.replace(/>(\s*)Read (Article|More|Guide|Full Article)(\s*)</g, '>$1Learn More$3<');
  c = c.replace(/href="[^"]*"/g, 'href="' + href + '"');
  c = c.replace(/aria-label="[^"]*"/g, 'aria-label="Read article: ' + t.title + '"');
  if (/<img\b/.test(c)) {
    if (!t.img) return null;
    c = c.replace(/(<img\b[^>]*?\bsrc=")[^"]*"/, '$1' + t.img.__rel + '"').replace(/(<img\b[^>]*?\balt=")[^"]*"/, '$1' + esc(t.title.replace(/&amp;/g, '&')) + '"');
  }
  var h = /<(h[2-6])\b([^>]*)>[\s\S]*?<\/\1>/.exec(c);
  if (!h) return null;
  var hAt = h.index;
  c = c.slice(0, hAt) + '<' + h[1] + h[2] + '>' + t.title + '</' + h[1] + '>' + c.slice(hAt + h[0].length);
  // tag labels before the heading (short plain spans, no icon) take the target's section name
  var pre = c.slice(0, hAt).replace(/(<span\b[^>]*>)([^<]{1,30})(<\/span>)/g, function (all, a, txt, b) {
    return /read|learn|view|explore|more|guide/i.test(txt) && !/^\s*guide\s*$/i.test(txt) ? all : a + tag + b;
  });
  c = pre + c.slice(hAt);
  var after = c.slice(c.indexOf('</' + h[1] + '>'));
  var p = /<p\b([^>]*)>[\s\S]*?<\/p>/.exec(after);
  if (p) {
    var pAt = c.indexOf('</' + h[1] + '>') + p.index;
    c = c.slice(0, pAt) + '<p' + p[1] + '>' + t.desc + '</p>' + c.slice(pAt + p[0].length);
  }
  // remove dates and read times copied from the template card
  c = c.replace(/(<span\b[^>]*>)\s*(<iconify-icon[^>]*(calendar|clock)[^>]*><\/iconify-icon>)?\s*[A-Z][a-z]{2} \d{1,2},? \d{4}\s*(<\/span>)/g, '');
  c = c.replace(/(<span\b[^>]*>)\s*(<iconify-icon[^>]*clock[^>]*><\/iconify-icon>)?\s*\d+ min read\s*(<\/span>)/g, '');
  return c;
}

var POSTS = {};
function loadPosts() {
  ['blog.html', 'blog-2.html'].forEach(function (b) {
    var f = path.join(ROOT, b); if (!fs.existsSync(f)) return;
    var h = fs.readFileSync(f, 'utf8'), g = h.indexOf('<div class="grid'), e = h.indexOf('<footer');
    h.slice(g > -1 ? g : 0, e > -1 ? e : h.length).replace(/href="([^"#?:\/]+\.html)"/g, function (m, x) { if (!/^blog/.test(x)) POSTS[x] = 1; });
  });
}
function run(opts) {
  opts = opts || {};
  loadPosts();
  var check = !!opts.check, notes = [], changed = [], done = 0, asCards = 0;
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
      var bodyStart = clean.indexOf('</header>'), present = {};
      clean.slice(bodyStart > -1 ? bodyStart : 0, at).replace(/href="([^"#?:]+\.html)/g, function (m, h) {
        present[path.posix.normalize(path.posix.join(path.posix.dirname(file), h))] = 1;
      });
      var targets = [], skipped = 0;
      (cfg[file].links || []).forEach(function (target) {
        if (target === file) return;
        if (present[target]) { skipped++; return; }
        if (!fs.existsSync(path.join(ROOT, target))) { notes.push(file + ': link target ' + target + ' not found, left out'); return; }
        var t = info(target);
        if (!t) { notes.push(file + ': no title on ' + target + ', left out'); return; }
        if (t.img) t.img = { __rel: rel(file, t.img) };
        targets.push({ target: target, t: t });
      });
      if (!targets.length) {
        done++;
        if (clean !== html) { changed.push(file); if (!check) fs.writeFileSync(full, clean); }
        notes.push(file + ': ' + (skipped ? 'every related link is already on the page, no block' : 'no valid links, skipped'));
        return;
      }
      var out = null, grid = findGrid(clean, bodyStart > -1 ? bodyStart : 0, at);
      if (grid) {
        var cards = [];
        targets.forEach(function (o) {
          var c = makeCard(grid.card, rel(file, o.target), o.t, label(o.target), !!POSTS[o.target]);
          if (c) cards.push(grid.indent + c);
        });
        if (cards.length === targets.length) {
          var lineStart = clean.lastIndexOf('\n', grid.at) + 1;
          var block = grid.indent + '<!--RELATED-->\n' + cards.join('\n\n') + '\n' + grid.indent + '<!--/RELATED-->\n';
          out = clean.slice(0, lineStart) + block + clean.slice(lineStart);
          asCards++;
        } else notes.push(file + ': card style not usable, plain list used');
      }
      if (!out) {
        var items = targets.map(function (o) { return '        <li><a href="' + rel(file, o.target) + '" class="text-teal-500 hover:underline">' + o.t.title + '</a></li>'; });
        var heading = cfg[file].heading || 'Related reading';
        var blk = '<!--RELATED-->\n' +
          '  <section class="bg-navy-900 border-t border-navy-800 py-10" data-skylinks-related>\n' +
          '    <div class="max-w-5xl mx-auto px-6">\n' +
          '      <h2 class="text-lg text-white font-display font-bold mb-4">' + heading + '</h2>\n' +
          '      <ul class="grid gap-3 md:grid-cols-2">\n' + items.join('\n') + '\n      </ul>\n' +
          '    </div>\n  </section>\n  <!--/RELATED-->\n';
        var ls = clean.lastIndexOf('\n', at) + 1;
        out = clean.slice(0, ls) + '  ' + blk + clean.slice(ls);
      }
      done++;
      if (out !== html) { changed.push(file); if (!check) fs.writeFileSync(full, out); }
    } catch (e) { notes.push(file + ': ' + e.message + ', skipped'); }
  });
  notes.unshift('Related links: ' + done + ' page(s) processed (' + asCards + ' as cards), ' + changed.length + ' ' + (check ? 'would change' : 'updated'));
  return { changed: changed, notes: notes };
}
module.exports = { run: run };
if (require.main === module) {
  var r = run({ check: process.argv.indexOf('--check') > -1 });
  r.notes.forEach(function (n) { console.log(n); });
}
