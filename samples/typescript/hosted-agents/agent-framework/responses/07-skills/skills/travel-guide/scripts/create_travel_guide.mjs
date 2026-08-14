#!/usr/bin/env node
// Ported to TypeScript from the Microsoft Foundry samples
// (https://github.com/microsoft-foundry/foundry-samples), MIT License.

// Generates a colorful PDF city travel guide using only the Node.js standard
// library, by writing the PDF object graph by hand. A faithful port of the
// Python original (create_travel_guide.py), which did the same with the Python
// standard library.

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { env, exit } from 'node:process';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 54;

/** Mirrors Python's `text.encode('latin-1', 'replace')`: non-Latin-1 chars become `?`. */
function safeText(value) {
  return [...String(value)].map((ch) => (ch.codePointAt(0) > 255 ? '?' : ch)).join('');
}

function pdfEscape(value) {
  return safeText(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'city';
}

function displayPath(path) {
  const home = resolve(homedir());
  const resolvedPath = resolve(path);
  const rel = relative(home, resolvedPath);
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
    return `$HOME/${rel.split(sep).join('/')}`;
  }
  return resolvedPath;
}

function rgb(hexColor) {
  const hex = hexColor.replace(/^#/, '');
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
}

/** Greedy word wrap, the shape of Python's `textwrap.wrap`. */
function wrapText(text, width) {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line === '') {
      line = word;
    } else if (line.length + 1 + word.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

class PdfPage {
  commands = [];

  rect(x, top, width, height, color) {
    const [red, green, blue] = rgb(color);
    const y = PAGE_HEIGHT - top - height;
    this.commands.push(
      `${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} rg ` +
        `${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re f`,
    );
  }

  text(x, top, value, { size = 12, color = '#1f2937', bold = false } = {}) {
    const [red, green, blue] = rgb(color);
    const font = bold ? 'F2' : 'F1';
    const y = PAGE_HEIGHT - top;
    this.commands.push(
      `BT /${font} ${size} Tf ${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} rg ` +
        `${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfEscape(value)}) Tj ET`,
    );
  }

  wrappedText(x, top, value, { size = 12, color = '#1f2937', bold = false, widthChars = 70, lineGap = 17 } = {}) {
    let y = top;
    const lines = wrapText(value, widthChars);
    for (const line of lines.length > 0 ? lines : ['']) {
      this.text(x, y, line, { size, color, bold });
      y += lineGap;
    }
    return y;
  }

  section(title, top, accent = '#2563eb') {
    this.rect(MARGIN, top - 17, 7, 24, accent);
    this.text(MARGIN + 17, top, title, { size: 18, color: '#111827', bold: true });
    return top + 31;
  }
}

function buildPdf(pages, outputPath) {
  const objects = [
    [1, '<< /Type /Catalog /Pages 2 0 R >>'],
    [3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],
    [4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'],
  ];

  const kids = [];
  pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const stream = safeText(page.commands.join('\n'));
    objects.push([
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    ]);
    objects.push([contentId, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]);
  });

  objects.push([2, `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`]);
  objects.sort((a, b) => a[0] - b[0]);

  const chunks = [Buffer.from('%PDF-1.4\n%âãÏÓ\n', 'latin1')];
  let length = chunks[0].length;
  const offsets = [];
  for (const [objectId, content] of objects) {
    offsets.push(length);
    const chunk = Buffer.from(`${objectId} 0 obj\n${content}\nendobj\n`, 'latin1');
    chunks.push(chunk);
    length += chunk.length;
  }

  const xrefStart = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));

  writeFileSync(outputPath, Buffer.concat(chunks));
}

function normalizeInterests(raw) {
  const interests = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return interests.length > 0 ? interests : ['food', 'history', 'art', 'views'];
}

