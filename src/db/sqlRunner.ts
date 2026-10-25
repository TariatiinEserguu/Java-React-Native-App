import type { SQLiteDatabase } from 'expo-sqlite';

import { sqliteMessage } from './errors';
import { HISTORY_TABLE_SQL, quoteIdent } from './schema';

export type StatementResult = {
  sql: string;
  /** First keyword(s), e.g. "SELECT", "INSERT", "CREATE TABLE". */
  command: string;
  columns: string[];
  rows: unknown[][];
  /** Set for INSERT / UPDATE / DELETE / REPLACE. */
  rowsAffected?: number;
  lastInsertRowId?: number;
};

export type RunOutcome = {
  results: StatementResult[];
  error?: { message: string; statement: string; index: number };
  durationMs: number;
  /** False only if every statement that ran was a read. */
  changedData: boolean;
};

const WRITE_COMMANDS = ['INSERT', 'UPDATE', 'DELETE', 'REPLACE'];

function stripLeadingComments(sql: string) {
  let s = sql.trimStart();
  while (s.startsWith('--') || s.startsWith('/*')) {
    const end = s.startsWith('--') ? s.indexOf('\n') : s.indexOf('*/');
    s = end === -1 ? '' : s.slice(end + (s.startsWith('--') ? 1 : 2)).trimStart();
  }
  return s;
}

export function commandOf(sql: string) {
  const words = stripLeadingComments(sql).split(/\s+/, 3).map((w) => w.toUpperCase());
  if (words[0] === 'CREATE' || words[0] === 'DROP' || words[0] === 'ALTER') {
    // "CREATE TABLE", "CREATE UNIQUE INDEX" -> "CREATE INDEX", "DROP VIEW", ...
    const target = ['UNIQUE', 'TEMP', 'TEMPORARY', 'VIRTUAL'].includes(words[1]) ? words[2] : words[1];
    return `${words[0]} ${target ?? ''}`.trim();
  }
  return words[0] ?? '';
}

function isReadOnly(sql: string) {
  const command = commandOf(sql);
  if (command === 'SELECT' || command === 'EXPLAIN' || command === 'VALUES') return true;
  if (command === 'PRAGMA') return !sql.includes('=');
  if (command === 'WITH') return !/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);
  return false;
}

/**
 * Splits a script into statements on `;`, ignoring semicolons inside quotes,
 * comments, and CREATE TRIGGER ... END bodies.
 */
export function splitStatements(script: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  const push = () => {
    if (stripLeadingComments(current).trim()) statements.push(current.trim());
    current = '';
  };

  while (i < script.length) {
    const ch = script[i];
    const next = script[i + 1];

    if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch;
      let j = i + 1;
      while (j < script.length) {
        if (script[j] === close) {
          // Doubled quote ('' or "") is an escape, not the end.
          if (close !== ']' && script[j + 1] === close) j += 2;
          else break;
        } else j++;
      }
      current += script.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '-' && next === '-') {
      const end = script.indexOf('\n', i);
      const stop = end === -1 ? script.length : end;
      current += script.slice(i, stop);
      i = stop;
    } else if (ch === '/' && next === '*') {
      const end = script.indexOf('*/', i + 2);
      const stop = end === -1 ? script.length : end + 2;
      current += script.slice(i, stop);
      i = stop;
    } else if (ch === ';') {
      const inTrigger =
        /^CREATE\s+(TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i.test(stripLeadingComments(current)) &&
        !/\bEND\s*$/i.test(current);
      if (inTrigger) current += ch;
      else push();
      i++;
    } else {
      current += ch;
      i++;
    }
  }
  push();
  return statements;
}

