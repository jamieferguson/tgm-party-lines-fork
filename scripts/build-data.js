#!/usr/bin/env node
var https = require('https');
var fs = require('fs');
var path = require('path');
var readline = require('readline');

var DATA_URL = 'https://data.openaustralia.org.au';
var CACHE_DIR = path.join(__dirname, '..', '.openaustralia-cache');
var DATA_DIR = path.join(__dirname, '..', 'app', 'data');
var WORD_FREQ_DIR = path.join(DATA_DIR, 'wordfreq');
var SPEECHES_TMP = path.join(CACHE_DIR, 'speeches.jsonl');

var START_DATE = '2010-01-01';
var END_DATE = '2014-12-31';
var MIN_TERM_FREQ = 20;
var PRUNE_INTERVAL = 5000;

var PRESET_TERMS = [
  'carbon tax', 'carbon price', 'price on pollution',
  'civil union', 'same sex marriage', 'gay marriage', 'marriage equality',
  'border security', 'boat people', 'stop the boats', 'pacific solution',
  'refugee', 'asylum seeker', 'illegals',
  'petrol prices', 'breastfeeding', 'binge drinking', 'live exports'
];

var PRESET_SET = {};
PRESET_TERMS.forEach(function(t) { PRESET_SET[t] = true; });

function fetch(url, retries) {
  retries = retries || 0;
  return new Promise(function(resolve, reject) {
    var u = new URL(url);
    var opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      rejectUnauthorized: true,
      method: 'GET'
    };
    var req = https.get(opts, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, retries).then(resolve, reject);
      }
      var data = [];
      res.on('data', function(c) { data.push(c); });
      res.on('end', function() {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        resolve(Buffer.concat(data).toString('utf8'));
      });
    });
    req.on('error', function(err) {
      if ((err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') && retries < 10) {
        var delay = Math.pow(2, retries + 1) * 1000;
        console.error('  Retrying in ' + (delay/1000) + 's (attempt ' + (retries+1) + '/10)');
        return setTimeout(function() { fetch(url, retries + 1).then(resolve, reject); }, delay);
      }
      reject(err);
    });
    req.end();
  });
}

function fetchWithCache(url, cacheKey) {
  var cachePath = path.join(CACHE_DIR, cacheKey + '.xml');
  if (fs.existsSync(cachePath)) {
    console.log('  Using cached ' + cacheKey);
    return Promise.resolve(fs.readFileSync(cachePath, 'utf8'));
  }
  console.log('  Downloading ' + cacheKey + '...');
  return fetch(url).then(function(body) {
    var dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachePath, body);
    return body;
  });
}

function getAvailableDates(xml) {
  var dates = [];
  var re = /href="([0-9]{4}-[0-9]{2}-[0-9]{2}\.xml)"/g;
  var match;
  while ((match = re.exec(xml)) !== null) {
    dates.push(match[1].replace('.xml', ''));
  }
  return dates;
}

function getIsoWeekStart(dateStr) {
  var d = new Date(dateStr + 'T00:00:00Z');
  var day = d.getUTCDay();
  var diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().slice(0, 10);
}

var nonWordRe = /[^a-zA-Z\s]/g;
var multiSpaceRe = /\s+/g;

function extractWords(text) {
  return text.toLowerCase().replace(nonWordRe, ' ').replace(multiSpaceRe, ' ').trim().split(/\s+/);
}

function extractNgrams(words, n) {
  var ngrams = [];
  for (var i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, ' ');
}

function parseMemberXml(xml) {
  var members = {};
  var memberRe = /<member\s([^>]*)\/?>/g;
  var match;
  while ((match = memberRe.exec(xml)) !== null) {
    var attrsStr = match[1];
    var parts = {};
    var attrRe = /(\w+)="([^"]*)"/g;
    var am;
    while ((am = attrRe.exec(attrsStr)) !== null) {
      parts[am[1]] = am[2];
    }
    if (parts.id && parts.party) {
      members[parts.id] = parts.party;
    }
  }
  return members;
}

