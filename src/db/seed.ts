import type { SQLiteDatabase } from 'expo-sqlite';

import { insertBatch } from '../services/inventory';
import type { Role, SessionUser } from '../services/permissions';
import { applyRefund, recordSale, type PaymentMethod } from '../services/sales';
import { insertUser } from '../services/users';

// Demo data. Runs inside migrate()'s transaction and goes through the same inner service functions
// as the app, so every batch has a RECEIPT movement and every sale is allocated FEFO.

export const DEMO_ACCOUNTS: { username: string; password: string; full_name: string; role: Role }[] = [
  { username: 'admin', password: 'admin123', full_name: 'Oyuna Batbayar', role: 'ADMIN' },
  { username: 'pharmacist', password: 'pharm123', full_name: 'Bat-Erdene Ganbold', role: 'PHARMACIST' },
  { username: 'cashier', password: 'cashier123', full_name: 'Sarnai Dorj', role: 'CASHIER' },
];

const categories: [string, string][] = [
  ['Pain relief & fever', 'Analgesics and antipyretics'],
  ['Antibiotics', 'Prescription-only antibacterials'],
  ['Vitamins & supplements', 'Vitamins, minerals, supplements'],
  ['Cold, cough & allergy', 'Antihistamines, cough syrups, decongestants'],
  ['Digestive health', 'Antacids, rehydration, laxatives'],
  ['Heart & blood pressure', 'Prescription cardiovascular medicines'],
  ['First aid', 'Antiseptics, dressings, devices'],
  ['Skin care', 'Creams and ointments'],
];

const suppliers: [string, string, string, string][] = [
  ['Altai Med Supply LLC', 'Enkhjin T.', '+976 7011 2233', 'orders@altaimed.example.mn'],
  ['Khangai Pharma Distribution', 'Ganzorig B.', '+976 7722 4455', 'sales@khangaipharma.example.mn'],
  ['Steppe Health Wholesale', 'Nomin A.', '+976 7575 8899', 'info@steppehealth.example.mn'],
  ['Orkhon Medical Trading', 'Temuulen D.', '+976 7088 1100', 'contact@orkhonmed.example.mn'],
];

// [brand, generic, strength, form, unit, category#, price, min, rx, barcode]
type MedicineRow = [string, string, string | null, string, string, number, number, number, 0 | 1, string | null];
const medicines: MedicineRow[] = [
  ['ParaCare', 'Paracetamol', '500 mg', 'TABLET', 'box of 20', 0, 2500, 30, 0, '4810001000011'],
  ['IbuFast', 'Ibuprofen', '400 mg', 'TABLET', 'box of 20', 0, 4200, 20, 0, '4810001000028'],
  ['ParaCare Kids', 'Paracetamol', '120 mg/5 ml', 'SYRUP', 'bottle 100 ml', 0, 6800, 10, 0, '4810001000035'],
  ['AspiCor', 'Acetylsalicylic acid', '100 mg', 'TABLET', 'box of 30', 5, 3900, 15, 0, null],
  ['Amoxil-M', 'Amoxicillin', '500 mg', 'CAPSULE', 'box of 16', 1, 8900, 15, 1, '4810002000010'],
  ['Azimed', 'Azithromycin', '500 mg', 'TABLET', 'box of 3', 1, 12500, 8, 1, '4810002000027'],
  ['Ciproxin-M', 'Ciprofloxacin', '500 mg', 'TABLET', 'box of 10', 1, 9800, 8, 1, null],
  ['VitaC Max', 'Ascorbic acid', '1000 mg', 'TABLET', 'tube of 20', 2, 12000, 15, 0, '4810003000019'],
  ['D3 Sun', 'Cholecalciferol', '2000 IU', 'CAPSULE', 'box of 60', 2, 18500, 10, 0, '4810003000026'],
  ['ZincPlus', 'Zinc gluconate', '25 mg', 'TABLET', 'box of 30', 2, 9500, 10, 0, null],
  ['Loratin', 'Loratadine', '10 mg', 'TABLET', 'box of 10', 3, 5600, 12, 0, '4810004000018'],
  ['Cetrin', 'Cetirizine', '10 mg', 'TABLET', 'box of 20', 3, 6900, 12, 0, null],
  ['BroncoSyr', 'Ambroxol', '15 mg/5 ml', 'SYRUP', 'bottle 100 ml', 3, 7400, 10, 0, '4810004000025'],
  ['NasoClear', 'Xylometazoline', '0.1 %', 'SPRAY', 'bottle 10 ml', 3, 5900, 10, 0, null],
  ['Omez', 'Omeprazole', '20 mg', 'CAPSULE', 'box of 30', 4, 11200, 10, 0, '4810005000017'],
  ['ReHydra', 'Oral rehydration salts', null, 'POWDER', 'sachet', 4, 900, 40, 0, null],
  ['Loperam', 'Loperamide', '2 mg', 'CAPSULE', 'box of 10', 4, 3600, 10, 0, null],
  ['Amlodip', 'Amlodipine', '5 mg', 'TABLET', 'box of 30', 5, 7800, 10, 1, '4810006000016'],
  ['Losarta', 'Losartan', '50 mg', 'TABLET', 'box of 30', 5, 10400, 10, 1, null],
  ['Betadine-M', 'Povidone-iodine', '10 %', 'OTHER', 'bottle 50 ml', 6, 6500, 8, 0, '4810007000015'],
  ['FlexiBand', 'Adhesive bandages', null, 'DEVICE', 'box of 40', 6, 3200, 10, 0, null],
  ['DigiTherm', 'Digital thermometer', null, 'DEVICE', 'piece', 6, 15000, 3, 0, '4810007000022'],
  ['Hydrocort-M', 'Hydrocortisone', '1 %', 'CREAM', 'tube 15 g', 7, 6200, 6, 0, null],
  ['Panthen', 'Dexpanthenol', '5 %', 'OINTMENT', 'tube 30 g', 7, 8700, 6, 0, null],
];