function topExperiences(city, interests) {
  const experiences = [
    `Begin with a golden-hour walk through ${city}'s most atmospheric streets.`,
    'Choose one anchor museum, market, or landmark each day, then leave room for wandering.',
    'Plan a sunset viewpoint and a relaxed dinner nearby to avoid backtracking.',
  ];
  const interestMap = {
    food: 'Book one local food experience: a market crawl, cooking class, or neighborhood tasting route.',
    art: 'Add a gallery district or design shop loop for a creative afternoon.',
    history: 'Pair the main historic sight with a smaller local museum for context without crowds.',
    views: 'Build in a rooftop, hilltop, riverfront, or observation stop for photos.',
    neighborhoods: 'Explore two contrasting neighborhoods instead of trying to cross the whole city.',
    shopping: 'Save space for local makers, bookshops, markets, and design boutiques.',
    family: 'Alternate big sights with parks, treats, and short transit hops.',
  };
  for (const interest of interests) {
    if (interest in interestMap) experiences.push(interestMap[interest]);
  }
  return experiences.slice(0, 7);
}

function itinerary(city, days, interests) {
  const themes = [
    ['Arrival and icons', ['Historic center orientation walk', 'Signature landmark or museum', 'Sunset viewpoint']],
    ['Neighborhood flavor', ['Local market breakfast', 'Two-neighborhood walking loop', 'Casual dinner on a lively side street']],
    ['Culture and slow travel', ['Museum or gallery morning', 'Cafe break and independent shops', 'Evening performance or waterfront stroll']],
    ['Hidden corners', ['Quiet park or garden', 'Lesser-known district', 'Chef-led, street-food, or family-run dinner']],
    ['Day trip energy', ['Short regional excursion', 'Scenic lunch stop', 'Return for an easy evening']],
    ['Active city day', ['Bike, boat, hike, or long promenade', 'Picnic or food-hall lunch', 'Golden-hour photo route']],
    ['Favorites and farewell', ['Revisit the best neighborhood', 'Buy local gifts', 'Final meal with a view']],
  ];
  if (interests.includes('food')) themes[1][1][0] = 'Market breakfast and local tasting crawl';
  if (interests.includes('art')) themes[2][1][0] = 'Museum, gallery, or design district morning';
  if (interests.includes('views')) themes[0][1][2] = 'Best sunset viewpoint or rooftop';
  return Array.from({ length: days }, (_, index) => [`Day ${index + 1}: ${themes[index][0]}`, themes[index][1]]);
}

function addHeader(page, city, subtitle) {
  page.rect(0, 0, PAGE_WIDTH, 88, '#dbeafe');
  page.rect(0, 88, PAGE_WIDTH, 8, '#2563eb');
  page.text(MARGIN, 38, city, { size: 26, color: '#111827', bold: true });
  page.text(MARGIN, 66, subtitle, { size: 12, color: '#374151' });
}

function addBullets(page, items, top, { color = '#1f2937' } = {}) {
  let y = top;
  for (const item of items) {
    page.text(MARGIN + 8, y, '-', { size: 12, color: '#2563eb', bold: true });
    y = page.wrappedText(MARGIN + 25, y, item, { size: 11, color, widthChars: 72, lineGap: 15 });
    y += 6;
  }
  return y;
}

