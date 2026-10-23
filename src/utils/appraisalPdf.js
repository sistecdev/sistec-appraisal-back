const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { buildBlocks } = require('./appraisalBlocks');

// One filled appraisal as a PDF (A4). Same content as the Word file — both
// come from appraisalBlocks.js — drawn with tables that run across pages,
// repeating their header row on each new page.

const MARGIN = 36;
const PAGE = { w: 595.28, h: 841.89 };
const WIDTH = PAGE.w - MARGIN * 2;
const BOTTOM = PAGE.h - MARGIN - 14; // room for the page number
const INK = '#111827';
const MUTED = '#4b5563';
const LINE = '#9ca3af';
const HEAD_BG = '#e7ecf5';
const ACCENT = '#1f3864';

// Hind (assets/fonts, SIL Open Font License) draws English and Hindi — the
// staff forms ask their questions in both, and answers may be in either.
// Without the font files the standard PDF fonts are used, and characters
// they cannot draw are replaced rather than printed as gaps.
const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const HIND = { regular: path.join(FONT_DIR, 'Hind-Regular.ttf'), bold: path.join(FONT_DIR, 'Hind-SemiBold.ttf') };
const HAS_HIND = fs.existsSync(HIND.regular) && fs.existsSync(HIND.bold);
const FONT = HAS_HIND
  ? { regular: 'Body', bold: 'BodyBold', italic: 'Body', boldItalic: 'BodyBold' }
  : { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', boldItalic: 'Helvetica-BoldOblique' };
const clean = HAS_HIND
  ? (v) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  : (v) => String(v ?? '')
    .replace(/₹/g, 'Rs. ')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF–—•…]/g, '?');

const appraisalPdfBuffer = (args) => new Promise((resolve, reject) => {
  const { blocks, name, institute } = buildBlocks(args);
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, info: { Title: `Appraisal — ${clean(name)}`, Author: clean(institute) } });
  if (HAS_HIND) {
    doc.registerFont('Body', HIND.regular);
    doc.registerFont('BodyBold', HIND.bold);
  }
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  let y = MARGIN;
  const ensure = (h) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = MARGIN;
      return true;
    }
    return false;
  };

  const text = (str, { size = 9.5, bold = false, italics = false, color = INK, align = 'left', gapAfter = 4 } = {}) => {
    const font = bold ? (italics ? FONT.boldItalic : FONT.bold) : italics ? FONT.italic : FONT.regular;
    doc.font(font).fontSize(size);
    const s = clean(str) || ' ';
    const h = doc.heightOfString(s, { width: WIDTH });
    ensure(h);
    doc.fillColor(color).text(s, MARGIN, y, { width: WIDTH, align });
    y += h + gapAfter;
  };

  // A table that may run over several pages.
  const table = (headers, rows, shares) => {
    const total = shares.reduce((a, c) => a + c, 0);
    const widths = shares.map((s) => (s / total) * WIDTH);
    const pad = 4;
    const body = rows.length ? rows : [shares.map(() => '')];
    const rowHeight = (cells, bold) => {
      doc.font(bold ? FONT.bold : FONT.regular).fontSize(8.5);
      return Math.max(16, ...cells.map((c, i) => doc.heightOfString(clean(c) || ' ', { width: widths[i] - pad * 2 }) + pad * 2));
    };
    const drawRow = (cells, head) => {
      const h = rowHeight(cells, head);
      let x = MARGIN;
      cells.forEach((c, i) => {
        if (head) doc.rect(x, y, widths[i], h).fillColor(HEAD_BG).fill();
        doc.rect(x, y, widths[i], h).lineWidth(0.5).strokeColor(LINE).stroke();
        doc.font(head ? FONT.bold : FONT.regular).fontSize(8.5).fillColor(INK)
          .text(clean(c) || ' ', x + pad, y + pad, { width: widths[i] - pad * 2 });
        x += widths[i];
      });
      y += h;
    };
    if (headers) {
      ensure(rowHeight(headers, true) + rowHeight(body[0], false));
      drawRow(headers, true);
    }
    for (const r of body) {
      const h = rowHeight(r, false);
      if (ensure(h) && headers) drawRow(headers, true);
      drawRow(r, false);
    }
    y += 6;
  };

  for (const block of blocks) {
    switch (block.t) {
      case 'title':
        text(block.text, { size: block.small ? 12 : 14, bold: true, align: 'center', gapAfter: 2 });
        break;
      case 'heading':
        ensure(40);
        y += 8;
        text(block.text, { size: 12, bold: true, color: ACCENT, gapAfter: 2 });
        doc.moveTo(MARGIN, y).lineTo(MARGIN + WIDTH, y).lineWidth(1).strokeColor(ACCENT).stroke();
        y += 6;
        break;
      case 'sub':
        ensure(30);
        y += 4;
        text(block.text, { size: 10.5, bold: true, gapAfter: 3 });
        break;
      case 'table':
        table(block.headers, block.rows, block.shares);
        break;
      case 'space':
        y += 24;
        break;
      default:
        text(block.text, { bold: block.bold, italics: block.italics, align: block.center ? 'center' : 'left', color: block.italics ? MUTED : INK });
    }
  }

  // Page numbers.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Below the bottom margin on purpose — without this pdfkit starts a new page.
    doc.page.margins.bottom = 0;
    doc.font(FONT.regular).fontSize(7.5).fillColor(MUTED)
      .text(`${clean(name)} — page ${i + 1} of ${range.count}`, MARGIN, PAGE.h - MARGIN, { width: WIDTH, align: 'right', lineBreak: false });
  }
  doc.end();
});

module.exports = { appraisalPdfBuffer };
