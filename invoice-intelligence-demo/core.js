/*
 * core.js: number and date cleanup, the consistency checks, and CSV export.
 * No browser or network code lives here, so it can be tested with plain Node:
 *   node tests/core.test.js
 */
(function (root) {
  'use strict';

  // ---------- numbers ----------
  const DIGIT_MAP = {};
  '٠١٢٣٤٥٦٧٨٩'.split('').forEach((c, i) => (DIGIT_MAP[c] = String(i)));
  '۰۱۲۳۴۵۶۷۸۹'.split('').forEach((c, i) => (DIGIT_MAP[c] = String(i)));

  function westernDigits(s) {
    return String(s).replace(/[٠-٩۰-۹]/g, (c) => DIGIT_MAP[c]).replace(/٫/g, '.').replace(/٬/g, ',');
  }

  /** Turns "1,235.400", "١٢٣٥٫٤٠٠", "(45.00)" or 12.5 into a number. Returns null when it is not a number. */
  function toNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = westernDigits(v).trim();
    let negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
    s = s.replace(/[^0-9.,]/g, '');
    if (!s) return null;
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot !== -1 && lastComma !== -1) {
      const decimalSep = lastDot > lastComma ? '.' : ',';
      const groupSep = decimalSep === '.' ? ',' : '.';
      s = s.split(groupSep).join('').replace(decimalSep, '.');
    } else if (lastComma !== -1) {
      s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    }
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return null;
    return negative ? -Math.abs(n) : n;
  }

  const THREE_DECIMAL = ['JOD', 'KWD', 'BHD', 'OMR', 'TND', 'LYD', 'IQD'];
  const ZERO_DECIMAL = ['JPY', 'KRW', 'VND', 'CLP'];

  function decimalsFor(currency) {
    const c = String(currency || '').toUpperCase();
    if (THREE_DECIMAL.includes(c)) return 3;
    if (ZERO_DECIMAL.includes(c)) return 0;
    return 2;
  }

  /** Amounts may differ by about one unit of the smallest digit shown, because of rounding. */
  function tolerance(currency) {
    const d = decimalsFor(currency);
    return d === 0 ? 1 : 1.5 * Math.pow(10, -d);
  }

  function round(n, d) {
    const f = Math.pow(10, d);
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  function fmt(n, currency) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '';
    const d = decimalsFor(currency);
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  // ---------- dates ----------
  /** Returns YYYY-MM-DD or null. Day-first is assumed for 12/03/2026 style dates. */
  function toIsoDate(v) {
    if (v === null || v === undefined || v === '') return null;
    const s = westernDigits(v).trim();
    let y, m, d, match;
    if ((match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
      y = +match[1]; m = +match[2]; d = +match[3];
    } else if ((match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
      d = +match[1]; m = +match[2]; y = +match[3];
    } else {
      return null;
    }
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  }

  // ---------- cleaning model output ----------
  const NUMBER_FIELDS = ['subtotal', 'discount', 'tax_rate', 'tax_amount', 'shipping', 'total'];

  /** Makes sure every field has the right type, whatever the model returned. */
  function normalizeInvoice(raw) {
    raw = raw || {};
    const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
    const inv = {
      vendor_name: text(raw.vendor_name),
      customer_name: text(raw.customer_name),
      invoice_number: text(raw.invoice_number),
      invoice_date: toIsoDate(raw.invoice_date) || text(raw.invoice_date),
      due_date: toIsoDate(raw.due_date) || text(raw.due_date),
      currency: text(raw.currency).toUpperCase(),
      language: text(raw.language).toLowerCase(),
      payment_terms: text(raw.payment_terms),
      line_items: [],
    };
    NUMBER_FIELDS.forEach((f) => (inv[f] = toNumber(raw[f])));
    (Array.isArray(raw.line_items) ? raw.line_items : []).forEach((li) => {
      inv.line_items.push({
        description: text(li && li.description),
        quantity: toNumber(li && li.quantity),
        unit_price: toNumber(li && li.unit_price),
        amount: toNumber(li && li.amount),
      });
    });
    return inv;
  }

  // ---------- checks ----------
  function normName(s) {
    return String(s || '').toLowerCase().replace(/[\s.,\-_/\\]+/g, ' ').trim();
  }

  function sumLines(inv) {
    let sum = 0, any = false;
    inv.line_items.forEach((li) => {
      if (li.amount !== null) { sum += li.amount; any = true; }
    });
    return any ? sum : null;
  }

  /**
   * Runs every check on one invoice.
   * ledger: invoices already saved, used to spot duplicates.
   * today:  injectable "today" (YYYY-MM-DD) so tests are stable.
   * Returns { checks: [{id, label, status, detail}], status }
   * status is 'ok' (all pass), 'warn' (something to look at) or 'fail' (numbers do not add up).
   */
  function validateInvoice(inv, ledger, today) {
    ledger = ledger || [];
    today = today || new Date().toISOString().slice(0, 10);
    const cur = inv.currency;
    const tol = tolerance(cur);
    const checks = [];
    const add = (id, label, status, detail, marks) => checks.push({ id, label, status, detail: detail || '', marks: marks || [] });
    const money = (n) => fmt(n, cur);

    // 1. required fields
    const missing = [], missingMarks = [];
    if (!inv.vendor_name) { missing.push('vendor'); missingMarks.push('field:vendor_name'); }
    if (!inv.invoice_number) { missing.push('invoice number'); missingMarks.push('field:invoice_number'); }
    if (!inv.invoice_date) { missing.push('invoice date'); missingMarks.push('field:invoice_date'); }
    if (inv.total === null) { missing.push('total'); missingMarks.push('field:total'); }
    add('required', 'Key fields are present', missing.length ? 'fail' : 'pass',
      missing.length ? 'Missing: ' + missing.join(', ') : 'Vendor, invoice number, date and total found', missingMarks);

    // 2. currency
    add('currency', 'Currency is stated', cur ? 'pass' : 'warn', cur ? cur : 'No currency found, so amounts are shown without one', ['field:currency']);

    // 3. dates
    const issue = toIsoDate(inv.invoice_date);
    const due = toIsoDate(inv.due_date);
    if (!inv.invoice_date) {
      add('dates', 'Dates make sense', 'skip', 'No invoice date');
    } else if (!issue) {
      add('dates', 'Dates make sense', 'fail', 'The invoice date is not a valid date: ' + inv.invoice_date, ['field:invoice_date']);
    } else if (inv.due_date && !due) {
      add('dates', 'Dates make sense', 'warn', 'The due date is not a valid date: ' + inv.due_date, ['field:due_date']);
    } else if (due && due < issue) {
      add('dates', 'Dates make sense', 'warn', 'The due date (' + due + ') is before the invoice date (' + issue + ')', ['field:due_date']);
    } else if (issue > addDays(today, 1)) {
      add('dates', 'Dates make sense', 'warn', 'The invoice date (' + issue + ') is in the future', ['field:invoice_date']);
    } else {
      add('dates', 'Dates make sense', 'pass', due ? issue + ' to ' + due : issue);
    }

    // 4. each line: quantity x unit price = amount
    if (!inv.line_items.length) {
      add('lines', 'Each line adds up (quantity x price)', 'warn', 'No line items were extracted');
    } else {
      const bad = [], badMarks = [];
      let checked = 0;
      inv.line_items.forEach((li, i) => {
        if (li.quantity === null || li.unit_price === null || li.amount === null) return;
        checked++;
        const expected = li.quantity * li.unit_price;
        if (Math.abs(expected - li.amount) > tol) {
          bad.push('Line ' + (i + 1) + ': ' + li.quantity + ' x ' + money(li.unit_price) + ' = ' + money(round(expected, 3)) + ', but the invoice says ' + money(li.amount));
          badMarks.push('line:' + i);
        }
      });
      if (!checked) add('lines', 'Each line adds up (quantity x price)', 'skip', 'Lines have no quantity or price to check');
      else add('lines', 'Each line adds up (quantity x price)', bad.length ? 'fail' : 'pass', bad.length ? bad.join('. ') : checked + ' line' + (checked === 1 ? '' : 's') + ' checked', badMarks);
    }

    // 5. lines add up to the subtotal
    const lineSum = sumLines(inv);
    if (lineSum === null) {
      add('subtotal', 'Lines add up to the subtotal', 'skip', 'No line amounts');
    } else if (inv.subtotal === null) {
      add('subtotal', 'Lines add up to the subtotal', 'skip', 'The invoice has no subtotal. Lines add up to ' + money(round(lineSum, 3)));
    } else if (Math.abs(lineSum - inv.subtotal) > tol) {
      add('subtotal', 'Lines add up to the subtotal', 'fail', 'Lines add up to ' + money(round(lineSum, 3)) + ', but the subtotal says ' + money(inv.subtotal), ['field:subtotal']);
    } else {
      add('subtotal', 'Lines add up to the subtotal', 'pass', money(inv.subtotal));
    }

    // 6. subtotal - discount + tax + shipping = total
    const base = inv.subtotal !== null ? inv.subtotal : lineSum;
    if (base === null || inv.total === null) {
      add('total', 'Subtotal, tax and extras add up to the total', 'skip', 'Not enough numbers to check');
    } else {
      const expected = base - (inv.discount || 0) + (inv.tax_amount || 0) + (inv.shipping || 0);
      if (Math.abs(expected - inv.total) > tol) {
        add('total', 'Subtotal, tax and extras add up to the total', 'fail', 'These add up to ' + money(round(expected, 3)) + ', but the total says ' + money(inv.total), ['field:total']);
      } else {
        add('total', 'Subtotal, tax and extras add up to the total', 'pass', money(inv.total));
      }
    }

    // 7. tax rate
    if (inv.tax_amount === null) {
      add('tax', 'Tax matches the stated rate', 'skip', 'No tax amount on the invoice');
    } else if (inv.tax_rate === null) {
      const taxable = base === null ? null : base - (inv.discount || 0);
      if (taxable) {
        const implied = (inv.tax_amount / taxable) * 100;
        add('tax', 'Tax matches the stated rate', implied < 0 || implied > 30 ? 'warn' : 'pass', 'No rate stated. The tax works out to ' + round(implied, 2) + '% of ' + money(round(taxable, 3)));
      } else {
        add('tax', 'Tax matches the stated rate', 'skip', 'No rate stated');
      }
    } else if (base === null) {
      add('tax', 'Tax matches the stated rate', 'skip', 'No base amount to check against');
    } else {
      const onNet = (base - (inv.discount || 0)) * inv.tax_rate / 100;
      const onGross = base * inv.tax_rate / 100;
      const ok = Math.abs(onNet - inv.tax_amount) <= tol || Math.abs(onGross - inv.tax_amount) <= tol;
      add('tax', 'Tax matches the stated rate', ok ? 'pass' : 'warn',
        ok ? inv.tax_rate + '% gives ' + money(inv.tax_amount)
           : inv.tax_rate + '% would be ' + money(round(onNet, 3)) + ', but the invoice shows ' + money(inv.tax_amount), ok ? [] : ['field:tax_amount']);
    }

    // 8. duplicates
    const dup = ledger.find((o) => o !== inv && inv.invoice_number && normName(o.vendor_name) === normName(inv.vendor_name) && String(o.invoice_number).trim() === String(inv.invoice_number).trim());
    add('duplicate', 'Not a duplicate of a saved invoice', dup ? 'warn' : 'pass', dup ? 'Invoice ' + inv.invoice_number + ' from ' + inv.vendor_name + ' is already in the ledger' : '', dup ? ['field:invoice_number'] : []);

    const status = checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'warn') ? 'warn' : 'ok';
    return { checks, status };
  }

  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // ---------- totals ----------
  /** Totals per currency and per vendor, for the summary and the bars. */
  function summarize(ledger) {
    const byCurrency = {};
    ledger.forEach((inv) => {
      if (inv.total === null) return;
      const c = inv.currency || 'unspecified';
      const g = byCurrency[c] || (byCurrency[c] = { total: 0, count: 0, vendors: {} });
      g.total += inv.total;
      g.count += 1;
      const v = inv.vendor_name || 'Unknown vendor';
      g.vendors[v] = (g.vendors[v] || 0) + inv.total;
    });
    return byCurrency;
  }

  // ---------- CSV ----------
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    let s = String(v);
    // A leading = + - @ can run as a formula when the CSV is opened in Excel. Prefix those.
    if (/^[=+@]/.test(s) || (/^-/.test(s) && Number.isNaN(Number(s)))) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(header, rows) {
    return [header.map(csvCell).join(',')].concat(rows.map((r) => r.map(csvCell).join(','))).join('\r\n') + '\r\n';
  }

  function invoicesCsv(ledger) {
    const header = ['vendor', 'customer', 'invoice_number', 'invoice_date', 'due_date', 'currency', 'subtotal', 'discount', 'tax_rate', 'tax_amount', 'shipping', 'total', 'payment_terms', 'check_status'];
    const rows = ledger.map((i) => [i.vendor_name, i.customer_name, i.invoice_number, i.invoice_date, i.due_date, i.currency, i.subtotal, i.discount, i.tax_rate, i.tax_amount, i.shipping, i.total, i.payment_terms, validateInvoice(i, ledger).status]);
    return toCsv(header, rows);
  }

  function linesCsv(ledger) {
    const header = ['vendor', 'invoice_number', 'line', 'description', 'quantity', 'unit_price', 'amount', 'currency'];
    const rows = [];
    ledger.forEach((i) => i.line_items.forEach((li, n) => rows.push([i.vendor_name, i.invoice_number, n + 1, li.description, li.quantity, li.unit_price, li.amount, i.currency])));
    return toCsv(header, rows);
  }

  const api = { toNumber, toIsoDate, decimalsFor, tolerance, fmt, round, normalizeInvoice, validateInvoice, summarize, invoicesCsv, linesCsv, csvCell, sumLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
