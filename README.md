# Invoice Intelligence

A small document-intelligence tool. It reads an invoice (PDF or photo, English or Arabic) with Google Gemini, turns it into structured data, and then **checks whether the numbers add up**, the way an accountant would. Fields are editable, so a person can correct the AI's mistakes and watch the checks update.

It runs entirely in the browser: no server, no install, no build step.
[index.html](https://github.com/user-attachments/files/33199524/index.html)

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice Intelligence</title>
<meta name="description" content="Read invoices with AI, review the extracted data, and check that the numbers add up.">
<link rel="stylesheet" href="style.css">
</head>
<body>

<header class="top">
  <div class="titleblock">
    <h1>Invoice Intelligence</h1>
    <p>Read an invoice, correct what the AI got wrong, and see whether the numbers add up. Works with English and Arabic.</p>
  </div>
  <div class="conn">
    <span id="connState" class="pill idle">Sample mode</span>
    <button id="settingsBtn" class="btn ghost" type="button">AI settings</button>
  </div>
</header>

<main>
  <section class="panel doc" aria-labelledby="docH">
    <h2 id="docH">Document</h2>

    <p class="hint">Start with a sample. They are fictional, and one has a mistake on purpose.</p>
    <div class="samples" id="samples"></div>

    <div class="drop" id="drop">
      <p>To read your own invoice, drop a PDF or image here, or</p>
      <button id="pickBtn" class="btn" type="button">Choose a file</button>
      <input type="file" id="file" accept=".pdf,application/pdf,image/png,image/jpeg,image/webp" hidden>
      <p class="small" id="dropNote">Needs a Gemini key in AI settings.</p>
    </div>

    <div class="preview" id="preview">
      <p class="empty">The document you pick will appear here.</p>
    </div>
  </section>

  <section class="panel result" aria-labelledby="resH">
    <h2 id="resH">Extracted data</h2>

    <div id="resultEmpty" class="emptyState">
      <p>Pick a sample on the left to see how it works. The app lists every field it found, then checks the arithmetic the way an accountant would.</p>
    </div>

    <div id="result" hidden>
      <p class="source" id="sourceNote"></p>
      <div id="banner" class="banner" role="status" aria-live="polite"></div>

      <h3>Invoice details</h3>
      <div class="grid" id="fields"></div>

      <h3>Line items</h3>
      <div class="tablewrap">
        <table class="lines" id="lines">
          <thead><tr><th>Description</th><th class="r">Quantity</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>

      <h3>Amounts</h3>
      <div class="grid amounts" id="amounts"></div>

      <h3>Do the numbers add up?</h3>
      <ul class="tape" id="checks"></ul>

      <div class="actions">
        <button id="addBtn" class="btn primary" type="button">Add to ledger</button>
        <button id="rerunBtn" class="btn" type="button" hidden>Read this sample with Gemini</button>
      </div>
      <p class="small">Fields are editable. Fix any value and the checks update straight away.</p>
    </div>
  </section>

  <section class="panel ledger" id="ledgerSec" aria-labelledby="ledH" hidden>
    <div class="ledgerHead">
      <h2 id="ledH">Ledger</h2>
      <div class="exports">
        <button class="btn" id="expInv" type="button">Download invoices (CSV)</button>
        <button class="btn" id="expLines" type="button">Download line items (CSV)</button>
        <button class="btn" id="expJson" type="button">Download all (JSON)</button>
      </div>
    </div>

    <div class="tablewrap">
      <table class="ledgerTable" id="ledgerTable">
        <thead><tr><th>Vendor</th><th>Invoice</th><th>Date</th><th>Currency</th><th class="r">Total</th><th>Checks</th><th><span class="sr">Remove</span></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>

    <h3>Totals</h3>
    <div id="summary" class="summary"></div>

    <h3>Ask about these invoices</h3>
    <div class="ask">
      <div class="chips" id="chips"></div>
      <div class="askRow">
        <input id="question" type="text" placeholder="For example: which vendor is owed the most?" aria-label="Question about the invoices">
        <button id="askBtn" class="btn primary" type="button">Ask</button>
      </div>
      <p class="small" id="askNote"></p>
      <div id="answer" class="answer" hidden></div>
    </div>
  </section>
</main>

<footer>
  <p>The sample invoices are fictional. Please do not upload real invoices or papers with personal data to a demo you plan to share. When you use your own key, the file goes to Google's Gemini API from your browser and nowhere else, so read Google's current terms on how free and paid usage is handled.</p>
  <p>AI can misread a document. Check anything important against the original.</p>
</footer>

<dialog id="settings">
  <form method="dialog" class="dlg" id="settingsForm">
    <h2>AI settings</h2>
    <p>Reading your own files uses a free Gemini API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. The key stays in this browser tab and is sent only to Google.</p>
    <label class="f"><span>Gemini API key</span><input id="keyInput" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key"></label>
    <label class="f"><span>Model</span><input id="modelInput" type="text" spellcheck="false"></label>
    <label class="check"><input id="rememberInput" type="checkbox"> Remember the key on this device</label>
    <p class="small">Leave "Remember" off on a shared or public computer.</p>
    <div class="actions">
      <button class="btn primary" id="saveKey" value="save">Save</button>
      <button class="btn" id="clearKey" type="button">Remove key</button>
      <button class="btn ghost" value="cancel">Close</button>
    </div>
  </form>
</dialog>

<script src="samples.js"></script>
<script src="core.js"></script>
<script src="app.js"></script>
</body>
</html>


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


