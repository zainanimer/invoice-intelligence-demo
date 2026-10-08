# Invoice Intelligence

A small document-intelligence tool. It reads an invoice (PDF or photo, English or Arabic) with Google Gemini, turns it into structured data, and then **checks whether the numbers add up**, the way an accountant would. Fields are editable, so a person can correct the AI's mistakes and watch the checks update.

It runs entirely in the browser: no server, no install, no build step.
[index.html](https://github.com/user-attachments/files/33199524/index.html)


## What it does

- **Reads invoices** in English and Arabic, from a PDF or an image.
- **Extracts structured data:** vendor, customer, invoice number, dates, currency, line items, subtotal, discount, tax, shipping and total.
- **Checks the arithmetic** instead of trusting the AI:
  - each line: quantity x unit price = amount
  - the lines add up to the subtotal
  - subtotal - discount + tax + shipping = total
  - the tax matches the stated rate
  - the dates make sense
  - the invoice is not a duplicate of one already saved
- **Highlights the exact fields** that fail, so a reviewer knows where to look.
- **Keeps a ledger** of reviewed invoices, with totals per currency and per vendor.
- **Exports** the ledger as CSV (invoices, line items) or JSON.
- **Answers questions** about the ledger ("which invoices need review?").

Amounts in Jordanian dinars use three decimals, so the rounding tolerance is set per currency.

## Try it

1. Open `index.html` in a browser (double-click it). No server is needed.
2. Pick one of the four **sample invoices**. They are fictional and work without any key. One has a wrong line total on purpose.
3. To read your own files, open **AI settings** and paste a free Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).


## How it works

```
 invoice (PDF / image)
        |
        v
 Gemini reads it  ->  JSON with a fixed schema (values copied as printed, never "corrected")
        |
        v
 core.js cleans the numbers and dates, then runs the checks
        |
        v
 a person reviews and edits the fields  ->  ledger  ->  CSV / JSON / questions
```

The most important design choice: **the AI is told to copy values exactly as printed, and plain code does the arithmetic.** That way a mistake on the invoice itself (like the sample with a wrong line total) is caught instead of being quietly fixed by the model.

## Project structure

```
index.html      the page
style.css       styles
app.js          page logic and the Gemini calls
core.js         number and date cleanup, the checks, CSV export (no browser code, easy to test)
samples.js      the four sample invoices and the data a model would extract from them
samples/        the sample invoices as PDF and PNG, for testing uploads
tests/          unit tests for core.js
docs/           screenshots
```

## Tests

The checks and CSV export have unit tests that need only Node.js:

```
node tests/core.test.js
```

## Your API key and your documents

- The key is kept in memory while the tab is open. It is saved on the device only if you tick **Remember the key**, so leave that off on shared computers.
- The key is sent only to Google. Files you upload are sent from your browser to the Gemini API and nowhere else. Read Google's current terms on how free and paid usage is handled before uploading anything sensitive.
- Because the key lives in the browser, **use a key meant for experiments** and, if you can, restrict it in Google AI Studio or Google Cloud. If you host this page publicly, visitors enter their own key; never put yours in the code.
- The sample invoices are fictional. Don't commit real invoices to a public repository.

## Limitations

- AI can misread a document, especially blurry photos, handwriting and unusual layouts. The review step and the checks exist for that reason, and they cannot catch every error (for example, a wrong digit that still adds up).
- One invoice per file. Multi-invoice PDFs are not split.
- Date formats like 03/04/2026 are read day-first.
- Text inside a document could try to instruct the AI. The prompt tells the model to treat the document as data, and the output is validated and shown as plain text, but you should still review what it returns.
- Free-tier Gemini usage has rate and quota limits. When Google reports "high demand", the app retries twice by itself and then shows a Try again button. Switching to another model in AI settings (for example `gemini-flash-lite-latest`) often helps.

## Ideas for next steps

- A page-by-page view for multi-invoice PDFs.
- Vendor memory: learn a supplier's layout and flag when it changes.
- A confidence signal from comparing two passes of the model.
- Export to a proper accounting format.


