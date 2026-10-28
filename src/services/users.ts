import type { SQLiteDatabase } from 'expo-sqlite';

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

function checkUsername(c: Checker, username: string) {
  const v = username.trim();
  if (!/^[A-Za-z0-9._]{3,30}$/.test(v)) c.fail('username', t('validate.username'));
  return v;
}

/** Inner insert shared with the seed script (no permission check). */
export async function insertUser(db: SQLiteDatabase, input: { full_name: string; username: string; role: Role; password: string }) {
  const salt = newSalt();
  const result = await db.runAsync(
    'INSERT INTO users (full_name, username, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?)',
    input.full_name, input.username, hashPassword(input.password, salt), salt, input.role
  );
  return result.lastInsertRowId;
}

export async function createUser(db: SQLiteDatabase, actor: SessionUser, input: UserInput) {
  assertCan(actor, 'users.manage');
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
  return insertUser(db, value);
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
