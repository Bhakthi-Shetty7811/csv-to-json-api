// Express server: exposes endpoints to upload CSV -> DB, list users and print report.

import express from 'express';
import dotenv from 'dotenv';
import { initializeDB } from './db.js';
import { uploadToDB, printAgeDistribution } from './utils/csvParser.js';

dotenv.config();
const app = express();

let pool; // will be assigned after DB initialization

/**
 * ensurePool middleware
 * - Blocks incoming API calls until the DB pool is ready.
 * - Prevents errors like "pool is undefined" during startup.
 */
function ensurePool(req, res, next) {
  if (!pool) return res.status(503).json({ error: 'Server starting — DB not ready yet. Try again shortly.' });
  next();
}

app.get('/', (req, res) => {
  // Simple message for the reviewer
  res.send('CSV→JSON API is running. Use GET /upload to import, GET /users to list, GET /report for age distribution.');
});

app.get('/users', ensurePool, async (req, res) => {
  // Return up to 100 users so UI reviewers can quickly inspect inserted rows
  try {
    const result = await pool.query('SELECT id, name, age, address, additional_info FROM users ORDER BY id LIMIT 100');
    res.json({ count: result.rows.length, rows: result.rows });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /upload
 * - Triggers CSV -> DB import using uploadToDB (custom parser)
 * - Returns a summary JSON containing number of inserted rows and skipped rows
 */
app.get('/upload', ensurePool, async (req, res) => {
  try {
    const result = await uploadToDB(pool);
    res.json({
      message: 'Upload completed',
      inserted: result.insertedCount ?? 0,
      skipped: result.skipped ?? [],
      totalRows: result.totalRows ?? 0,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

/**
 * GET /report
 * - Re-print the age distribution to the server console (useful in demo)
 * - Returns a small JSON acknowledging the action
 */
app.get('/report', ensurePool, async (req, res) => {
  try {
    await printAgeDistribution(pool);
    res.json({ message: 'Age distribution printed to server console.' });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Failed to print report', detail: err.message });
  }
});

/**
 * startServer
 * - Initialize DB (create DB/table if needed) and start Express listener
 * - On startup it prints the current age distribution (if any data exists)
 */
const startServer = async () => {
  try {
    pool = await initializeDB();

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, async () => {
      console.log(`✅ Server running on port ${PORT}`);
      // Print distribution once server is up (handy for demo)
      await printAgeDistribution(pool);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
