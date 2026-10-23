const {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} = require('docx');
const { buildBlocks } = require('./appraisalBlocks');

// One filled appraisal as a Word file. The content comes from
// appraisalBlocks.js (shared with the PDF); this only draws it.

const PAGE_W = 10466; // A4 width minus 0.5" margins, in twentieths of a point
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

const run = (text, opts = {}) => new TextRun({ text: String(text ?? ''), font: 'Calibri', size: opts.size || 20, bold: !!opts.bold, italics: !!opts.italics });

const cell = (text, width, opts = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA },
  borders: BORDERS,
  shading: opts.head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E7ECF5' } : undefined,
  margins: { top: 50, bottom: 50, left: 90, right: 90 },
  children: String(text || ' ').split('\n').map((line) => new Paragraph({ children: [run(line, { bold: opts.head, size: 19 })] })),
});

const table = (headers, rows, shares) => {
  const total = shares.reduce((a, c) => a + c, 0);
  const widths = shares.map((s) => Math.floor((s / total) * PAGE_W));
  widths[widths.length - 1] += PAGE_W - widths.reduce((a, c) => a + c, 0);
  const cols = shares.length;
  const body = rows.length ? rows : [Array(cols).fill('')];
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      ...(headers ? [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], { head: true })) })] : []),
      ...body.map((r) => new TableRow({ children: r.map((v, i) => cell(v, widths[i])) })),
    ],
  });
};

const render = (block) => {
  switch (block.t) {
    case 'title':
      return new Paragraph({ children: [run(block.text, { bold: true, size: block.small ? 24 : 28 })], alignment: AlignmentType.CENTER, spacing: { after: 40 } });
    case 'heading':
      return new Paragraph({
        children: [run(block.text, { bold: true, size: 24 })],
        spacing: { before: 240, after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1F3864', space: 2 } },
      });
    case 'sub':
      return new Paragraph({ children: [run(block.text, { bold: true, size: 21 })], spacing: { before: 160, after: 60 } });
    case 'table':
      return table(block.headers, block.rows, block.shares);
    case 'space':
      return new Paragraph({ children: [run(' ')], spacing: { before: 400 } });
    default:
      return new Paragraph({
        children: [run(block.text, block)],
        alignment: block.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { before: block.bold ? 100 : 40, after: 40 },
      });
  }
};

const appraisalDocxBuffer = (args) => {
  const { blocks, name, institute } = buildBlocks(args);
  return Packer.toBuffer(new Document({
    creator: institute,
    title: `Appraisal — ${name}`,
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: blocks.map(render),
    }],
  }));
};

module.exports = { appraisalDocxBuffer };
