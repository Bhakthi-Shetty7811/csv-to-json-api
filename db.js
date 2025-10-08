// Handles Postgres initialization:
// 1) Uses an admin connection to the default "postgres" database to check & create the target DB
// 2) Connects to the target DB and ensures the `users` table exists
//
// Note: Creating a database requires the Postgres user to have CREATE DATABASE permission.
// If your environment or CI user doesn't have that, create the database manually and set PG_DATABASE to it.

import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client, Pool } = pkg;

/**
 * setupDatabase
 * - Connects to 'postgres' default DB as an admin client
 * - Checks if the desired DB exists; if not, creates it
 * - This makes local reviewers' life easier: no manual DB creation step.
 */
const setupDatabase = async () => {
  const adminClient = new Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    database: 'postgres', // connect to default DB to issue CREATE DATABASE
  });

  try {
    await adminClient.connect();

    const dbName = process.env.PG_DATABASE;
    const check = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (check.rowCount === 0) {
      console.log(`🛠 Creating database "${dbName}"...`);
      // CREATE DATABASE cannot be parameterized, so use template literal safely.
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
    } else {
      console.log(`✅ Database "${dbName}" already exists`);
    }
  } catch (err) {
    console.error('Error creating database:', err);
    // Rethrow so startServer can decide what to do (we choose to keep running only if DB ready)
    throw err;
  } finally {
    await adminClient.end();
  }
};

/**
 * setupTable
 * - Creates a PG pool connected to the target DB
 * - Ensures the `users` table exists with the schema required by the assignment
 * - Returns the Pool instance for use by the rest of the app
 */
const setupTable = async () => {
  const pool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    database: process.env.PG_DATABASE,
  });

  // Create table if it doesn't exist (id serial PK, name varchar, age int, address and additional_info as JSONB)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.users (
      id SERIAL PRIMARY KEY,
      name VARCHAR NOT NULL,
      age INT NOT NULL,
      address JSONB,
      additional_info JSONB
    );
  `);

  console.log('🟢 users table ready');
  return pool;
};

/**
 * initializeDB
 * - Public function that starts DB initialization workflow and returns the connected pool
 */
export const initializeDB = async () => {
  // 1) ensure DB exists
  await setupDatabase();
  // 2) ensure table exists and return pool connected to the target DB
  return await setupTable();
};