function parseSpeeches(xml, dateStr, memberPartyMap) {
  var speeches = [];
  var speechRe = /<speech\s([^>]*)>([\s\S]*?)<\/speech>/g;
  var match;
  while ((match = speechRe.exec(xml)) !== null) {
    var attrsStr = match[1];
    var body = match[2];

    var parts = {};
    var attrRe = /(\w+)="([^"]*)"/g;
    var am;
    while ((am = attrRe.exec(attrsStr)) !== null) {
      parts[am[1]] = am[2];
    }

    if (!parts.speakername) continue;

    var speakerName = parts.speakername.trim();
    var speakerId = parts.speakerid || '';
    var party = memberPartyMap[speakerId] || '';
    if (!party) continue;

    var rawId = parts.id || '';

    var nameParts = speakerName.split(/\s+/);
    var firstName = nameParts[0] || '';
    var lastName = nameParts.slice(1).join(' ') || '';

    var plainText = stripTags(body).replace(multiSpaceRe, ' ').trim();
    if (!plainText || plainText.length < 20) continue;

    var speechId = rawId
      .replace('uk.org.publicwhip/', '')
      .replace('debate', 'house')
      .replace('lords', 'senate')
      .replace(/\//g, '-');
    if (!speechId) speechId = 'speech-' + dateStr + '-' + Math.random().toString(36).slice(2, 8);

    var personId = speakerId.replace(/.*\//, '');

    speeches.push({
      id: speechId,
      person_id: personId,
      first_name: firstName,
      last_name: lastName,
      party: party,
      date: dateStr,
      week: getIsoWeekStart(dateStr),
      html: body,
      text: plainText
    });
  }
  return speeches;
}

// Returns true if all words in term are >= 3 chars
function allWordsLong(term) {
  var parts = term.split(' ');
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].length < 3) return false;
  }
  return true;
}

function extractAndCountNgrams(speech, termCounts) {
  var words = extractWords(speech.text);
  var seen = {};

  for (var n = 2; n <= 4; n++) {
    if (words.length < n) continue;
    var ngrams = extractNgrams(words, n);
    for (var j = 0; j < ngrams.length; j++) {
      var term = ngrams[j];
      var key = term + '|' + n;
      if (seen[key]) continue;
      seen[key] = true;

      // Skip terms with short words unless they're presets
      if (!PRESET_SET[term] && !allWordsLong(term)) continue;

      termCounts.set(term, (termCounts.get(term) || 0) + 1);
    }
  }
}

function pruneTermCounts(termCounts, minCount) {
  for (var entry of termCounts) {
    if (entry[1] <= minCount) {
      termCounts.delete(entry[0]);
    }
  }
}

