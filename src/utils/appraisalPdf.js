const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { PDFDocument: PdfLib, StandardFonts, rgb } = require('pdf-lib');
const { buildBlocks } = require('./appraisalBlocks');

// One filled appraisal as a PDF (A4). Same content as the Word file — both
// come from appraisalBlocks.js — drawn with tables that run across pages,
// repeating their header row on each new page. Every page carries the
// SISTec logo in its header and, faintly, as a watermark; the proofs the
// appraisee attached follow at the end (PDF pages and pictures as they are,
// Word files attached inside the PDF).

const MARGIN = 36;
const HEADER = 54; // the logo band at the top of every page
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
// The SISTec logo: assets/logo.png, or logo.png in the backend folder.
const LOGO = [path.join(__dirname, '..', '..', 'assets', 'logo.png'), path.join(__dirname, '..', '..', 'logo.png')].find((p) => fs.existsSync(p)) || null;
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

const formPdfBuffer = (args) => new Promise((resolve, reject) => {
  const { blocks, name, institute } = buildBlocks({ ...args, proofsAttached: true });
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, info: { Title: `Appraisal — ${clean(name)}`, Author: clean(institute) } });
  if (HAS_HIND) {
    doc.registerFont('Body', HIND.regular);
    doc.registerFont('BodyBold', HIND.bold);
  }
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const TOP = MARGIN + HEADER;
  // The faint logo in the middle and the logo band at the top, drawn first
  // on each page so the content sits over them.
  const decorate = () => {
    if (LOGO) {
      const size = 340;
      doc.save().opacity(0.06).image(LOGO, (PAGE.w - size) / 2, (PAGE.h - size) / 2, { fit: [size, size], align: 'center', valign: 'center' }).restore();
      doc.image(LOGO, MARGIN, MARGIN - 14, { fit: [50, 46] });
    }
    const left = MARGIN + (LOGO ? 58 : 0);
    doc.font(FONT.bold).fontSize(11).fillColor(ACCENT)
      .text(clean(institute), left, MARGIN - 6, { width: WIDTH - (left - MARGIN), lineBreak: false, ellipsis: true });
    doc.font(FONT.regular).fontSize(8.5).fillColor(MUTED)
      .text('Performance Appraisal', left, MARGIN + 10, { width: WIDTH - (left - MARGIN), lineBreak: false });
    doc.moveTo(MARGIN, MARGIN + HEADER - 16).lineTo(MARGIN + WIDTH, MARGIN + HEADER - 16).lineWidth(0.8).strokeColor(ACCENT).stroke();
  };
  doc.on('pageAdded', decorate);
  decorate();

  let y = TOP;
  const ensure = (h) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = TOP;
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

const IMAGE_TYPES = ['image/jpeg', 'image/png'];

// The proofs after the form: a PDF's own pages, a picture on a page of its
// own with its name above it, anything else (Word, WEBP) attached inside the
// PDF — most readers list it under Attachments.
const addProofs = async (formBytes, proofs) => {
  const out = await PdfLib.load(formBytes);
  const font = await out.embedFont(StandardFonts.HelveticaBold);
  // The standard PDF font draws plain ASCII only.
  const ascii = (s) => String(s || '').replace(/[^\x20-\x7E]/g, '?');
  const label = (page, text) => page.drawText(ascii(text).slice(0, 110), { x: MARGIN, y: page.getHeight() - 24, size: 10, font, color: rgb(0.12, 0.22, 0.39) });
  for (const [i, p] of proofs.entries()) {
    const title = `Proof ${i + 1}: ${p.name}`;
    try {
      if (p.type === 'application/pdf') {
        // eslint-disable-next-line no-await-in-loop
        const src = await PdfLib.load(p.data, { ignoreEncryption: true });
        // eslint-disable-next-line no-await-in-loop
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((pg, n) => { out.addPage(pg); if (n === 0) label(pg, title); });
      } else if (IMAGE_TYPES.includes(p.type)) {
        // eslint-disable-next-line no-await-in-loop
        const img = p.type === 'image/png' ? await out.embedPng(p.data) : await out.embedJpg(p.data);
        const page = out.addPage([PAGE.w, PAGE.h]);
        label(page, title);
        const box = { w: PAGE.w - MARGIN * 2, h: PAGE.h - MARGIN * 2 - 30 };
        const scale = Math.min(box.w / img.width, box.h / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: (PAGE.w - w) / 2, y: MARGIN + (box.h - h) / 2, width: w, height: h });
      } else {
        // eslint-disable-next-line no-await-in-loop
        await out.attach(p.data, p.fileName || `proof-${i + 1}`, { mimeType: p.type, description: title });
      }
    } catch (err) {
      // A damaged or locked file: keep it as an attachment rather than lose it.
      console.error(`proof "${p.name}" could not be added to the PDF:`, err.message);
      // eslint-disable-next-line no-await-in-loop
      await out.attach(p.data, p.fileName || `proof-${i + 1}`, { mimeType: p.type || 'application/octet-stream', description: title }).catch(() => {});
    }
  }
  return Buffer.from(await out.save());
};

// args: { appraisal, cycle, institute, proofFiles: [{ name, fileName, type, data }] }
const appraisalPdfBuffer = async (args) => {
  const form = await formPdfBuffer(args);
  return args.proofFiles?.length ? addProofs(form, args.proofFiles) : form;
};

module.exports = { appraisalPdfBuffer, IMAGE_TYPES };
