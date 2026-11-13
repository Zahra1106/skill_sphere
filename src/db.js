import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';

// Referential integrity is handled explicitly in the routes (deleting children
// first) so behaviour is identical on a local file and on Turso.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '', photo TEXT, city TEXT, lat REAL, lng REAL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS interests (
    uid TEXT NOT NULL, sub_id TEXT NOT NULL, PRIMARY KEY (uid, sub_id))`,
  `CREATE TABLE IF NOT EXISTS progress (
    uid TEXT NOT NULL, sub_id TEXT NOT NULL, topic_index INTEGER NOT NULL,
    PRIMARY KEY (uid, sub_id, topic_index))`,
  `CREATE TABLE IF NOT EXISTS students (
    uid TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
    gender TEXT NOT NULL, city TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS colleges (
    id INTEGER PRIMARY KEY AUTOINCREMENT, owner_uid TEXT NOT NULL, name TEXT NOT NULL,
    email TEXT NOT NULL, phone TEXT NOT NULL, city TEXT NOT NULL, address TEXT NOT NULL,
    description TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_colleges_owner ON colleges(owner_uid)`,
  `CREATE INDEX IF NOT EXISTS idx_colleges_city ON colleges(city)`,
  `CREATE TABLE IF NOT EXISTS software_houses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, owner_uid TEXT NOT NULL, name TEXT NOT NULL,
    email TEXT NOT NULL, phone TEXT NOT NULL, website TEXT NOT NULL DEFAULT '', city TEXT NOT NULL,
    team_size TEXT NOT NULL, description TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_sh_owner ON software_houses(owner_uid)`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, title TEXT NOT NULL, company TEXT NOT NULL,
    type TEXT NOT NULL, city TEXT NOT NULL, salary TEXT NOT NULL DEFAULT '',
    skills TEXT NOT NULL DEFAULT '', description TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_owner ON jobs(owner_uid)`,
  `CREATE TABLE IF NOT EXISTS applications (
    job_id TEXT NOT NULL, uid TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '', applied_at INTEGER NOT NULL, PRIMARY KEY (job_id, uid))`,
  `CREATE INDEX IF NOT EXISTS idx_applications_uid ON applications(uid)`,
];

const toObjects = (rs) =>
  rs.rows.map((row) => Object.fromEntries(rs.columns.map((col, i) => [col, row[i]])));

/**
 * Opens the database (local file or Turso) and creates the tables if needed.
 * Returns a tiny async helper so routes never touch the driver directly.
 */
export async function openDb({ url, authToken }) {
  if (url.startsWith('file:') && !url.includes(':memory:')) {
    try {
      fs.mkdirSync(path.dirname(path.resolve(url.slice('file:'.length))), { recursive: true });
    } catch (err) {
      throw new Error(
        `Cannot create the database folder (${err.code}). This host has a read-only filesystem: ` +
          'set DATABASE_URL to a Turso libsql:// URL and DATABASE_AUTH_TOKEN.',
      );
    }
  }
  const client = createClient({ url, authToken });
  await client.batch(SCHEMA, 'write');

  const all = async (sql, args = []) => toObjects(await client.execute({ sql, args }));
  return {
    all,
    get: async (sql, args = []) => (await all(sql, args))[0],
    run: async (sql, args = []) => {
      const rs = await client.execute({ sql, args });
      return {
        changes: rs.rowsAffected,
        lastInsertRowid: rs.lastInsertRowid == null ? null : Number(rs.lastInsertRowid),
      };
    },
    /** Runs [[sql, args], ...] atomically (all or nothing). */
    batch: (statements) =>
      client.batch(statements.map(([sql, args = []]) => ({ sql, args })), 'write'),
    close: () => client.close(),
  };
}