// [medicine#, supplier#, batch, qty, cost, received days ago, expiry days from today]
// A few batches are deliberately expired / near expiry / low so the dashboard has alerts.
const batches: [number, number, string, number, number, number, number][] = [
  [0, 0, 'PC2504A', 60, 1500, 120, 40], // near expiry, FEFO takes it first
  [0, 1, 'PC2509B', 120, 1450, 45, 520],
  [1, 0, 'IB2502', 80, 2700, 100, 300],
  [2, 2, 'PK2411', 20, 4500, 150, 25],
  [2, 2, 'PK2508', 30, 4400, 50, 400],
  [3, 3, 'AS2501', 40, 2400, 90, 600],
  [4, 1, 'AMX2503', 40, 6100, 80, 330],
  [5, 1, 'AZ2502', 16, 8800, 70, 280],
  [6, 1, 'CP2404', 12, 6600, 200, -12], // expired, still on the shelf
  [6, 1, 'CP2506', 10, 6500, 60, 380],
  [7, 2, 'VC2503', 70, 7800, 75, 420],
  [8, 2, 'D32502', 30, 12400, 85, 700],
  [9, 2, 'ZN2412', 25, 6000, 140, 60],
  [10, 0, 'LR2501', 40, 3500, 95, 520],
  [11, 0, 'CT2505', 18, 4300, 55, 610],
  [12, 3, 'BR2410', 15, 4800, 160, -3], // expired
  [12, 3, 'BR2507', 24, 4700, 40, 450],
  [13, 3, 'NC2504', 20, 3600, 65, 480],
  [14, 1, 'OM2502', 35, 7400, 88, 540],
  [15, 2, 'RH2501', 150, 450, 92, 800],
  [16, 0, 'LP2503', 14, 2200, 76, 390],
  [17, 1, 'AML2502', 30, 4900, 84, 460],
  [18, 1, 'LS2504', 6, 6900, 62, 500], // low stock
  [19, 3, 'BT2501', 25, 4100, 98, 900],
  [20, 3, 'FB2502', 30, 1900, 87, 1000],
  [21, 3, 'DT2412', 6, 9800, 130, 1500],
  [22, 0, 'HC2503', 12, 3900, 70, 75],
  [23, 0, 'PT2502', 10, 5600, 82, 410],
];

const customers: [string, string | null, string | null][] = [
  ['Naraa Tsogt', '+976 9911 2233', 'naraa.t@example.com'],
  ['Ganbaatar Dorj', '+976 8800 4455', null],
  ['Erdenechimeg Bold', '+976 9595 1212', 'chimeg.b@example.com'],
  ['Munkhbat Sukh', '+976 9090 3434', null],
  ['Aiko Tanaka', '+81 90 1234 5678', 'aiko.tanaka@example.com'],
  ['Khulan Enkh', '+976 8686 7878', null],
];

