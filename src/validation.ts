import type { CustomerInput, ProductInput } from './db/repository';

export type Errors<K extends string> = Partial<Record<K, string>>;
type Result<T, K extends string> = { value: T; errors: null } | { value: null; errors: Errors<K> };

export type ProductForm = { name: string; sku: string; category_id: number | null; price: string; quantity: string };

export function validateProduct(form: ProductForm): Result<ProductInput, keyof ProductForm> {
  const errors: Errors<keyof ProductForm> = {};
  const name = form.name.trim();
  const sku = form.sku.trim().toUpperCase();
  const price = Number(form.price.replace(',', '.'));
  const quantity = Number(form.quantity);

  if (!name) errors.name = 'Name is required.';
  else if (name.length > 80) errors.name = 'Name must be 80 characters or fewer.';
  if (!/^[A-Z0-9-]{3,20}$/.test(sku)) errors.sku = 'SKU must be 3–20 letters, digits or dashes.';
  if (form.price.trim() === '' || !Number.isFinite(price) || price < 0) errors.price = 'Enter a price of 0 or more.';
  if (form.quantity.trim() === '' || !Number.isInteger(quantity) || quantity < 0) {
    errors.quantity = 'Enter a whole number of 0 or more.';
  }

  if (Object.keys(errors).length) return { value: null, errors };
  return {
    value: { name, sku, category_id: form.category_id, price: Math.round(price * 100) / 100, quantity },
    errors: null,
  };
}

export type CustomerForm = { name: string; email: string; phone: string; city: string };

export function validateCustomer(form: CustomerForm): Result<CustomerInput, keyof CustomerForm> {
  const errors: Errors<keyof CustomerForm> = {};
  const name = form.name.trim();
  const email = form.email.trim().toLowerCase();
  const phone = form.phone.trim();
  const city = form.city.trim();

  if (!name) errors.name = 'Name is required.';
  else if (name.length > 80) errors.name = 'Name must be 80 characters or fewer.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (phone && !/^[+\d][\d\s()-]{5,19}$/.test(phone)) errors.phone = 'Use digits, spaces, dashes and an optional leading +.';

  if (Object.keys(errors).length) return { value: null, errors };
  return { value: { name, email, phone: phone || null, city: city || null }, errors: null };
}

export function parseQuantity(text: string): number | null {
  const n = Number(text);
  return Number.isInteger(n) && n > 0 ? n : null;
}
