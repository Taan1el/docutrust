import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { defaultDbPath } from '../config.js';

export function createDatabase(dbPath?: string): DatabaseSync {
  const finalPath = dbPath || defaultDbPath;

  // path.dirname(':memory:') resolves harmlessly to '.', which always
  // exists, so in-memory databases (used by the test suite) skip this.
  const dir = path.dirname(finalPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(finalPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  return db;
}
