/*
 * Skylinks Asia: raw flight text parser.
 * Reads pasted text (one flight per line, or short blocks) and returns draft flights
 * for review. It never guesses silently: anything missing is flagged for the owner.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SkylinksParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
  var MONTH_RX = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  // Known aircraft, written the way the site shows them. First match wins, so list specific names first.
  var AIRCRAFT = [
    ['Gulfstream G650ER', /\bg\s?-?650\s?er\b/i], ['Gulfstream G650', /\bg\s?-?650\b/i], ['Gulfstream G700', /\bg\s?-?700\b/i],
    ['Gulfstream G550', /\bg\s?-?550\b/i], ['Gulfstream G450', /\bg\s?-?450\b/i], ['Gulfstream G280', /\bg\s?-?280\b/i],
    ['Global 7500', /\bglobal\s?7500\b/i], ['Global 6500', /\bglobal\s?6500\b/i], ['Global 6000', /\bglobal\s?6000\b/i],
    ['Global 5000', /\bglobal\s?5000\b/i], ['Global 8000', /\bglobal\s?8000\b/i], ['Global Express XRS', /\bglobal\s?express(?:\s?xrs)?\b/i],
    ['Gulfstream GIV-SP', /\bg\s?-?\s?(?:iv|4)\s?-?\s?sp\b/i], ['Citation Bravo', /\bcitation\s?bravo\b/i], ['Falcon 900DX EASy', /\bfalcon\s?900\s?dx\b/i], ['Challenger 350', /\bchallenger\s?350\b/i], ['Challenger 300', /\bchallenger\s?300\b/i],
    ['Challenger 605', /\bchallenger\s?605\b/i], ['Challenger 650', /\bchallenger\s?650\b/i], ['Challenger 850', /\bchallenger\s?850\b/i],
    ['Falcon 900LX', /\bfalcon\s?900\s?lx\b/i], ['Falcon 7X', /\bfalcon\s?7x\b/i], ['Falcon 8X', /\bfalcon\s?8x\b/i],
    ['Falcon 2000', /\bfalcon\s?2000\b/i], ['Legacy 650', /\blegacy\s?650\b/i], ['Legacy 600', /\blegacy\s?600\b/i],
    ['Legacy 500', /\blegacy\s?500\b/i], ['Legacy 450', /\blegacy\s?450\b/i], ['Phenom 300', /\bphenom\s?300\b/i],
    ['Phenom 100', /\bphenom\s?100\b/i], ['Citation XLS+', /\bcitation\s?xls\s?\+?/i], ['Citation Latitude', /\bcitation\s?latitude\b/i],
    ['Citation CJ3+', /\bcitation\s?cj3\s?\+?/i], ['Citation Sovereign', /\bcitation\s?sovereign\b/i], ['Hawker 4000', /\bhawker\s?4000\b/i],
    ['Hawker 900XP', /\bhawker\s?900\s?xp\b/i], ['Hawker 800XP', /\bhawker\s?800\s?xp\b/i], ['Learjet 60', /\blear\s?jet\s?60\b/i],
    ['Learjet 45', /\blear\s?jet\s?45\b/i], ['King Air 350i', /\bking\s?air\s?350\s?i?\b/i], ['Pilatus PC-12', /\bpc\s?-?12\b|\bpilatus\b/i],
    ['Airbus ACJ A319', /\bacj\s?a?319\b|\bacj319\b/i], ['Airbus ACJ A320', /\bacj\s?a?320\b/i], ['BBJ737', /\bbbj\s?-?737\b/i],
    ['Boeing BBJ', /\bbbj\b/i], ['Embraer Legacy 600', /\bemb(?:raer)?\s?600\b/i]
  ];

  function escRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function create(core, airports, opts) {
    opts = opts || {};
    var today = opts.today || core.todayIso();
    var cityNames = core.cities();
    // Sort longest first so "Abu Dhabi" is found before "Abu", "Dar es Salaam" before "Dar".
    cityNames.sort(function (a, b) { return b.length - a.length; });
    var cityRx = cityNames.map(function (c) {
      return { name: c, rx: new RegExp('(^|[^A-Za-z])' + escRx(c).replace(/ /g, '\\s+') + '(?![A-Za-z])', 'i') };
    });
    // Extra spellings seen in operator messages.
    var ALIAS = { 'new delhi': 'Delhi', 'dwc': 'Dubai', 'kl': 'Kuala Lumpur', 'hcmc': 'Ho Chi Minh City',
      'sorong city': 'Sorong', 'saigon': 'Ho Chi Minh City', 'bombay': 'Mumbai', 'peking': 'Beijing', 'istanbul sabiha': 'Istanbul', 'denpasar': 'Bali',
      'dar es salam': 'Dar es Salaam', 'jeddah': 'Jeddah', 'jiddah': 'Jeddah', 'riyad': 'Riyadh', 'dusseldorf': 'Dusseldorf', 'düsseldorf': 'Dusseldorf' };

    // Find locations in the order they appear. Each hit: {pos, len, code, city, how}
    function findPlaces(line) {
      var hits = [];
      var rxCode = /\b([A-Z]{4}|[A-Z]{3})\b/g, m;
      while ((m = rxCode.exec(line))) {
        if (airports[m[1]]) hits.push({ pos: m.index, len: m[1].length, code: m[1], how: 'code' });
      }
      cityRx.forEach(function (c) {
        var m2 = c.rx.exec(line);
        if (m2) {
          var pos = m2.index + m2[1].length;
          var overlap = hits.some(function (h) { return pos < h.pos + h.len && pos + c.name.length > h.pos; });
          if (!overlap) hits.push({ pos: pos, len: c.name.length, city: c.name, how: 'city' });
        }
      });
      Object.keys(ALIAS).forEach(function (a) {
        if (!ALIAS[a]) return;
        var m3 = new RegExp('(^|[^A-Za-z])' + escRx(a) + '(?![A-Za-z])', 'i').exec(line);
        if (m3) {
          var pos = m3.index + m3[1].length;
          var overlap = hits.some(function (h) { return pos < h.pos + h.len && pos + a.length > h.pos; });
          if (!overlap) hits.push({ pos: pos, len: a.length, city: ALIAS[a], how: 'city' });
        }
      });
      hits.sort(function (a, b) { return a.pos - b.pos; });
      // When a city and its own code both appear ("Dubai (OMDW)"), keep the code and drop the city.
      var out = [];
      hits.forEach(function (h) {
        var prev = out[out.length - 1];
        var hc = h.code ? airports[h.code].city : h.city;
        var pc = prev ? (prev.code ? airports[prev.code].city : prev.city) : null;
        if (prev && pc === hc && h.pos - (prev.pos + prev.len) < 6) {
          if (h.code && !prev.code) out[out.length - 1] = h;
          return;
        }
        out.push(h);
      });
      return out;
    }

    var usage = {};
    (opts.flights || []).forEach(function (f) {
      [f.from, f.to].forEach(function (c) { usage[c] = (usage[c] || 0) + 1; });
    });
    var multi = {};
    Object.keys(airports).forEach(function (k) {
      if (k.length === 4) { var c = airports[k].city; multi[c] = (multi[c] || 0) + 1; }
    });
    function defaultAirport(city) {
      var best = null, bestN = -1;
      Object.keys(airports).forEach(function (k) {
        if (airports[k].city !== city || k.length !== 4) return;
        var n = usage[k] || 0;
        if (n > bestN) { best = k; bestN = n; }
      });
      return best;
    }

    // True when one airport of a city is clearly the one already used on the site, so no warning is needed.
    function clearDefault(city, code) {
      var mine = usage[code] || 0, other = 0;
      Object.keys(airports).forEach(function (k) { if (k.length === 4 && airports[k].city === city && k !== code) other = Math.max(other, usage[k] || 0); });
      return mine > 0 && mine > other * 2;
    }
    function pad(n) { return String(n).padStart(2, '0'); }
    function iso(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
    function inferYear(m, d) {
      var ty = +today.slice(0, 4), tm = +today.slice(5, 7), td = +today.slice(8, 10);
      // A month well before today means next year (e.g. "5 Jan" typed in October).
      if (m < tm || (m === tm && d < td - 14)) return ty + 1;
      return ty;
    }

    function findDates(line) {
      var m;
      // 2026-10-12 (optionally "to 2026-10-14")
      m = /\b(\d{4})-(\d{2})-(\d{2})\b(?:\s*(?:to|-|–|—)\s*(\d{4})-(\d{2})-(\d{2}))?/.exec(line);
      if (m) return { start: iso(+m[1], +m[2], +m[3]), end: m[4] ? iso(+m[4], +m[5], +m[6]) : null, text: m[0] };
      // 12-13 Oct [2026], 12–13th October
      m = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|—|to)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+' + MONTH_RX + '(?:\\s+(\\d{4}))?', 'i').exec(line);
      if (m) {
        var mo = MONTHS[m[3].toLowerCase()], yr = m[4] ? +m[4] : inferYear(mo, +m[1]);
        return { start: iso(yr, mo, +m[1]), end: iso(yr, mo, +m[2]), text: m[0] };
      }
      // 31 Oct - 2 Nov [2026]
      m = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+' + MONTH_RX + '\\s*(?:-|–|—|to)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+' + MONTH_RX + '(?:\\s+(\\d{4}))?', 'i').exec(line);
      if (m) {
        var m1 = MONTHS[m[2].toLowerCase()], m2 = MONTHS[m[4].toLowerCase()];
        var y1 = m[5] ? +m[5] : inferYear(m1, +m[1]);
        var y2 = m2 < m1 ? y1 + 1 : y1;
        return { start: iso(y1, m1, +m[1]), end: iso(y2, m2, +m[3]), text: m[0] };
      }
      // 12 Oct [2026]
      m = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+' + MONTH_RX + '(?:\\s+(\\d{4}))?\\b', 'i').exec(line);
      if (m) {
        var mo2 = MONTHS[m[2].toLowerCase()];
        return { start: iso(m[3] ? +m[3] : inferYear(mo2, +m[1]), mo2, +m[1]), end: null, text: m[0] };
      }
      // Oct 12 [2026]
      m = new RegExp('\\b' + MONTH_RX + '\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b', 'i').exec(line);
      if (m) {
        var mo3 = MONTHS[m[1].toLowerCase()];
        return { start: iso(m[3] ? +m[3] : inferYear(mo3, +m[2]), mo3, +m[2]), end: null, text: m[0] };
      }
      // 12/10/2026 read as day/month/year
      m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(line);
      if (m && +m[2] <= 12) return { start: iso(+m[3], +m[2], +m[1]), end: null, text: m[0] };
      return null;
    }

    function findAircraft(line) {
      for (var i = 0; i < AIRCRAFT.length; i++) {
        if (AIRCRAFT[i][1].test(line)) return { name: AIRCRAFT[i][0], text: (AIRCRAFT[i][1].exec(line) || [''])[0] };
      }
      return null;
    }
    function findSeats(line) {
      var m = /(?:up\s+to\s+)?(\d{1,2})\s*(?:pax|passengers?|seats?|px|pers(?:ons)?)\b/i.exec(line) ||
              /(?:pax|seats?|capacity)\s*[:=]?\s*(\d{1,2})\b/i.exec(line);
      return m ? { n: +m[1], text: m[0] } : null;
    }
    function findPrice(line) {
      if (/\b(on\s+request|poa|tba|price\s+on\s+application|ask)\b/i.test(line)) return { amount: null, currency: null, onRequest: true };
      var m = /(US\$|USD|\$|EUR|€|GBP|£|CNY|RMB|¥|AED|INR|₹)\s?([\d][\d,\.]*)\s?(k)?\b/i.exec(line) ||
              /\b([\d][\d,\.]*)\s?(k)?\s?(USD|EUR|GBP|CNY|AED|INR)\b/i.exec(line);
      if (!m) return null;
      var sym, num, k;
      if (/^[\d]/.test(m[1])) { num = m[1]; k = m[2]; sym = m[3]; } else { sym = m[1]; num = m[2]; k = m[3]; }
      var amount = parseFloat(num.replace(/,/g, ''));
      if (!isFinite(amount)) return null;
      if (k) amount *= 1000;
      var map = { 'US$': 'USD', '$': 'USD', 'usd': 'USD', 'eur': 'EUR', '€': 'EUR', 'gbp': 'GBP', '£': 'GBP', 'cny': 'CNY', 'rmb': 'CNY', '¥': 'CNY', 'aed': 'AED', 'inr': 'INR', '₹': 'INR' };
      var cur = map[String(sym).toLowerCase()] || map[sym] || 'USD';
      return { amount: Math.round(amount), currency: cur, onRequest: false };
    }

    function parseLine(line) {
      var notes = [];
      var places = findPlaces(line);
      var info = [];
      var row = { raw: line, from: null, to: null, date: null, date_end: null, aircraft: '', seats: null, price: null, currency: null, notes: notes, info: info };
      // Direction: first place is the origin, second is the destination, unless the text says "from X to Y" / "ex X".
      if (places.length >= 2) {
        row.from = places[0].code || defaultAirport(places[0].city);
        row.to = places[1].code || defaultAirport(places[1].city);
        if (places[0].how === 'city' && multi[places[0].city] > 1) notes.push('Departure airport chosen as ' + row.from + ' for ' + places[0].city + '. Check it.');
        if (places[1].how === 'city' && multi[places[1].city] > 1) notes.push('Arrival airport chosen as ' + row.to + ' for ' + places[1].city + '. Check it.');
        if (places.length > 2) notes.push('More than two places found. Using the first two.');
      } else if (places.length === 1) {
        notes.push('Only one airport found.');
      } else {
        notes.push('No airports recognised.');
      }
      var d = findDates(line);
      if (d) { row.date = d.start; row.date_end = d.end; if (d.end && d.end <= d.start) { row.date_end = null; notes.push('End date ignored.'); } }
      else notes.push('No date found.');
      var ac = findAircraft(line);
      if (ac) row.aircraft = ac.name; else notes.push('Aircraft not recognised.');
      var st = findSeats(line);
      if (st) row.seats = st.n; else notes.push('Seat count not found.');
      var pr = findPrice(line);
      if (pr) { row.price = pr.amount; row.currency = pr.currency; } else info.push('No price found. It will show as On Request.');
      var hard = !row.from || !row.to || !row.date || !row.aircraft || !row.seats;
      row.status = hard ? 'review' : (notes.length ? 'check' : 'ok');
      return row;
    }

    // Split pasted text into candidate flights. One line = one flight. A line that adds details
    // (date, aircraft, seats, price) to a place-only line above it is joined to that line.
    // Lines with nothing recognisable are returned in `skipped`, never silently dropped.
    function signals(l) {
      return { places: findPlaces(l).length, date: !!findDates(l), aircraft: !!findAircraft(l), seats: !!findSeats(l), price: !!findPrice(l) };
    }
    // ---- Table mode (pasted from Excel or Word, or loaded from a file) ----
    var HEAD = [
      ['date', /^(date|dates|flight date|departure date)$/i], ['route', /^(route|sector|routing|from\s*[\/-]\s*to)$/i],
      ['from', /^(from|origin|departure|dep)$/i], ['to', /^(to|destination|arrival|arr)$/i],
      ['aircraft', /^(aircraft|aircraft type|type|jet|model|aircraft category)$/i], ['seats', /^(seats?|pax|capacity|no\.? of seats|passengers)$/i],
      ['price', /^(price|fare|cost|rate|price \(.*\))$/i]
    ];
    function mapHeader(cells) {
      var map = {}, hits = 0;
      cells.forEach(function (c, i) {
        var t = String(c).trim();
        for (var k = 0; k < HEAD.length; k++) if (HEAD[k][1].test(t) && map[HEAD[k][0]] == null) { map[HEAD[k][0]] = i; hits++; break; }
      });
      return (map.date != null && (map.route != null || (map.from != null && map.to != null)) && hits >= 3) ? map : null;
    }
    function splitCells(line) { return line.indexOf('\t') > -1 ? line.split('\t') : (/\s\|\s/.test(line) || /^\|/.test(line) ? line.replace(/^\||\|$/g, '').split('|') : null); }
    function excelDate(n) { var d = new Date(Math.round((n - 25569) * 86400000)); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    function cellDate(v) {
      v = String(v == null ? '' : v).trim();
      if (/^\d{5}(\.\d+)?$/.test(v) && +v > 40000 && +v < 60000) return { start: excelDate(+v), end: null };
      var d = findDates(v.replace(/-(\w{3})-/, ' $1 '));
      return d ? { start: d.start, end: d.end } : null;
    }
    var aircraftTable = (opts.aircraft && opts.aircraft.models) || {};
    function parsePlace(txt, notes, label, info) {
      var pl = findPlaces(txt)[0];
      if (!pl) { notes.push(label + ' place not recognised: "' + txt.trim() + '".'); return null; }
      var code = pl.code || defaultAirport(pl.city);
      if (pl.how === 'city' && multi[pl.city] > 1) (clearDefault(pl.city, code) ? info : notes).push(label + ' airport assumed ' + code + ' for ' + pl.city + ' (the one already used on the site).');
      return code;
    }
    function parseTableRow(cells, map, raw) {
      var notes = [], info = [];
      var row = { raw: raw, from: null, to: null, date: null, date_end: null, aircraft: '', seats: null, seats_est: false, price: null, currency: null, notes: notes, info: info };
      var get = function (k) { return map[k] != null ? String(cells[map[k]] == null ? '' : cells[map[k]]).trim() : ''; };
      var a, b;
      if (map.route != null) {
        var parts = get('route').split(/\s*(?:\/|→|->|\u2192|\s-\s|\sto\s)\s*/i);
        a = parts[0]; b = parts[1];
        if (parts.length > 2) notes.push('Route has more than two places. Using the first two.');
      } else { a = get('from'); b = get('to'); }
      row.from = a ? parsePlace(a, notes, 'Departure', info) : null;
      row.to = b ? parsePlace(b, notes, 'Arrival', info) : null;
      if (!a || !b) notes.push('Route is incomplete.');
      var d = cellDate(get('date'));
      if (d) { row.date = d.start; row.date_end = d.end; } else notes.push('No valid date: "' + get('date') + '".');
      var acTxt = get('aircraft'), ac = findAircraft(acTxt);
      if (ac) row.aircraft = ac.name; else { row.aircraft = acTxt; notes.push('Aircraft not recognised: "' + acTxt + '".'); }
      var sv = get('seats'), sn = /^\d{1,2}$/.test(sv) ? +sv : (findSeats(sv) || {}).n;
      if (sn) row.seats = sn;
      else if (aircraftTable[row.aircraft]) { row.seats = aircraftTable[row.aircraft].seats; row.seats_est = true; info.push('Seats not given. Estimated from the aircraft type.'); }
      else notes.push('Seat count not found.');
      var pv = get('price'), pr = /^(n\/?a|-|tba|poa|on request|)$/i.test(pv) ? null : findPrice(pv);
      if (pr && pr.amount) { row.price = pr.amount; row.currency = pr.currency; } else info.push('No price. It will show as On Request.');
      row.status = (!row.from || !row.to || !row.date || !row.aircraft || !row.seats) ? 'review' : (notes.length ? 'check' : 'ok');
      return row;
    }
    function parseTable(rowsOfCells) {
      var map = null, rows = [], skipped = [];
      rowsOfCells.forEach(function (cells) {
        var raw = cells.join(' | ');
        if (!map) { map = mapHeader(cells); if (!map) skipped.push(raw); return; }
        if (cells.every(function (c) { return !String(c).trim(); })) return;
        if (mapHeader(cells)) return;
        rows.push(parseTableRow(cells, map, raw));
      });
      return map ? { rows: rows, skipped: skipped } : null;
    }

    function parse(text) {
      var all = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
      var cellRows = all.map(splitCells);
      if (cellRows.length && cellRows.filter(Boolean).length >= Math.max(2, all.length - 3)) {
        var t = parseTable(cellRows.map(function (c, i) { return c || [all[i]]; }));
        if (t) return t;
      }
      var lines = String(text || '').split(/\r?\n/)
        .map(function (l) { return l.replace(/^\s*(?:[•\-\*]|\d{1,2}[\.\)])\s+/, '').trim(); })
        .filter(Boolean);
      var groups = [], skipped = [];
      lines.forEach(function (l) {
        var sg = signals(l);
        var any = sg.places || sg.date || sg.aircraft || sg.seats || sg.price;
        if (!any) { skipped.push(l); return; }
        var last = groups[groups.length - 1];
        if (!sg.places && last && last.sig.places && !(last.sig.date && last.sig.aircraft)) {
          last.text += ' ' + l;
          last.sig = signals(last.text);
        } else {
          groups.push({ text: l, sig: sg });
        }
      });
      return { rows: groups.map(function (g) { return parseLine(g.text); }), skipped: skipped };
    }

    return { parse: parse, parseTable: parseTable, parseLine: parseLine, aircraft: AIRCRAFT.map(function (a) { return a[0]; }) };
  }

  return { create: create };
});
