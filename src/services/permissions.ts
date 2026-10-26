// Permission matrix from docs/06-business-rules.md §6.3. Checked in every service function,
// not only by hiding buttons.

export const ROLES = ['ADMIN', 'PHARMACIST', 'CASHIER'] as const;
export type Role = (typeof ROLES)[number];

export type SessionUser = { user_id: number; full_name: string; username: string; role: Role };

const MATRIX = {
  'medicines.write': ['ADMIN', 'PHARMACIST'],
  'categories.write': ['ADMIN'],
  'suppliers.write': ['ADMIN', 'PHARMACIST'],
  'stock.receive': ['ADMIN', 'PHARMACIST'],
  'stock.adjust': ['ADMIN', 'PHARMACIST'],
  'sales.create': ['ADMIN', 'PHARMACIST', 'CASHIER'],
  'sales.prescription': ['ADMIN', 'PHARMACIST'],
  'sales.unlimitedDiscount': ['ADMIN', 'PHARMACIST'],
  'sales.refund': ['ADMIN', 'PHARMACIST'],
  'orders.viewAll': ['ADMIN', 'PHARMACIST'],
  'customers.write': ['ADMIN', 'PHARMACIST', 'CASHIER'],
  'reports.view': ['ADMIN', 'PHARMACIST'],
  'reports.profit': ['ADMIN'],
  'users.manage': ['ADMIN'],
  'settings.manage': ['ADMIN'],
  'backup.manage': ['ADMIN'],
  'sql.console': ['ADMIN'],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof MATRIX;

export const CASHIER_MAX_DISCOUNT_PERCENT = 10;

export const ROLE_LABELS: Record<Role, string> = { ADMIN: 'Administrator', PHARMACIST: 'Pharmacist', CASHIER: 'Cashier' };

export class AppError extends Error {}

export class PermissionError extends AppError {
  constructor(permission: Permission) {
    super(`You don't have permission to do this (${permission}).`);
  }
}

export function can(user: SessionUser | null | undefined, permission: Permission) {
  return !!user && (MATRIX[permission] as readonly Role[]).includes(user.role);
}

export function assertCan(user: SessionUser, permission: Permission) {
  if (!can(user, permission)) throw new PermissionError(permission);
}
