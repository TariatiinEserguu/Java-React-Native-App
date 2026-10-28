// Translation checks: both dictionaries agree, and messages produced by services follow the active language.
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { friendlyError } from '../src/db/errors';
import { dateTime, daysLabel, money, shortDate } from '../src/format';
import { getLanguage, setLanguage, t, tn, tryT } from '../src/i18n/core';
import { en } from '../src/i18n/locales/en';
import { mn } from '../src/i18n/locales/mn';
import { passwordProblem } from '../src/services/password';
import { Checker, ValidationError } from '../src/services/validate';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setLanguage('en'));

describe('dictionaries', () => {
  test('Mongolian has exactly the English keys', () => {
    assert.deepEqual(Object.keys(mn).sort(), Object.keys(en).sort());
  });

  test('every translation keeps the same placeholders as the English text', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      assert.deepEqual(placeholders(mn[key]), placeholders(en[key]), `placeholders differ for ${key}`);
    }
  });

  test('no translation is empty', () => {
    for (const [key, text] of Object.entries(mn)) assert.ok(text.trim().length > 0, `empty Mongolian text for ${key}`);
  });
});

describe('language switching', () => {
  test('t() follows the active language and fills placeholders', () => {
    setLanguage('mn');
    assert.equal(getLanguage(), 'mn');
    assert.equal(t('login.submit'), 'Нэвтрэх');
    setLanguage('en');
    assert.equal(t('login.submit'), 'Log in');
    assert.equal(t('dashboard.greeting', { name: 'Oyuna' }), 'Hello, Oyuna');
  });

  test('plurals: English inflects, Mongolian does not', () => {
    assert.equal(tn('count.orders', 1), '1 order');
    assert.equal(tn('count.orders', 3), '3 orders');
    setLanguage('mn');
    assert.equal(tn('count.orders', 1), '1 захиалга');
    assert.equal(tn('count.orders', 3), '3 захиалга');
  });

  test('tryT returns null for unknown keys instead of throwing', () => {
    assert.equal(tryT('reportCol.net'), 'Net');
    assert.equal(tryT('reportCol.not_a_column'), null);
  });

  test('validation messages are produced in the active language', () => {
    const run = () => {
      const c = new Checker();
      c.text('name', '', t('field.fullName'));
      c.done();
    };
    assert.throws(run, (e) => e instanceof ValidationError && e.fields.name === 'Full name is required.');
    setLanguage('mn');
    assert.throws(run, (e) => e instanceof ValidationError && e.fields.name === 'Бүтэн нэр заавал бөглөнө.');
    assert.equal(passwordProblem('abc'), 'Хамгийн багадаа 8 тэмдэгт, дотроо үсэг болон тоо агуулна уу.');
  });

  test('database constraint and trigger messages are translated, unknown ones pass through', () => {
    const unique = new Error('Caused by: Error code 19: UNIQUE constraint failed: users.username');
    assert.equal(friendlyError(unique), 'This username is already taken.');
    const trigger = new Error('Caused by: Error code 19: Stock movements cannot be edited. Record a new adjustment instead.');
    setLanguage('mn');
    assert.equal(friendlyError(unique), 'Энэ нэвтрэх нэр аль хэдийн ашиглагдаж байна.');
    assert.match(friendlyError(trigger), /Нөөцийн хөдөлгөөнийг засах боломжгүй/);
    assert.equal(friendlyError(new Error('something unexpected')), 'something unexpected');
  });
});

describe('formatting', () => {
  test('money keeps the stored value and only changes presentation', () => {
    assert.equal(money(12500), '12,500₮');
    setLanguage('mn');
    assert.equal(money(12500), '12,500₮');
    assert.equal(money(2499.6), '2,500₮');
  });

  test('dates are formatted per language from the stored local format', () => {
    assert.equal(shortDate('2026-10-28'), 'Oct 28, 2026');
    assert.match(dateTime('2026-10-28 15:05:00'), /Oct 28/);
    setLanguage('mn');
    assert.equal(shortDate('2026-10-28'), '2026 оны 10-р сарын 28');
    assert.equal(dateTime('2026-10-28 15:05:00'), '10-р сарын 28, 15:05');
    assert.equal(shortDate(null), '—');
  });

  test('expiry helper text', () => {
    assert.equal(daysLabel(0), 'expires today');
    assert.equal(daysLabel(1), 'in 1 day');
    assert.equal(daysLabel(-3), 'expired 3 days ago');
    setLanguage('mn');
    assert.equal(daysLabel(5), '5 хоногийн дараа');
  });
});
