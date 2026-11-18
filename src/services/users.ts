import type { SQLiteDatabase } from 'expo-sqlite';

import { serialized } from '../db/transaction';
import { hashPassword, newSalt, passwordProblem, verifyPassword } from './password';
import { AppError, assertCan, ROLES, type Role, type SessionUser } from './permissions';
import { Checker } from './validate';
import { t } from '../i18n/core';

// UC-01 login and staff account management (Admin only).

export async function login(db: SQLiteDatabase, username: string, password: string): Promise<SessionUser> {
  const row = await db.getFirstAsync<SessionUser & { password_hash: string; password_salt: string; is_active: number }>(
    'SELECT user_id, full_name, username, role, password_hash, password_salt, is_active FROM users WHERE username = ?',
    username.trim()
  );
  // Same message whether the username or the password is wrong.
  if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) throw new AppError(t('auth.loginFailed'));
  if (!row.is_active) throw new AppError(t('auth.deactivated'));
  await db.runAsync("UPDATE users SET last_login_at = datetime('now', 'localtime') WHERE user_id = ?", row.user_id);
  return { user_id: row.user_id, full_name: row.full_name, username: row.username, role: row.role };
}

export type UserInput = { full_name: string; username: string; role: string; password: string };
export type FirstAdministratorInput = Omit<UserInput, 'role'>;

export async function hasAccounts(db: SQLiteDatabase): Promise<boolean> {
  return (await db.getFirstAsync('SELECT 1 FROM users LIMIT 1')) !== null;
}

function checkUsername(c: Checker, username: string) {
  const v = username.trim();
  if (!/^[A-Za-z0-9._]{3,30}$/.test(v)) c.fail('username', t('validate.username'));
  return v;
}

type ValidatedUserInput = Omit<UserInput, 'role'> & { role: Role };

/** Inner insert shared with the seed script. The first administrator also requires an empty users table. */
export async function insertUser(db: SQLiteDatabase, input: ValidatedUserInput, { firstAdministrator = false } = {}) {
  const salt = newSalt();
  const result = await db.runAsync(
    `INSERT INTO users (full_name, username, password_hash, password_salt, role)
     SELECT ?, ?, ?, ?, ?${firstAdministrator ? ' WHERE NOT EXISTS (SELECT 1 FROM users)' : ''}`,
    input.full_name, input.username, hashPassword(input.password, salt), salt, input.role
  );
  if (!result.changes) throw new AppError(t('auth.setupComplete'));
  return result.lastInsertRowId;
}

function validateUser(input: UserInput): ValidatedUserInput {
  const c = new Checker();
  const value = {
    full_name: c.text('full_name', input.full_name, t('field.fullName'), 2, 100),
    username: checkUsername(c, input.username),
    role: c.oneOf('role', input.role, ROLES, t('validate.chooseRole')),
    password: input.password,
  };
  const problem = passwordProblem(input.password);
  if (problem) c.fail('password', problem);
  c.done();
  return value;
}

export async function createFirstAdministrator(db: SQLiteDatabase, input: FirstAdministratorInput) {
  const value = validateUser({ ...input, role: 'ADMIN' });
  // The INSERT checks for existing accounts as part of the write, including across connections.
  return serialized(() => insertUser(db, value, { firstAdministrator: true }));
}

export async function createUser(db: SQLiteDatabase, actor: SessionUser, input: UserInput) {
  assertCan(actor, 'users.manage');
  return insertUser(db, validateUser(input));
}

export async function updateUser(db: SQLiteDatabase, actor: SessionUser, id: number, input: { full_name: string; role: string }) {
  assertCan(actor, 'users.manage');
  const c = new Checker();
  const full_name = c.text('full_name', input.full_name, t('field.fullName'), 2, 100);
  const role = c.oneOf('role', input.role, ROLES, t('validate.chooseRole'));
  c.done();
  await db.runAsync('UPDATE users SET full_name = ?, role = ? WHERE user_id = ?', full_name, role, id);
}

export async function setUserActive(db: SQLiteDatabase, actor: SessionUser, id: number, active: boolean) {
  assertCan(actor, 'users.manage');
  if (!active && id === actor.user_id) throw new AppError(t('auth.cannotDeactivateSelf'));
  await db.runAsync('UPDATE users SET is_active = ? WHERE user_id = ?', active ? 1 : 0, id);
}

export async function resetPassword(db: SQLiteDatabase, actor: SessionUser, id: number, password: string) {
  if (id !== actor.user_id) assertCan(actor, 'users.manage');
  const problem = passwordProblem(password);
  if (problem) throw new AppError(problem);
  const salt = newSalt();
  await db.runAsync('UPDATE users SET password_hash = ?, password_salt = ? WHERE user_id = ?', hashPassword(password, salt), salt, id);
}