// [days ago, hour, cashier(0)/pharmacist(1), customer# or null, payment, [[medicine#, qty]...]]
const sales: [number, number, 0 | 1, number | null, PaymentMethod, [number, number][]][] = [
  [28, 10, 0, null, 'CASH', [[0, 2], [10, 1]]],
  [27, 15, 0, 0, 'CARD', [[7, 1], [15, 4]]],
  [25, 11, 1, 2, 'QPAY', [[1, 1], [13, 1]]],
  [24, 17, 0, null, 'CASH', [[19, 1], [20, 1]]],
  [22, 9, 1, 3, 'CARD', [[14, 2]]],
  [21, 13, 0, null, 'CASH', [[0, 3], [12, 1]]],
  [19, 16, 0, 1, 'QPAY', [[8, 1], [9, 1]]],
  [17, 12, 1, null, 'CASH', [[2, 1], [0, 1]]],
  [15, 10, 0, 4, 'CARD', [[11, 2], [7, 1]]],
  [13, 18, 0, null, 'CASH', [[16, 2], [15, 6]]],
  [12, 11, 1, 5, 'QPAY', [[22, 1], [23, 1]]],
  [10, 14, 0, null, 'CASH', [[0, 4]]],
  [9, 9, 0, 0, 'CARD', [[10, 2], [13, 1]]],
  [7, 15, 1, null, 'CASH', [[1, 2], [7, 1]]],
  [6, 12, 0, 2, 'QPAY', [[21, 1]]],
  [5, 10, 0, null, 'CASH', [[0, 2], [15, 3], [19, 1]]],
  [4, 16, 1, 3, 'CARD', [[14, 1], [3, 1]]],
  [3, 11, 0, null, 'CASH', [[11, 1], [12, 1]]],
  [2, 13, 0, 1, 'QPAY', [[8, 1]]],
  [1, 10, 1, null, 'CARD', [[0, 3], [20, 2]]],
  [1, 17, 0, 4, 'CASH', [[7, 2], [9, 1]]],
  [0, 9, 0, null, 'CASH', [[0, 1], [16, 1]]],
];

// Prescription sales by the pharmacist: [days ago, customer#, medicine#, qty, prescriber, number]
const rxSales: [number, number, number, number, string, string][] = [
  [20, 2, 4, 1, 'Dr. Altantsetseg', 'RX-20-1187'],
  [11, 3, 17, 2, 'Dr. Purevdorj', 'RX-11-0442'],
  [3, 0, 5, 1, 'Dr. Altantsetseg', 'RX-03-1290'],
];

async function at(db: SQLiteDatabase, modifier: string) {
  const row = await db.getFirstAsync<{ v: string }>(`SELECT datetime('now', 'localtime', ${modifier}) AS v`);
  return row!.v;
}

async function dateAt(db: SQLiteDatabase, days: number) {
  const row = await db.getFirstAsync<{ v: string }>("SELECT date('now', 'localtime', ? || ' days') AS v", String(days));
  return row!.v;
}

