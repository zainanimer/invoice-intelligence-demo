// Run with: node tests/core.test.js
const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const C = require('../core.js');

// samples.js is a browser file; load it in a sandbox
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'samples.js'), 'utf8'), ctx);
const SAMPLES = ctx.window.SAMPLES;

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  ' + name); };
const TODAY = '2026-10-07';

test('toNumber handles plain, grouped, Arabic-Indic and bracketed values', () => {
  assert.strictEqual(C.toNumber('1,235.400'), 1235.4);
  assert.strictEqual(C.toNumber('١٢٣٥٫٤٠٠'), 1235.4);
  assert.strictEqual(C.toNumber('1.235,40'), 1235.4);
  assert.strictEqual(C.toNumber('(45.00)'), -45);
  assert.strictEqual(C.toNumber('$2,649.40'), 2649.4);
  assert.strictEqual(C.toNumber('1,500'), 1500);
  assert.strictEqual(C.toNumber('12,5'), 12.5);
  assert.strictEqual(C.toNumber(''), null);
  assert.strictEqual(C.toNumber('n/a'), null);
  assert.strictEqual(C.toNumber(null), null);
});

test('toIsoDate accepts common formats and rejects impossible dates', () => {
  assert.strictEqual(C.toIsoDate('2026-09-14'), '2026-09-14');
  assert.strictEqual(C.toIsoDate('14/09/2026'), '2026-09-14');
  assert.strictEqual(C.toIsoDate('٢٠٢٦-٠٩-١٤'), '2026-09-14');
  assert.strictEqual(C.toIsoDate('2026-02-30'), null);
  assert.strictEqual(C.toIsoDate('soon'), null);
});

test('currency decimals and tolerance', () => {
  assert.strictEqual(C.decimalsFor('JOD'), 3);
  assert.strictEqual(C.decimalsFor('USD'), 2);
  assert.strictEqual(C.decimalsFor('JPY'), 0);
  assert.ok(C.tolerance('JOD') < C.tolerance('USD'));
});

test('three clean samples pass every check', () => {
  ['office', 'arabic', 'studio'].forEach((id) => {
    const inv = C.normalizeInvoice(SAMPLES.find((s) => s.id === id).extracted);
    const r = C.validateInvoice(inv, [], TODAY);
    const bad = r.checks.filter((c) => c.status === 'fail' || c.status === 'warn');
    assert.deepStrictEqual(bad, [], id + ' should be clean: ' + JSON.stringify(bad));
    assert.strictEqual(r.status, 'ok');
  });
});

test('logistics sample is flagged on the line and on the subtotal, but not on the total', () => {
  const inv = C.normalizeInvoice(SAMPLES.find((s) => s.id === 'logistics').extracted);
  const r = C.validateInvoice(inv, [], TODAY);
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.strictEqual(r.status, 'fail');
  assert.strictEqual(by.lines.status, 'fail');
  assert.match(by.lines.detail, /Line 2/);
  assert.strictEqual(by.subtotal.status, 'fail');
  assert.strictEqual(by.total.status, 'pass');
  assert.strictEqual(by.tax.status, 'pass');
});

test('missing fields are reported', () => {
  const r = C.validateInvoice(C.normalizeInvoice({}), [], TODAY);
  assert.strictEqual(r.status, 'fail');
  assert.match(r.checks.find((c) => c.id === 'required').detail, /vendor.*invoice number.*invoice date.*total/);
});

test('date problems are caught', () => {
  const base = C.normalizeInvoice(SAMPLES[0].extracted);
  let r = C.validateInvoice({ ...base, due_date: '2026-09-01' }, [], TODAY);
  assert.strictEqual(r.checks.find((c) => c.id === 'dates').status, 'warn');
  r = C.validateInvoice({ ...base, invoice_date: '2027-01-01', due_date: '2027-02-01' }, [], TODAY);
  assert.match(r.checks.find((c) => c.id === 'dates').detail, /future/);
  r = C.validateInvoice({ ...base, invoice_date: 'not a date' }, [], TODAY);
  assert.strictEqual(r.checks.find((c) => c.id === 'dates').status, 'fail');
});

