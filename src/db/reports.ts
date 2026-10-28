import type { SQLiteDatabase } from 'expo-sqlite';

import { formatNumber, money } from '../format';
import { t } from '../i18n/core';
import type { Permission } from '../services/permissions';

// Reports from docs/07-reports.md. Each one is a single SQL query over the stored data and returns
// rows for the DataTable component. Sale date = orders.completed_at; net = total − refunded.

export type ReportRange = { from: string; to: string };

export type ReportResult = { columns: string[]; rows: unknown[][]; summary?: string };

type ReportDef = {
  id: string;
  permission: Permission;
  usesRange: boolean;
  run: (db: SQLiteDatabase, range: ReportRange) => Promise<ReportResult>;
};

async function table(db: SQLiteDatabase, sql: string, params: (string | number | null)[]): Promise<ReportResult> {
  const rows = await db.getAllAsync<Record<string, unknown>>(sql, ...params);
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { columns, rows: rows.map((r) => columns.map((c) => r[c])) };
}

const sum = (r: ReportResult, column: string) => {
  const i = r.columns.indexOf(column);
  return i < 0 ? 0 : r.rows.reduce<number>((s, row) => s + Number(row[i] ?? 0), 0);
};

export const REPORTS: ReportDef[] = [
  {
    id: 'sales-daily',
    permission: 'reports.view',
    usesRange: true,
    run: async (db, r) => {
      const res = await table(
        db,
        `SELECT sale_date AS date, COUNT(*) AS orders, SUM(total_amount) AS gross, SUM(refunded_amount) AS refunds,
                SUM(net_amount) AS net, CAST(ROUND(AVG(total_amount)) AS INTEGER) AS avg_order
         FROM v_sales WHERE sale_date BETWEEN ? AND ?
         GROUP BY sale_date ORDER BY sale_date DESC`,
        [r.from, r.to]
      );
      return { ...res, summary: t('report.summary.salesDaily', { orders: formatNumber(sum(res, 'orders')), net: money(sum(res, 'net')) }) };
    },
  },
  {
    id: 'best-sellers',
    permission: 'reports.view',
    usesRange: true,
    run: (db, r) =>
      table(
        db,
        `SELECT m.brand_name || IFNULL(' ' || m.strength, '') AS medicine, c.category_name AS category,
                SUM(oi.quantity - oi.quantity_returned) AS units,
                SUM((oi.quantity - oi.quantity_returned) * oi.unit_price) AS revenue
         FROM order_items oi
         JOIN v_sales s ON s.order_id = oi.order_id
         JOIN medicines m ON m.medicine_id = oi.medicine_id
         JOIN categories c ON c.category_id = m.category_id
         WHERE s.sale_date BETWEEN ? AND ?
         GROUP BY oi.medicine_id HAVING units > 0
         ORDER BY units DESC, revenue DESC LIMIT 20`,
        [r.from, r.to]
      ),
  },
  {
    id: 'sales-category',
    permission: 'reports.view',
    usesRange: true,
    run: (db, r) =>
      table(
        db,
        `SELECT c.category_name AS category, SUM(oi.quantity - oi.quantity_returned) AS units,
                SUM((oi.quantity - oi.quantity_returned) * oi.unit_price) AS revenue
         FROM order_items oi
         JOIN v_sales s ON s.order_id = oi.order_id
         JOIN medicines m ON m.medicine_id = oi.medicine_id
         JOIN categories c ON c.category_id = m.category_id
         WHERE s.sale_date BETWEEN ? AND ?
         GROUP BY c.category_id ORDER BY revenue DESC`,
        [r.from, r.to]
      ),
  },
  {
    id: 'sales-staff',
    permission: 'reports.view',
    usesRange: true,
    run: (db, r) =>
      table(
        db,
        `SELECT staff_name AS staff, payment_method AS payment, COUNT(*) AS orders, SUM(net_amount) AS net
         FROM v_sales WHERE sale_date BETWEEN ? AND ?
         GROUP BY user_id, payment_method ORDER BY staff, net DESC`,
        [r.from, r.to]
      ),
  },
  {
    id: 'low-stock',
    permission: 'reports.view',
    usesRange: false,
    run: (db) =>
      table(
        db,
        `SELECT ms.brand_name || IFNULL(' ' || ms.strength, '') AS medicine, ms.sellable_stock AS sellable,
                ms.min_stock_level AS min_level, MAX(ms.min_stock_level * 2 - ms.sellable_stock, 0) AS suggested_order,
                (SELECT s.supplier_name FROM medicine_batches b JOIN suppliers s ON s.supplier_id = b.supplier_id
                 WHERE b.medicine_id = ms.medicine_id ORDER BY b.received_date DESC LIMIT 1) AS last_supplier
         FROM v_medicine_stock ms
         WHERE ms.is_active = 1 AND ms.stock_state IN ('LOW', 'OUT')
         ORDER BY ms.sellable_stock, medicine`,
        []
      ),
  },
  {
    id: 'expiry',
    permission: 'reports.view',
    usesRange: false,
    run: async (db) => {
      const res = await table(
        db,
        `SELECT batch_state AS state, brand_name || IFNULL(' ' || strength, '') AS medicine, batch_number AS batch,
                supplier_name AS supplier, expiry_date AS expiry, days_to_expiry AS days_left,
                quantity_remaining AS qty, quantity_remaining * purchase_price AS cost_value
         FROM v_batch_status WHERE batch_state IN ('EXPIRED', 'NEAR_EXPIRY')
         ORDER BY expiry_date`,
        []
      );
      return { ...res, summary: t('report.summary.expiry', { value: money(sum(res, 'cost_value')) }) };
    },
  },
  {
    id: 'valuation',
    permission: 'reports.view',
    usesRange: false,
    run: async (db) => {
      const res = await table(
        db,
        `SELECT c.category_name AS category, SUM(bs.quantity_remaining) AS units,
                SUM(bs.quantity_remaining * bs.purchase_price) AS at_cost,
                SUM(bs.quantity_remaining * m.selling_price) AS at_price
         FROM v_batch_status bs
         JOIN medicines m ON m.medicine_id = bs.medicine_id
         JOIN categories c ON c.category_id = m.category_id
         WHERE bs.is_sellable = 1
         GROUP BY c.category_id ORDER BY at_cost DESC`,
        []
      );
      return { ...res, summary: t('report.summary.valuation', { cost: money(sum(res, 'at_cost')), price: money(sum(res, 'at_price')) }) };
    },
  },
  {
    id: 'movements',
    permission: 'reports.view',
    usesRange: true,
    run: (db, r) =>
      table(
        db,
        `SELECT sm.movement_date AS date, m.brand_name AS medicine, b.batch_number AS batch, sm.movement_type AS type,
                sm.quantity_change AS change, u.full_name AS user, o.order_number AS order_no, sm.reason
         FROM stock_movements sm
         JOIN medicine_batches b ON b.batch_id = sm.batch_id
         JOIN medicines m ON m.medicine_id = b.medicine_id
         JOIN users u ON u.user_id = sm.user_id
         LEFT JOIN order_items oi ON oi.order_item_id = sm.order_item_id
         LEFT JOIN orders o ON o.order_id = oi.order_id
         WHERE date(sm.movement_date) BETWEEN ? AND ?
         ORDER BY sm.movement_date DESC, sm.movement_id DESC LIMIT 500`,
        [r.from, r.to]
      ),
  },
  {
    id: 'losses',
    permission: 'reports.view',
    usesRange: true,
    run: async (db, r) => {
      const res = await table(
        db,
        `SELECT date(sm.movement_date) AS date, m.brand_name AS medicine, b.batch_number AS batch, sm.movement_type AS type,
                sm.quantity_change AS change, sm.quantity_change * b.purchase_price AS value, sm.reason, u.full_name AS user
         FROM stock_movements sm
         JOIN medicine_batches b ON b.batch_id = sm.batch_id
         JOIN medicines m ON m.medicine_id = b.medicine_id
         JOIN users u ON u.user_id = sm.user_id
         WHERE sm.movement_type IN ('ADJUSTMENT', 'WRITE_OFF') AND date(sm.movement_date) BETWEEN ? AND ?
         ORDER BY sm.movement_date DESC`,
        [r.from, r.to]
      );
      return { ...res, summary: t('report.summary.losses', { value: money(sum(res, 'value')) }) };
    },
  },
  {
    id: 'profit',
    permission: 'reports.profit',
    usesRange: true,
    run: async (db, r) => {
      const res = await table(
        db,
        `SELECT s.sale_date AS date, SUM(s.net_amount) AS net_sales,
                SUM((SELECT IFNULL(SUM(lc.cost_amount), 0) FROM v_line_cost lc WHERE lc.order_id = s.order_id)) AS cogs,
                SUM(s.net_amount) - SUM((SELECT IFNULL(SUM(lc.cost_amount), 0) FROM v_line_cost lc WHERE lc.order_id = s.order_id)) AS gross_profit
         FROM v_sales s WHERE s.sale_date BETWEEN ? AND ?
         GROUP BY s.sale_date ORDER BY s.sale_date DESC`,
        [r.from, r.to]
      );
      const net = sum(res, 'net_sales');
      const profit = sum(res, 'gross_profit');
      return { ...res, summary: t('report.summary.profit', { profit: money(profit), margin: net ? Math.round((profit / net) * 100) : 0 }) };
    },
  },
  {
    id: 'customers',
    permission: 'reports.view',
    usesRange: true,
    run: (db, r) =>
      table(
        db,
        `SELECT c.full_name AS customer, c.phone, COUNT(s.order_id) AS orders, IFNULL(SUM(s.net_amount), 0) AS spent,
                MAX(s.sale_date) AS last_visit
         FROM customers c JOIN v_sales s ON s.customer_id = c.customer_id
         WHERE s.sale_date BETWEEN ? AND ?
         GROUP BY c.customer_id ORDER BY spent DESC`,
        [r.from, r.to]
      ),
  },
];