export async function seed(db: SQLiteDatabase) {
  const staff: SessionUser[] = [];
  for (const a of DEMO_ACCOUNTS) {
    const user_id = await insertUser(db, a);
    staff.push({ user_id, full_name: a.full_name, username: a.username, role: a.role });
  }
  const [admin, pharmacist, cashier] = staff;

  const categoryIds: number[] = [];
  for (const [name, description] of categories) {
    const r = await db.runAsync('INSERT INTO categories (category_name, description) VALUES (?, ?)', name, description);
    categoryIds.push(r.lastInsertRowId);
  }

  const supplierIds: number[] = [];
  for (const [name, contact, phone, email] of suppliers) {
    const r = await db.runAsync(
      'INSERT INTO suppliers (supplier_name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)',
      name, contact, phone, email, 'Ulaanbaatar, Mongolia'
    );
    supplierIds.push(r.lastInsertRowId);
  }

  const medicineIds: number[] = [];
  for (const [brand, generic, strength, form, unit, cat, price, min, rx, barcode] of medicines) {
    const r = await db.runAsync(
      `INSERT INTO medicines (category_id, brand_name, generic_name, strength, dosage_form, unit, barcode,
                              selling_price, min_stock_level, requires_prescription, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime', '-200 days'), datetime('now', 'localtime', '-200 days'))`,
      categoryIds[cat], brand, generic, strength, form, unit, barcode, price, min, rx
    );
    medicineIds.push(r.lastInsertRowId);
  }

  const batchIds: number[] = [];
  for (const [med, sup, number, qty, cost, receivedAgo, expiresIn] of batches) {
    const received = await dateAt(db, -receivedAgo);
    batchIds.push(
      await insertBatch(db, pharmacist.user_id, {
        medicine_id: medicineIds[med],
        supplier_id: supplierIds[sup],
        batch_number: number,
        quantity: qty,
        purchase_price: cost,
        received_date: received,
        expiry_date: await dateAt(db, expiresIn),
        movement_date: `${received} 09:30:00`,
      })
    );
  }

  const customerIds: number[] = [];
  for (const [name, phone, email] of customers) {
    const r = await db.runAsync(
      "INSERT INTO customers (full_name, phone, email, created_at) VALUES (?, ?, ?, datetime('now', 'localtime', '-60 days'))",
      name, phone, email
    );
    customerIds.push(r.lastInsertRowId);
  }

  for (const [daysAgo, hour, who, customer, payment, items] of sales) {
    await recordSale(
      db,
      who === 0 ? cashier : pharmacist,
      {
        customer_id: customer === null ? null : customerIds[customer],
        payment_method: payment,
        lines: items.map(([m, quantity]) => ({ medicine_id: medicineIds[m], quantity })),
      },
      await at(db, `'-${daysAgo} days', 'start of day', '+${hour} hours', '+${(daysAgo * 7) % 50} minutes'`)
    );
  }

  for (const [daysAgo, customer, med, qty, prescriber, number] of rxSales) {
    const issued = await dateAt(db, -daysAgo - 1);
    const rx = await db.runAsync(
      `INSERT INTO prescriptions (customer_id, verified_by, patient_name, prescriber_name, prescription_number, issue_date, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      customerIds[customer], pharmacist.user_id, customers[customer][0], prescriber, number, issued,
      await at(db, `'-${daysAgo} days', 'start of day', '+14 hours'`)
    );
    await recordSale(
      db,
      pharmacist,
      {
        customer_id: customerIds[customer],
        payment_method: 'CARD',
        lines: [{ medicine_id: medicineIds[med], quantity: qty, prescription_id: rx.lastInsertRowId }],
      },
      await at(db, `'-${daysAgo} days', 'start of day', '+14 hours', '+5 minutes'`)
    );
  }

  // A partial refund: one unopened box of Vitamin C returned and put back on the shelf.
  const refundable = await db.getFirstAsync<{ order_id: number; order_item_id: number }>(
    `SELECT oi.order_id, oi.order_item_id FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
     WHERE oi.medicine_id = ? AND o.status = 'COMPLETED' ORDER BY o.completed_at DESC LIMIT 1`,
    medicineIds[7]
  );
  if (refundable) {
    await applyRefund(
      db,
      pharmacist,
      { order_id: refundable.order_id, lines: [{ order_item_id: refundable.order_item_id, quantity: 1 }], reason: 'Customer bought a duplicate, box unopened', restock: true },
      await at(db, "'-1 days', 'start of day', '+18 hours'")
    );
  }

  // A stock count correction and a damaged item.
  await db.runAsync(
    "INSERT INTO stock_movements (batch_id, user_id, movement_type, quantity_change, reason, movement_date) VALUES (?, ?, 'ADJUSTMENT', -1, ?, ?)",
    batchIds[13], admin.user_id, 'Monthly count: 1 box missing', await at(db, "'-8 days', 'start of day', '+19 hours'")
  );
  await db.runAsync(
    "INSERT INTO stock_movements (batch_id, user_id, movement_type, quantity_change, reason, movement_date) VALUES (?, ?, 'WRITE_OFF', -1, ?, ?)",
    batchIds[16], pharmacist.user_id, 'Bottle cracked on delivery', await at(db, "'-35 days', 'start of day', '+12 hours'")
  );
}
