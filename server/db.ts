import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BackupFileInfo } from '../src/types.ts';

const DATA_DIR = process.env.SKLAD_DATA_DIR
  ? path.resolve(process.env.SKLAD_DATA_DIR)
  : path.resolve(process.cwd(), 'data');

const DB_PATH = process.env.SKLAD_DB_PATH
  ? path.resolve(process.env.SKLAD_DB_PATH)
  : path.join(DATA_DIR, 'sklad.db');

const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 30;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(keyBuf, derived);
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      base_unit TEXT NOT NULL,
      specific_weight REAL,
      rod_length REAL,
      min_stock REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_number TEXT NOT NULL UNIQUE,
      doc_type TEXT NOT NULL CHECK (doc_type IN ('income', 'expense', 'adjustment')),
      doc_date TEXT NOT NULL,
      counterparty TEXT NOT NULL DEFAULT '',
      through_whom TEXT NOT NULL DEFAULT '',
      basis TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
      cancelled_at TEXT,
      cancel_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(doc_date);
    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(doc_type);
    CREATE INDEX IF NOT EXISTS idx_documents_counterparty ON documents(counterparty);

    CREATE TABLE IF NOT EXISTS document_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      input_qty REAL NOT NULL,
      input_unit TEXT NOT NULL,
      base_qty REAL NOT NULL,
      specific_weight_snapshot REAL,
      rod_length_snapshot REAL
    );

    CREATE INDEX IF NOT EXISTS idx_document_lines_doc ON document_lines(document_id);
    CREATE INDEX IF NOT EXISTS idx_document_lines_mat ON document_lines(material_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS doc_counters (
      counter_key TEXT PRIMARY KEY,
      last_number INTEGER NOT NULL DEFAULT 0
    );
  `);

  seedInitialMaterials();
  seedInitialSettings();
}

function seedInitialMaterials(): void {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM materials').get() as { cnt: number };
  if (row.cnt > 0) return;

  const initialMaterials: Array<{
    name: string;
    base_unit: string;
    specific_weight: number | null;
    rod_length: number | null;
  }> = [
    { name: 'Кирпич', base_unit: 'шт', specific_weight: null, rod_length: null },
    { name: 'Арматура ∅10', base_unit: 'кг', specific_weight: 0.617, rod_length: 12 },
    { name: 'Арматура ∅12', base_unit: 'кг', specific_weight: 0.888, rod_length: 12 },
    { name: 'Арматура ∅18', base_unit: 'кг', specific_weight: 2.0, rod_length: 12 },
    { name: 'Труба проф. 20×40×2', base_unit: 'м', specific_weight: null, rod_length: null },
    { name: 'Труба проф. 40×40×2', base_unit: 'м', specific_weight: null, rod_length: null },
    { name: 'Труба проф. 60×40×3', base_unit: 'м', specific_weight: null, rod_length: null },
    { name: 'Уголок 100×100×7', base_unit: 'м', specific_weight: null, rod_length: null },
    { name: 'Цемент, мешок 50 кг', base_unit: 'шт', specific_weight: null, rod_length: null },
    { name: 'Цемент, биг-бэг 1500 кг', base_unit: 'шт', specific_weight: null, rod_length: null },
    { name: 'Штукатурка гипсовая, 50 кг', base_unit: 'шт', specific_weight: null, rod_length: null },
    { name: 'Штукатурка цементная, 50 кг', base_unit: 'шт', specific_weight: null, rod_length: null },
  ];

  const insert = db.prepare(`
    INSERT INTO materials (name, base_unit, specific_weight, rod_length, min_stock, is_active)
    VALUES (@name, @base_unit, @specific_weight, @rod_length, NULL, 1)
  `);

  const insertAll = db.transaction(() => {
    for (const item of initialMaterials) {
      insert.run(item);
    }
  });
  insertAll();
}

function seedInitialSettings(): void {
  const defaults: Record<string, string> = {
    organization_name: 'ООО «Склад»',
    director_name: '',
    accountant_name: '',
    warehouse_manager_name: '',
    issued_by_name: '',
    received_by_name: '',
    numbering_mode: 'continuous',
    auth_secret: crypto.randomBytes(32).toString('hex'),
    password_hash: hashPassword(process.env.SKLAD_INITIAL_PASSWORD || '1234'),
    is_default_password: '1',
  };

  const insertOrIgnore = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const seedAll = db.transaction(() => {
    for (const [key, value] of Object.entries(defaults)) {
      insertOrIgnore.run(key, value);
    }
  });
  seedAll();
}

export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export function getNextDocNumber(docType: 'income' | 'expense' | 'adjustment', docDate: string): string {
  const prefix = docType === 'income' ? 'П' : docType === 'expense' ? 'Р' : 'К';
  const mode = getSetting('numbering_mode', 'continuous');
  const yearShort = docDate.slice(2, 4) || String(new Date().getFullYear()).slice(2, 4);

  const counterKey = mode === 'yearly' ? `${prefix}_${yearShort}` : prefix;

  db.prepare(`
    INSERT INTO doc_counters (counter_key, last_number) VALUES (?, 0)
    ON CONFLICT(counter_key) DO NOTHING
  `).run(counterKey);

  db.prepare(`
    UPDATE doc_counters SET last_number = last_number + 1 WHERE counter_key = ?
  `).run(counterKey);

  const row = db.prepare('SELECT last_number FROM doc_counters WHERE counter_key = ?').get(counterKey) as {
    last_number: number;
  };

  const padded = String(row.last_number).padStart(6, '0');
  return mode === 'yearly' ? `${prefix}-${padded}/${yearShort}` : `${prefix}-${padded}`;
}

export async function createBackup(tag = 'auto'): Promise<BackupFileInfo> {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const safeTag = tag.replace(/[^a-z0-9_-]/gi, '');
  const filename = `sklad_${stamp}_${safeTag}.db`;
  const destPath = path.join(BACKUPS_DIR, filename);

  await db.backup(destPath);
  pruneOldBackups();

  const stat = fs.statSync(destPath);
  return {
    filename,
    size_bytes: stat.size,
    created_at: stat.mtime.toISOString(),
  };
}

export function listBackups(): BackupFileInfo[] {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  const entries = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((filename) => {
      const full = path.join(BACKUPS_DIR, filename);
      const stat = fs.statSync(full);
      return {
        filename,
        size_bytes: stat.size,
        created_at: stat.mtime.toISOString(),
        mtimeMs: stat.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return entries.map(({ filename, size_bytes, created_at }) => ({
    filename,
    size_bytes,
    created_at,
  }));
}

export function getBackupFilePath(filename: string): string | null {
  const safeName = path.basename(filename);
  if (!/^sklad_[0-9_]+_[a-z0-9_-]+\.db$/i.test(safeName)) {
    return null;
  }
  const fullPath = path.join(BACKUPS_DIR, safeName);
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
}

function pruneOldBackups(): void {
  if (!fs.existsSync(BACKUPS_DIR)) return;
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((filename) => ({
      filename,
      mtimeMs: fs.statSync(path.join(BACKUPS_DIR, filename)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (files.length <= MAX_BACKUPS) return;
  for (const oldFile of files.slice(MAX_BACKUPS)) {
    try {
      fs.unlinkSync(path.join(BACKUPS_DIR, oldFile.filename));
    } catch {
      // ignore unlink failures
    }
  }
}

export function startDailyBackupScheduler(): void {
  const ensureTodayBackup = () => {
    const now = new Date();
    const todayPrefix = `sklad_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}_`;
    const existing = fs.existsSync(BACKUPS_DIR)
      ? fs.readdirSync(BACKUPS_DIR).some((f) => f.startsWith(todayPrefix) && f.endsWith('.db'))
      : false;

    if (!existing) {
      createBackup('daily').catch((err) => {
        console.error('Daily backup failed:', err);
      });
    }
  };

  ensureTodayBackup();
  const timer = setInterval(ensureTodayBackup, 60 * 60 * 1000);
  timer.unref();
}