function buildTravelGuide(city, days, interests, tone, outputPath) {
  const pages = [];

  const cover = new PdfPage();
  cover.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, '#eff6ff');
  cover.rect(0, 0, PAGE_WIDTH, 170, '#2563eb');
  cover.rect(54, 122, 190, 12, '#f97316');
  cover.rect(268, 122, 115, 12, '#10b981');
  cover.rect(407, 122, 134, 12, '#facc15');
  cover.text(MARGIN, 82, 'Colorful City Guide', { size: 22, color: '#ffffff', bold: true });
  cover.text(MARGIN, 120, city, { size: 42, color: '#ffffff', bold: true });
  cover.wrappedText(
    MARGIN,
    210,
    `A ${days}-day ${tone} travel guide with itinerary ideas, local flavor, practical tips, and photo-worthy stops.`,
    { size: 16, color: '#111827', bold: true, widthChars: 52, lineGap: 22 },
  );
  cover.rect(MARGIN, 330, 487, 190, '#ffffff');
  cover.text(MARGIN + 26, 374, 'Best for', { size: 17, color: '#111827', bold: true });
  addBullets(
    cover,
    interests.slice(0, 6).map((interest) => interest.replace(/\b\w/g, (ch) => ch.toUpperCase())),
    405,
  );
  cover.text(MARGIN, 742, 'Generated by the Agent Framework travel-guide skill', { size: 11, color: '#6b7280' });
  pages.push(cover);

  const overview = new PdfPage();
  addHeader(overview, city, 'Highlights and planning compass');
  let y = overview.section('Top experiences', 140, '#f97316');
  y = addBullets(overview, topExperiences(city, interests), y);
  y = overview.section('Neighborhood strategy', y + 18, '#10b981');
  y = addBullets(
    overview,
    [
      'Pick one compact base area with easy transit and strong evening food options.',
      'Group sights by neighborhood so each day has fewer transfers and more serendipity.',
      'Use mornings for major attractions, afternoons for cafes and local streets, evenings for views and food.',
    ],
    y,
  );
  y = overview.section('Food and drink notes', y + 18, '#7c3aed');
  addBullets(
    overview,
    [
      'Reserve one special meal, then keep the rest flexible for markets, bakeries, and casual local spots.',
      'Ask for seasonal specialties and house recommendations rather than only ordering famous dishes.',
    ],
    y,
  );
  pages.push(overview);

  let plan = new PdfPage();
  addHeader(plan, city, `${days}-day itinerary`);
  y = 140;
  for (const [title, items] of itinerary(city, days, interests)) {
    if (y > 690) {
      pages.push(plan);
      plan = new PdfPage();
      addHeader(plan, city, `${days}-day itinerary continued`);
      y = 140;
    }
    y = plan.section(title, y, '#2563eb');
    y = addBullets(plan, items, y);
    y += 12;
  }
  pages.push(plan);

  const tips = new PdfPage();
  addHeader(tips, city, 'Practical tips and finishing touches');
  y = tips.section('Easy logistics', 140, '#10b981');
  y = addBullets(
    tips,
    [
      'Keep the first afternoon light: check in, walk the local area, and save the ambitious plan for day two.',
      'Download offline maps and pin your hotel, transit stops, dinner options, and backup rainy-day sights.',
      'Carry a reusable water bottle, a compact umbrella, and one comfortable layer for changing weather.',
    ],
    y,
  );
  y = tips.section('Photo checklist', y + 18, '#f97316');
  y = addBullets(
    tips,
    [
      'Wide establishing shot from a viewpoint',
      'Street detail: tiles, signs, doors, markets, or transit',
      'One food photo in natural light',
      'Blue-hour skyline or waterfront scene',
    ],
    y,
  );
  y = tips.section('Before you go', y + 18, '#7c3aed');
  addBullets(
    tips,
    [
      'Confirm opening days for museums and restaurants.',
      'Check local transit passes and airport transfer options.',
      'Leave one open block for discoveries, weather changes, or a slower morning.',
    ],
    y,
  );
  pages.push(tips);

  buildPdf(pages, outputPath);
  return pages.length;
}

function parseArgs(argv) {
  const options = {
    city: undefined,
    days: '3',
    interests: 'food,history,art,views',
    tone: 'first-time visitor',
    outputDir: env.TRAVEL_GUIDE_OUTPUT_DIR || resolve(homedir(), 'generated-travel-guides'),
  };
  const flagMap = {
    '--city': 'city',
    '--days': 'days',
    '--interests': 'interests',
    '--tone': 'tone',
    '--output-dir': 'outputDir',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const key = flagMap[flag];
    if (key === undefined) {
      console.error(`Unknown argument: ${flag}`);
      exit(2);
    }
    const value = argv[index + 1];
    if (value === undefined) {
      console.error(`Missing value for ${flag}`);
      exit(2);
    }
    options[key] = value;
    index += 1;
  }
  if (!options.city) {
    console.error('Missing required argument: --city');
    exit(2);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  const parsedDays = Number.parseInt(options.days, 10);
  const days = Math.min(Math.max(Number.isNaN(parsedDays) ? 3 : parsedDays, 1), 7);
  const interests = normalizeInterests(options.interests);
  const outputDir = resolve(options.outputDir);
  mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, `${slugify(options.city)}-${days}-day-travel-guide.pdf`);

  const pageCount = buildTravelGuide(options.city, days, interests, options.tone, outputPath);
  console.log(
    JSON.stringify(
      {
        city: options.city,
        days,
        interests,
        pages: pageCount,
        path: displayPath(outputPath),
        message: `Created a colorful PDF travel guide for ${options.city}.`,
      },
      null,
      2,
    ),
  );
}

main();
