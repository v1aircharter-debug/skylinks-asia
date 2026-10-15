/*
 * Skylinks Asia: shared flight logic.
 * Used by scripts/build.js (Netlify build) and admin/intake.html (browser),
 * so the page rebuild and the staging preview always agree.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SkylinksCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var COUNTRY_SHORT = { 'United Kingdom': 'UK', 'United States': 'USA' };
  var SYMBOL = { USD: '$', EUR: '€', GBP: '£', CNY: '¥', JPY: '¥', INR: '₹' };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function parseIso(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }
  function longDate(iso) {
    var p = parseIso(iso);
    return p ? p.d + ' ' + MON_LONG[p.m - 1] + ' ' + p.y : iso;
  }
  function fmtDates(f) {
    var a = parseIso(f.date), b = f.date_end ? parseIso(f.date_end) : null;
    if (!a) return f.date;
    if (!b) return a.d + ' ' + MON[a.m - 1] + ' ' + a.y;
    if (a.y === b.y && a.m === b.m) return a.d + '–' + b.d + ' ' + MON[a.m - 1] + ' ' + a.y;
    if (a.y === b.y) return a.d + ' ' + MON[a.m - 1] + '–' + b.d + ' ' + MON[b.m - 1] + ' ' + a.y;
    return a.d + ' ' + MON[a.m - 1] + ' ' + a.y + '–' + b.d + ' ' + MON[b.m - 1] + ' ' + b.y;
  }
  function fmtPrice(f) {
    if (!f.price) return 'On Request';
    var cur = f.currency || 'USD';
    var sym = SYMBOL[cur] || '';
    return sym + Number(f.price).toLocaleString('en-US') + ' ' + cur;
  }
  function todayIso(now) {
    var d = now || new Date();
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  function create(airports) {
    var api = {};

    api.resolve = function (code) {
      return airports[String(code || '').toUpperCase()] || null;
    };
    api.city = function (code) { var a = api.resolve(code); return a ? a.city : String(code); };
    api.country = function (code) { var a = api.resolve(code); return a ? a.country : ''; };
    api.countryShort = function (code) { var c = api.country(code); return COUNTRY_SHORT[c] || c; };
    api.cities = function () {
      var seen = {};
      Object.keys(airports).forEach(function (k) { seen[airports[k].city] = 1; });
      return Object.keys(seen).sort();
    };

    api.isLive = function (f, today) {
      return (f.date_end || f.date) >= today;
    };

    // A side spec is {city:[...], country:[...]}; it matches if either list holds the airport's city or country.
    function sideMatch(spec, code) {
      if (!spec) return true;
      var a = api.resolve(code);
      if (!a) return false;
      if (spec.city && spec.city.indexOf(a.city) > -1) return true;
      if (spec.country && spec.country.indexOf(a.country) > -1) return true;
      return false;
    }
    // A rule is {from, to} or {any}. Missing side = any airport. {} matches everything.
    function ruleMatch(rule, f) {
      if (rule.any) return sideMatch(rule.any, f.from) || sideMatch(rule.any, f.to);
      return sideMatch(rule.from, f.from) && sideMatch(rule.to, f.to);
    }
    api.matches = function (slot, f) {
      return (slot.rules || [{}]).some(function (r) { return ruleMatch(r, f); });
    };
    api.slotFlights = function (slot, flights, today) {
      var list = flights.filter(function (f) { return api.isLive(f, today) && api.matches(slot, f); });
      list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; });
      return slot.limit ? list.slice(0, slot.limit) : list;
    };
    // Every page slot a flight would appear on (used by the staging preview).
    api.placements = function (f, pages, today) {
      var out = [];
      Object.keys(pages).forEach(function (file) {
        var p = pages[file];
        (p.slots || []).forEach(function (s) {
          if (api.slotFlights(s, [f], today).length) out.push({ file: file, label: p.label || file, slot: s.id });
        });
      });
      return out;
    };

    api.route = function (f) { return api.city(f.from) + ' → ' + api.city(f.to); };
    api.sub = function (f) {
      var a = api.countryShort(f.from), b = api.countryShort(f.to);
      return (a === b ? a : a + ' / ' + b) + ' · ' + f.from + ' → ' + f.to;
    };
    api.quoteUrl = function (f, prefix) {
      var enc = function (s) { return encodeURIComponent(s).replace(/%28/g, '(').replace(/%29/g, ')'); };
      return (prefix || 'private-jet-quote.html') +
        '?departure=' + enc(api.city(f.from) + ' (' + f.from + ')') +
        '&destination=' + enc(api.city(f.to) + ' (' + f.to + ')') +
        '&flightDate=' + f.date +
        '&aircraft=' + enc(f.aircraft) +
        '&pax=' + (f.seats || '');
    };

    api.cardHtml = function (f, style, pad) {
      pad = pad || '';
      var hover = style && style.card_class ? style.card_class + ' ' : '';
      var showPrice = style && style.show_price;
      var seats = f.seats ? (f.seats_est ? 'Up to ' : '') + f.seats + ' Seats' : 'On Request';
      var footer = showPrice
        ? '<div class="mt-4 pt-4 border-t border-navy-700 flex justify-between items-center">\n' +
          '  <span class="text-gray-400 text-xs">Price: ' + esc(fmtPrice(f)) + '</span>\n'
        : '<div class="mt-4 pt-4 border-t border-navy-700 flex justify-end items-center">\n';
      var lines = [
        '<!-- ' + esc(api.route(f)) + ' -->',
        '<div class="' + hover + 'border border-navy-700 bg-navy-800 p-6 rounded-lg flex flex-col">',
        '  <div class="flex justify-between items-start mb-4">',
        '    <div>',
        '      <p class="text-white font-semibold text-lg">' + esc(api.route(f)) + '</p>',
        '      <p class="text-gray-500 text-xs">' + esc(api.sub(f)) + '</p>',
        '    </div>',
        '    <span class="bg-[#C8B283]/10 text-[#C8B283] text-xs px-2 py-1 rounded font-medium">' + esc(f.aircraft) + '</span>',
        '  </div>',
        '  <div class="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-navy-700">',
        '    <div>',
        '      <p class="text-gray-500 text-[10px] uppercase tracking-wider">Date</p>',
        '      <p class="text-gray-300 text-sm">' + esc(fmtDates(f)) + '</p>',
        '    </div>',
        '    <div>',
        '      <p class="text-gray-500 text-[10px] uppercase tracking-wider">Capacity</p>',
        '      <p class="text-gray-300 text-sm">' + esc(seats) + '</p>',
        '    </div>',
        '  </div>',
        '  ' + footer.replace(/\n$/, '').split('\n').join('\n  '),
        '    <a href="' + api.quoteUrl(f, style && style.quote_prefix) + '" class="text-[#C8B283] text-xs font-semibold hover:underline">Enquire Now →</a>',
        '  </div>',
        '</div>'
      ];
      return lines.map(function (l) { return pad + l; }).join('\n');
    };

    api.gridHtml = function (list, style, pad) {
      pad = pad || '';
      var inner = list.map(function (f) { return api.cardHtml(f, style, pad + '  '); }).join('\n\n');
      return pad + '<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6 fade-in">\n\n' + inner + '\n\n' + pad + '</div>';
    };

    api.defaultEmptyHtml = function (style, pad) {
      pad = pad || '';
      var href = (style && style.empty_href) || '#notify';
      return [
        '<div class="bg-navy-800 border border-[#C8B283]/20 p-6 md:p-10 text-center fade-in rounded-lg">',
        '  <iconify-icon icon="ph:airplane-takeoff-duotone" class="text-[#C8B283] text-5xl mb-4"></iconify-icon>',
        '  <h3 class="text-xl font-display text-white mb-2">No Matching Flights Right Now</h3>',
        '  <p class="text-sm text-gray-400 max-w-md mx-auto">Empty legs on this route move fast. Register your preferred dates and our desk will alert you by WhatsApp the moment a matching flight becomes available.</p>',
        '  <a href="' + href + '" class="inline-flex items-center gap-2 mt-6 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold px-6 py-3 transition-colors rounded-lg">REGISTER THIS ROUTE <iconify-icon icon="lucide:arrow-right"></iconify-icon></a>',
        '</div>'
      ].map(function (l) { return pad + l; }).join('\n');
    };

    // Short names used in structured data, e.g. "Tokyo to Singapore - Challenger 850".
    api.listName = function (f) { return api.city(f.from) + ' to ' + api.city(f.to) + ' - ' + f.aircraft; };

    // Returns a list of human-readable problems. An empty list means the data is safe to publish.
    api.validate = function (flights) {
      var problems = [], seen = {};
      flights.forEach(function (f, i) {
        var tag = 'Flight ' + (f.id || i + 1) + ' (' + f.from + ' → ' + f.to + ', ' + f.date + ')';
        if (!parseIso(f.date)) problems.push(tag + ': the date is not valid (use YYYY-MM-DD).');
        if (f.date_end && (!parseIso(f.date_end) || f.date_end <= f.date)) problems.push(tag + ': the end date must be after the start date.');
        if (!api.resolve(f.from)) problems.push(tag + ': unknown departure airport "' + f.from + '".');
        if (!api.resolve(f.to)) problems.push(tag + ': unknown arrival airport "' + f.to + '".');
        if (api.resolve(f.from) && api.resolve(f.to) && api.city(f.from) === api.city(f.to)) problems.push(tag + ': departure and arrival are the same city.');
        if (!f.aircraft) problems.push(tag + ': aircraft is missing.');
        if (f.price != null && !(Number(f.price) > 0)) problems.push(tag + ': price must be a positive number or empty.');
        var key = [api.city(f.from), api.city(f.to), f.date, String(f.aircraft).toLowerCase().replace(/[^a-z0-9]/g, '')].join('|');
        if (seen[key]) problems.push(tag + ': duplicate of flight ' + seen[key] + '.');
        seen[key] = f.id || i + 1;
      });
      return problems;
    };

    return api;
  }

  return { create: create, fmtDates: fmtDates, fmtPrice: fmtPrice, longDate: longDate, parseIso: parseIso, todayIso: todayIso, esc: esc, MON: MON };
});