async function main() {
  console.log('PartyLines Build Script');
  console.log('=======================');
  console.log('Date range: ' + START_DATE + ' to ' + END_DATE);
  console.log('');

  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(WORD_FREQ_DIR)) fs.mkdirSync(WORD_FREQ_DIR, { recursive: true });

  // 1. Download listing from OpenAustralia
  console.log('Listing available debate files...');
  var houses = ['representatives_debates', 'senate_debates'];
  var allDates = [];

  for (var h = 0; h < houses.length; h++) {
    var house = houses[h];
    var listing = await fetchWithCache(DATA_URL + '/scrapedxml/' + house + '/', house + '-listing');
    var dates = getAvailableDates(listing);
    console.log('  ' + house + ': ' + dates.length + ' dates');
    dates.forEach(function(d) { allDates.push({ date: d, house: house }); });
  }

  var relevant = allDates.filter(function(d) {
    return d.date >= START_DATE && d.date <= END_DATE;
  });
  console.log('  Relevant dates: ' + relevant.length);
  console.log('');

  // 2. Build member party map
  console.log('Building member party map...');
  var repsMembers = await fetchWithCache(DATA_URL + '/members/representatives.xml', 'members/representatives');
  var sensMembers = await fetchWithCache(DATA_URL + '/members/senators.xml', 'members/senators');
  var memberPartyMap = {};
  Object.assign(memberPartyMap, parseMemberXml(repsMembers));
  Object.assign(memberPartyMap, parseMemberXml(sensMembers));
  console.log('  Members loaded: ' + Object.keys(memberPartyMap).length);
  console.log('');

  // ====== PHASE 1: Download, parse, count terms, write temp file ======
  console.log('===== PHASE 1: Download & Count =====');
  console.log('');

  var tempStream = fs.createWriteStream(SPEECHES_TMP);
  var termCounts = new Map();
  var totalSpeeches = 0;
  var totalProcessed = 0;
  var total = relevant.length;

  for (var i = 0; i < total; i++) {
    var item = relevant[i];
    var houseDir = item.house;
    var dateStr = item.date;
    var cacheKey = houseDir + '/' + dateStr;
    var url = DATA_URL + '/scrapedxml/' + houseDir + '/' + dateStr + '.xml';

    console.log('[' + (i+1) + '/' + total + '] ' + houseDir + ' ' + dateStr + '...');

    try {
      var xml = await fetchWithCache(url, cacheKey);
      var speeches = parseSpeeches(xml, dateStr, memberPartyMap);
      console.log('  -> ' + speeches.length + ' speeches');
      totalSpeeches += speeches.length;

      for (var s = 0; s < speeches.length; s++) {
        var speech = speeches[s];
        // Write to temp file
        tempStream.write(JSON.stringify(speech) + '\n');
        // Count n-grams
        extractAndCountNgrams(speech, termCounts);
        totalProcessed++;

        // Periodically prune singletons to keep memory bounded
        if (totalProcessed % PRUNE_INTERVAL === 0) {
          var before = termCounts.size;
          pruneTermCounts(termCounts, 1);
          var after = termCounts.size;
          console.log('  [prune] ' + totalProcessed + ' speeches processed, unique terms: ' + before + ' -> ' + after);
        }
      }
    } catch (err) {
      console.error('  -> Error: ' + err.message);
    }
  }

  tempStream.end();
  await new Promise(function(resolve) { tempStream.on('finish', resolve); });

  console.log('');
  console.log('Phase 1 complete: ' + totalSpeeches + ' speeches, ' + termCounts.size + ' unique terms counted');
  console.log('');

  // ====== PHASE 2: Filter terms ======
  console.log('===== PHASE 2: Filter Terms =====');
  var keptTerms = new Set();

  // Always keep presets
  PRESET_TERMS.forEach(function(t) { keptTerms.add(t); });

  // Keep terms above threshold  
  for (var entry of termCounts) {
    if (entry[1] >= MIN_TERM_FREQ) {
      keptTerms.add(entry[0]);
    }
  }

  console.log('Kept terms: ' + keptTerms.size + ' (presets: ' + PRESET_TERMS.length + ', freq >= ' + MIN_TERM_FREQ + ': ' + (keptTerms.size - PRESET_TERMS.length) + ')');
  console.log('');

  // Release memory
  termCounts = null;

  // ====== PHASE 3: Build full data from temp file ======
  console.log('===== PHASE 3: Build Data =====');
  console.log('');

  var weekSet = {};
  var freq = {};
  var hansardMap = {};
  var processedLines = 0;

  var lineStream = readline.createInterface({
    input: fs.createReadStream(SPEECHES_TMP),
    crlfDelay: Infinity
  });

  for await (var line of lineStream) {
    if (!line) continue;
    var speech = JSON.parse(line);
    processedLines++;

    if (processedLines % 10000 === 0) {
      console.log('  Processing line ' + processedLines + '/' + totalSpeeches + '...');
    }

    // Track weeks
    weekSet[speech.week] = true;

    // Store hansard
    hansardMap[speech.id] = {
      id: speech.id,
      person_id: speech.person_id,
      first_name: speech.first_name,
      last_name: speech.last_name,
      party: speech.party,
      date: speech.date,
      html: speech.html
    };

    // Check n-grams against kept terms
    var words = extractWords(speech.text);
    var seenForSpeech = {};

    for (var n = 2; n <= 4; n++) {
      if (words.length < n) continue;
      var ngrams = extractNgrams(words, n);
      for (var j = 0; j < ngrams.length; j++) {
        var term = ngrams[j];
        var key = term + '|' + n;
        if (seenForSpeech[key]) continue;
        seenForSpeech[key] = true;

        if (!keptTerms.has(term)) continue;

        if (!freq[term]) {
          freq[term] = { data: [], tokens: term };
        }

        var data = freq[term].data;
        var found = false;
        for (var k = 0; k < data.length; k++) {
          if (data[k].party === speech.party && data[k].week === speech.week) {
            data[k].freq++;
            found = true;
            break;
          }
        }
        if (!found) {
          data.push({ party: speech.party, week: speech.week, freq: 1 });
        }
      }
    }
  }

  console.log('');
  console.log('Phase 3 complete: ' + processedLines + ' lines, ' + Object.keys(freq).length + ' terms with data');

  // Sort each term's data by party then week (chart expects sorted data)
  var termKeys = Object.keys(freq);
  for (var ti = 0; ti < termKeys.length; ti++) {
    freq[termKeys[ti]].data.sort(function(a, b) {
      if (a.party < b.party) return -1;
      if (a.party > b.party) return 1;
      if (a.week < b.week) return -1;
      if (a.week > b.week) return 1;
      return 0;
    });
  }

  // Cleanup temp file
  fs.unlinkSync(SPEECHES_TMP);

  // ====== WRITE OUTPUT ======
  console.log('');
  console.log('===== Writing Output =====');

  var weeks = Object.keys(weekSet).sort();
  fs.writeFileSync(path.join(DATA_DIR, 'weeks.json'), JSON.stringify(weeks));
  console.log('  data/weeks.json (' + weeks.length + ' weeks)');

  // Clean wordfreq directory
  if (!fs.existsSync(WORD_FREQ_DIR)) fs.mkdirSync(WORD_FREQ_DIR, { recursive: true });
  var oldFiles = fs.readdirSync(WORD_FREQ_DIR);
  oldFiles.forEach(function(f) { fs.unlinkSync(path.join(WORD_FREQ_DIR, f)); });

  // Hash-bucket split for even distribution under Cloudflare Pages 25 MB limit
  var NUM_BUCKETS = 100;

  function hashCode(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  var buckets = {};
  var terms = Object.keys(freq);
  for (var i = 0; i < terms.length; i++) {
    var term = terms[i];
    var bucket = hashCode(term) % NUM_BUCKETS;
    if (!buckets[bucket]) buckets[bucket] = {};
    buckets[bucket][term] = freq[term];
  }

  var termsIndex = terms.sort();
  fs.writeFileSync(path.join(DATA_DIR, 'terms-index.json'), JSON.stringify(termsIndex));
  var tiSize = (fs.statSync(path.join(DATA_DIR, 'terms-index.json')).size / 1024 / 1024).toFixed(1);
  console.log('  data/terms-index.json (' + termsIndex.length + ' terms, ' + tiSize + ' MB)');

  for (var b = 0; b < NUM_BUCKETS; b++) {
    if (!buckets[b]) buckets[b] = {};
    var filePath = path.join(WORD_FREQ_DIR, b + '.json');
    fs.writeFileSync(filePath, JSON.stringify(buckets[b]));
    var size = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1);
    var count = Object.keys(buckets[b]).length;
    console.log('  data/wordfreq/' + b + '.json (' + count + ' terms, ' + size + ' MB)');
  }

  // Split hansards by month
  var hansardMonths = {};
  Object.keys(hansardMap).forEach(function(id) {
    var h = hansardMap[id];
    var month = h.date.slice(0, 7);
    if (!hansardMonths[month]) hansardMonths[month] = {};
    hansardMonths[month][id] = h;
  });

  var hsDir = path.join(DATA_DIR, 'hansards');
  if (!fs.existsSync(hsDir)) fs.mkdirSync(hsDir, { recursive: true });

  Object.keys(hansardMonths).sort().forEach(function(month) {
    var filePath = path.join(hsDir, month + '.json');
    fs.writeFileSync(filePath, JSON.stringify(hansardMonths[month]));
    var size = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1);
    console.log('  data/hansards/' + month + '.json (' + Object.keys(hansardMonths[month]).length + ' entries, ' + size + ' MB)');
  });

  // Summary
  console.log('');
  console.log('Done!');
  console.log('Data covers ' + weeks.length + ' weeks, ' + totalSpeeches + ' speeches, ' + Object.keys(freq).length + ' searchable terms.');
}

main().catch(function(err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
