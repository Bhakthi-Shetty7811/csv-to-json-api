// Responsible for: parsing CSV (custom logic), transforming rows into nested JSON
// validating and inserting into Postgres, and printing the age-distribution report.

import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config(); // load CSV_FILE_PATH from .env

/**
 * setNestedProperty
 * - Put `value` into `obj` at a dotted path like "a.b.c"
 * - Creates intermediate objects as needed.
 * - Example: setNestedProperty(obj, 'address.line1', '42 Road')
 */
function setNestedProperty(obj, keyPath, value) {
  const keys = keyPath.split('.');
  let current = obj;
  keys.forEach((key, idx) => {
    // If last key, assign value
    if (idx === keys.length - 1) current[key] = value;
    else {
      // Ensure intermediate node is an object
      if (!current[key] || typeof current[key] !== 'object') current[key] = {};
      current = current[key];
    }
  });
}

/**
 * splitCSVLine
 * - A small CSV tokenizer that supports:
 *    - quoted fields like "A, B" (commas inside quotes),
 *    - escaped quotes inside quoted fields via "" (two double-quotes).
 * - Returns array of trimmed field strings for that line.
 *
 * Note: This is intentionally simple but handles the common cases your assignment needs.
 */
function splitCSVLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // Handle escaped quote inside quotes: ""
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        field += '"'; // add a single quote to field
        i++; // skip the second quote
      } else {
        // Toggle inQuotes state
        inQuotes = !inQuotes;
      }
      continue;
    }

    // Comma that separates fields only when we're not inside quotes
    if (ch === ',' && !inQuotes) {
      fields.push(field);
      field = '';
      continue;
    }

    // Normal character
    field += ch;
  }

  // push last field
  fields.push(field);
  // Trim whitespace around fields
  return fields.map(f => f.trim());
}

/**
 * parseCSV
 * - Convert raw CSV text -> { headers, records }
 * - Handles:
 *    - blank-line removal,
 *    - header parsing,
 *    - dotted keys -> nested objects using setNestedProperty,
 *    - rows with fewer fields (padding) or extra fields (kept under __extras).
 */