test('wrong tax and wrong total are caught', () => {
  const base = C.normalizeInvoice(SAMPLES[0].extracted);
  let r = C.validateInvoice({ ...base, tax_amount: 40 }, [], TODAY);
  assert.strictEqual(r.checks.find((c) => c.id === 'tax').status, 'warn');
  assert.strictEqual(r.checks.find((c) => c.id === 'total').status, 'fail');
  r = C.validateInvoice({ ...base, total: 400 }, [], TODAY);
  assert.strictEqual(r.checks.find((c) => c.id === 'total').status, 'fail');
});

test('rounding of one smallest unit is tolerated', () => {
  const base = C.normalizeInvoice(SAMPLES[2].extracted); // USD
  const r = C.validateInvoice({ ...base, total: base.total + 0.01 }, [], TODAY);
  assert.strictEqual(r.checks.find((c) => c.id === 'total').status, 'pass');
  const r2 = C.validateInvoice({ ...base, total: base.total + 0.05 }, [], TODAY);
  assert.strictEqual(r2.checks.find((c) => c.id === 'total').status, 'fail');
});

test('duplicates are detected by vendor and invoice number', () => {
  const a = C.normalizeInvoice(SAMPLES[0].extracted);
  const b = C.normalizeInvoice(SAMPLES[0].extracted);
  const r = C.validateInvoice(b, [a], TODAY);
  assert.strictEqual(r.checks.find((c) => c.id === 'duplicate').status, 'warn');
  const r2 = C.validateInvoice(b, [], TODAY);
  assert.strictEqual(r2.checks.find((c) => c.id === 'duplicate').status, 'pass');
});

test('normalizeInvoice cleans messy model output', () => {
  const inv = C.normalizeInvoice({ vendor_name: ' Acme ', invoice_date: '14/09/2026', currency: 'jod', total: '1,235.400', line_items: [{ description: 'x', quantity: '2', unit_price: '5.5', amount: '11' }, null] });
  assert.strictEqual(inv.vendor_name, 'Acme');
  assert.strictEqual(inv.invoice_date, '2026-09-14');
  assert.strictEqual(inv.currency, 'JOD');
  assert.strictEqual(inv.total, 1235.4);
  assert.strictEqual(inv.line_items[0].amount, 11);
  assert.strictEqual(inv.line_items.length, 2);
});

test('summarize groups by currency and vendor', () => {
  const ledger = SAMPLES.map((s) => C.normalizeInvoice(s.extracted));
  const s = C.summarize(ledger);
  assert.deepStrictEqual(Object.keys(s).sort(), ['JOD', 'USD']);
  assert.strictEqual(s.JOD.count, 3);
  assert.strictEqual(C.round(s.JOD.total, 3), C.round(335.82 + 437.32 + 1235.4, 3));
  assert.strictEqual(s.USD.total, 2649.4);
});

test('CSV escapes quotes, commas and formula characters', () => {
  assert.strictEqual(C.csvCell('a,b'), '"a,b"');
  assert.strictEqual(C.csvCell('say "hi"'), '"say ""hi"""');
  assert.strictEqual(C.csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.strictEqual(C.csvCell(-5), '-5');
  assert.strictEqual(C.csvCell(null), '');
  const ledger = SAMPLES.map((s) => C.normalizeInvoice(s.extracted));
  const inv = C.invoicesCsv(ledger).trim().split('\r\n');
  assert.strictEqual(inv.length, 5);
  assert.match(inv[0], /^vendor,customer,invoice_number/);
  assert.match(inv[4], /fail$/);
  const lines = C.linesCsv(ledger).trim().split('\r\n');
  assert.strictEqual(lines.length, 1 + 4 + 3 + 3 + 3);
});

test('failed checks say which fields and lines to highlight', () => {
  const inv = C.normalizeInvoice(SAMPLES.find((s) => s.id === 'logistics').extracted);
  const by = Object.fromEntries(C.validateInvoice(inv, [], TODAY).checks.map((c) => [c.id, c]));
  assert.deepStrictEqual(by.lines.marks, ['line:1']);
  assert.deepStrictEqual(by.subtotal.marks, ['field:subtotal']);
  assert.deepStrictEqual(by.total.marks, []);
});

console.log('\n' + passed + ' tests passed');
