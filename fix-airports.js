const fs = require('fs');
const path = 'data/airports.json';
const airports = JSON.parse(fs.readFileSync(path, 'utf8'));

const additions = {
  "BIKF": { "city": "Reykjavik", "country": "Iceland" },
  "EBBR": { "city": "Brussels", "country": "Belgium" },
  "KJFK": { "city": "New York", "country": "United States" },
  "LERL": { "city": "Ciudad Real", "country": "Spain" },
  "LIMZ": { "city": "Cuneo", "country": "Italy" },
  "LROP": { "city": "Bucharest", "country": "Romania" },
  "OPLA": { "city": "Lahore", "country": "Pakistan" },
  "ORER": { "city": "Erbil", "country": "Iraq" },
  "RJFF": { "city": "Fukuoka", "country": "Japan" },
  "UTSS": { "city": "Samarkand", "country": "Uzbekistan" },
  "VMMC": { "city": "Macau", "country": "China" },
  "ZBTJ": { "city": "Tianjin", "country": "China" }
};

let added = 0;
for (const [code, data] of Object.entries(additions)) {
  if (!airports[code]) {
    airports[code] = data;
    added++;
  }
}

fs.writeFileSync(path, JSON.stringify(airports, null, 4), 'utf8');
console.log(`✅ Success: Added ${added} airports. Total registry is now ${Object.keys(airports).length} codes.`);