async function runStatement(db: SQLiteDatabase, sql: string): Promise<StatementResult> {
  const command = commandOf(sql);
  const statement = await db.prepareAsync(sql);
  try {
    // Raw (array) rows keep duplicate column names such as "id" from two joined tables.
    const result = await statement.executeForRawResultAsync();
    const columns = await statement.getColumnNamesAsync();
    const rows = columns.length > 0 ? await result.getAllAsync() : [];
    const isWrite = WRITE_COMMANDS.includes(command);
    return {
      sql,
      command,
      columns,
      rows,
      rowsAffected: isWrite ? result.changes : undefined,
      lastInsertRowId: command === 'INSERT' || command === 'REPLACE' ? result.lastInsertRowId : undefined,
    };
  } finally {
    await statement.finalizeAsync();
  }
}

/** Executes each statement in order against the app database, stopping at the first error. */
export async function runScript(db: SQLiteDatabase, script: string): Promise<RunOutcome> {
  const started = Date.now();
  const statements = splitStatements(script);
  const results: StatementResult[] = [];
  let changedData = false;

  for (let index = 0; index < statements.length; index++) {
    const sql = statements[index];
    if (!isReadOnly(sql)) changedData = true;
    try {
      results.push(await runStatement(db, sql));
    } catch (error) {
      return {
        results,
        error: { message: sqliteMessage(error), statement: sql, index },
        durationMs: Date.now() - started,
        changedData,
      };
    }
  }
  return { results, durationMs: Date.now() - started, changedData };
}

// ---- Query history (stored in the database itself) ----

export type HistoryEntry = { id: number; sql: string; status: 'success' | 'error'; executed_at: string };

const HISTORY_LIMIT = 50;

export async function addHistory(db: SQLiteDatabase, sql: string, status: HistoryEntry['status']) {
  // Re-create in case the user dropped it from the editor.
  await db.execAsync(HISTORY_TABLE_SQL);
  await db.runAsync('INSERT INTO query_history (sql, status) VALUES (?, ?)', sql.trim(), status);
  await db.runAsync(
    'DELETE FROM query_history WHERE id NOT IN (SELECT id FROM query_history ORDER BY id DESC LIMIT ?)',
    HISTORY_LIMIT
  );
}

export async function listHistory(db: SQLiteDatabase): Promise<HistoryEntry[]> {
  try {
    return await db.getAllAsync<HistoryEntry>('SELECT * FROM query_history ORDER BY id DESC LIMIT 20');
  } catch {
    return []; // table was dropped; it is re-created on the next run
  }
}

export async function clearHistory(db: SQLiteDatabase) {
  await db.execAsync(HISTORY_TABLE_SQL + 'DELETE FROM query_history;');
}

// ---- Schema browser ----

export type TableInfo = { name: string; type: 'table' | 'view'; sql: string | null; rowCount: number | null };

export async function listTables(db: SQLiteDatabase): Promise<TableInfo[]> {
  const objects = await db.getAllAsync<{ name: string; type: 'table' | 'view'; sql: string | null }>(
    "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
  );
  return Promise.all(
    objects.map(async (o) => {
      try {
        const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${quoteIdent(o.name)}`);
        return { ...o, rowCount: row?.n ?? 0 };
      } catch {
        return { ...o, rowCount: null }; // e.g. a view referencing a dropped table
      }
    })
  );
}

export type ColumnInfo = { cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number };
export type ForeignKeyInfo = { from: string; table: string; to: string; on_delete: string };

export async function describeTable(db: SQLiteDatabase, table: string) {
  const quoted = quoteIdent(table);
  const columns = await db.getAllAsync<ColumnInfo>(`PRAGMA table_info(${quoted})`);
  const foreignKeys = await db.getAllAsync<ForeignKeyInfo>(`PRAGMA foreign_key_list(${quoted})`);
  const indexes = await db.getAllAsync<{ name: string; unique: number }>(`PRAGMA index_list(${quoted})`);
  return { columns, foreignKeys, indexes };
}

export async function readTablePage(db: SQLiteDatabase, table: string, limit: number, offset: number) {
  const outcome = await runStatement(db, `SELECT * FROM ${quoteIdent(table)} LIMIT ${limit} OFFSET ${offset}`);
  return { columns: outcome.columns, rows: outcome.rows };
}