function parseCSV(data) {
  // Empty file -> return empty result
  if (!data || !data.trim()) return { headers: [], records: [] };

  // Normalize newlines to '\n' and split; remove purely blank lines
  const rawLines = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines = rawLines.filter(l => l.trim().length > 0);

  if (lines.length === 0) return { headers: [], records: [] };

  // First non-blank line is header
  const headerLine = lines.shift();
  const headers = splitCSVLine(headerLine).map(h => h.trim());

  const records = [];

  for (const raw of lines) {
    const fields = splitCSVLine(raw);

    // If row has fewer fields than headers, pad with empty strings (robustness)
    if (fields.length < headers.length) {
      while (fields.length < headers.length) fields.push('');
    }

    // Build the nested object for this row using header keys
    const row = {};
    headers.forEach((key, idx) => {
      setNestedProperty(row, key, fields[idx] !== undefined ? fields[idx] : '');
    });

    // If there are extra fields beyond headers, store them under __extras to avoid data loss
    if (fields.length > headers.length) {
      const extra = {};
      for (let j = headers.length; j < fields.length; j++) {
        extra[`_extra_${j - headers.length + 1}`] = fields[j];
      }
      if (Object.keys(extra).length) row.__extras = extra;
    }

    // Skip rows that are completely empty (all fields blank)
    const anyNonEmpty = Object.values(row).some(val => {
      if (val === null || val === undefined) return false;
      if (typeof val === 'object') {
        // stringify object and check if it contains anything other than {} or quotes
        return JSON.stringify(val).replace(/["{}]/g, '').trim().length > 0;
      }
      return String(val).trim().length > 0;
    });

    if (anyNonEmpty) records.push(row);
  }

  return { headers, records };
}

/**
 * uploadToDB
 * - main function used by the app to read CSV -> validate -> insert into DB
 * - Validations:
 *    - CSV file path exists
 *    - headers & records present
 *    - mandatory fields (name.firstName, name.lastName, age) exist per row
 *    - age is numeric
 * - For each valid row:
 *    - name column in DB = firstName + ' ' + lastName
 *    - address subtree goes to `address` JSONB column
 *    - anything else goes to `additional_info` JSONB column
 *
 * Returns an object summarizing inserted count, skipped rows and totalRows processed.
 */
export async function uploadToDB(pool) {
  const filePath = process.env.CSV_FILE_PATH;
  if (!filePath) throw new Error('CSV_FILE_PATH not set in .env');

  // CSV location check
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ CSV file not found at ${filePath}`);
    return { insertedCount: 0, skipped: [], totalRows: 0 };
  }

  // Read entire file (for production with very large CSVs -> streaming recommended)
  const csvData = fs.readFileSync(filePath, 'utf-8');
  const { headers, records } = parseCSV(csvData);

  // Nothing to do if file has no headers/records
  if (!headers.length || !records.length) {
    console.log('ℹ️ CSV appears empty (no headers or no data rows). Nothing to upload.');
    return { insertedCount: 0, skipped: [], totalRows: records.length };
  }

  const skipped = []; // collect skipped rows with reasons
  let insertedCount = 0;
  let lineIndex = 1; // row index relative to first data line (1-based)

  for (const rec of records) {
    const firstName = rec?.name?.firstName ?? '';
    const lastName = rec?.name?.lastName ?? '';
    const ageRaw = rec?.age ?? '';

    // Validate mandatory fields
    if (!firstName || !lastName) {
      skipped.push({ lineIndex, reason: 'Missing name.firstName or name.lastName' });
      console.warn(`Skipping row ${lineIndex}: missing name fields`);
      lineIndex++;
      continue;
    }

    // Validate age is an integer-like value
    const age = parseInt(String(ageRaw).trim());
    if (Number.isNaN(age)) {
      skipped.push({ lineIndex, reason: `Invalid age: "${ageRaw}"` });
      console.warn(`Skipping row ${lineIndex}: invalid age -> ${ageRaw}`);
      lineIndex++;
      continue;
    }

    // Build DB-ready fields
    const name = `${String(firstName).trim()} ${String(lastName).trim()}`;
    // Remove top-level name & age so they don't appear in additional_info
    const { name: _n, age: _a, address = {}, ...rest } = rec;
    // address may be missing or a string — ensure it's an object
    const addressObj = typeof address === 'object' ? address : {};

    try {
      // Insert into DB: name, age, address(jsonb), additional_info(jsonb)
      await pool.query(
        `INSERT INTO users(name, age, address, additional_info) VALUES($1, $2, $3, $4)`,
        [name, age, addressObj, rest]
      );
      insertedCount++;
    } catch (err) {
      // Capture DB errors per row so we can continue processing others
      skipped.push({ lineIndex, reason: `DB insert error: ${err.message}` });
      console.error(`DB error inserting row ${lineIndex}:`, err.message);
    }

    lineIndex++;
  }

  console.log(`✅ Inserted ${insertedCount} rows. Skipped ${skipped.length} rows.`);
  return { insertedCount, skipped, totalRows: records.length };
}

/**
 * printAgeDistribution
 * - Reads ages from DB and prints a neat console table (human-friendly).
 * - Age groups:
 *    <20, 20-40 (inclusive), 40-60 (exclusive of 40), >60
 * - Percentages are rounded to integers for a clean console report.
 */
export async function printAgeDistribution(pool) {
  const res = await pool.query(`SELECT age FROM users`);
  const total = res.rows.length;

  if (total === 0) {
    console.log('\n⚠️  No users found in DB. Upload CSV first.\n');
    return;
  }

  // Count users in each group
  const groups = { '<20': 0, '20–40': 0, '40–60': 0, '>60': 0 };

  for (const { age } of res.rows) {
    if (age <= 20) groups['<20']++;
    else if (age > 20 && age <= 40) groups['20–40']++;
    else if (age > 40 && age <= 60) groups['40–60']++;
    else if (age > 60) groups['>60']++;
  }

  // Convert to percentage (rounded)
  const percents = {};
  for (const [key, val] of Object.entries(groups)) {
    percents[key] = Math.round((val / total) * 100);
  }

  // Nicely formatted output for console — easy to read during demo
  console.log('\n═══════════════════════════════════════════');
  console.log('          📊 AGE-GROUP % DISTRIBUTION       ');
  console.log('═══════════════════════════════════════════');
  console.log('  AGE GROUP       |    PERCENTAGE (%)       ');
  console.log('───────────────────────────────────────────');
  console.log(`  < 20            |    ${percents['<20'].toString().padStart(3)}%`);
  console.log(`  20 to 40        |    ${percents['20–40'].toString().padStart(3)}%`);
  console.log(`  40 to 60        |    ${percents['40–60'].toString().padStart(3)}%`);
  console.log(`  > 60            |    ${percents['>60'].toString().padStart(3)}%`);
  console.log('═══════════════════════════════════════════\n');
}
