/**
 * puz-parser.js — Across Lite .puz binary format parser
 * ES module: export { parsePuz }
 *
 * Header layout (52 bytes):
 *   0x00  2   file checksum
 *   0x02  12  magic "ACROSS&DOWN\0"
 *   0x0E  2   CIB checksum
 *   0x10  8   masked checksums
 *   0x18  4   version string
 *   0x1C  2   reserved
 *   0x1E  2   scrambled checksum
 *   0x20  12  reserved
 *   0x2C  1   width
 *   0x2D  1   height
 *   0x2E  2   number of clues (little-endian)
 *   0x30  2   unknown bitmask
 *   0x32  2   scrambled tag (non-zero = scrambled/locked)
 *   0x34  w×h solution grid  ('.' = black, letter = answer)
 *   0x34+w×h  w×h player state grid (ignored; we manage state)
 *   0x34+2×w×h  null-terminated strings:
 *               title, author, copyright,
 *               [numClues clue strings — interleaved by cell number],
 *               notepad
 *
 * Clue ordering in the file: for each numbered cell in ascending order,
 *   Across clue first (if the cell starts an Across answer),
 *   then Down clue (if the cell starts a Down answer).
 *   This is NOT "all Across then all Down" — they are interleaved.
 */

const MAGIC = 'ACROSS&DOWN\0';

/** Read null-terminated strings from a byte array starting at `offset`. */
function readStrings(bytes, offset, count) {
  const result = [];
  while (result.length < count && offset < bytes.length) {
    let end = offset;
    while (end < bytes.length && bytes[end] !== 0x00) end++;
    result.push(decodeBytes(bytes.slice(offset, end)));
    offset = end + 1;
  }
  return result;
}

/** Try UTF-8; fall back to ISO-8859-1 (most classic .puz files are Latin-1). */
function decodeBytes(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('iso-8859-1').decode(bytes);
  }
}

/**
 * Parse a .puz ArrayBuffer and return a puzzle object:
 * {
 *   width, height, title, author, copyright, notepad, isScrambled,
 *   solution: string[],            // flat row-major; '.' = black
 *   cellNumbers: (number|null)[][], // 2-D; null = no number
 *   clues: {
 *     across: [{number, text}],
 *     down:   [{number, text}]
 *   },
 *   wordMap: {
 *     across: (number|null)[][],   // clue number owning each cell (across)
 *     down:   (number|null)[][]    // clue number owning each cell (down)
 *   }
 * }
 */
export function parsePuz(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);

  // ── Validate magic ────────────────────────────────────────────────────────
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[0x02 + i] !== MAGIC.charCodeAt(i)) {
      throw new Error('Not a valid .puz file (magic string not found).');
    }
  }

  // ── Header fields ─────────────────────────────────────────────────────────
  const width    = bytes[0x2C];
  const height   = bytes[0x2D];
  // numClues: 2-byte little-endian at 0x2E
  const numClues = bytes[0x2E] | (bytes[0x2F] << 8);
  // scrambled tag: 2-byte little-endian at 0x32
  const isScrambled = (bytes[0x32] | (bytes[0x33] << 8)) !== 0;

  if (width === 0 || height === 0) {
    throw new Error('Invalid .puz file: zero-size grid.');
  }

  // ── Solution grid ─────────────────────────────────────────────────────────
  // Flat row-major array of length width × height.
  // '.' = black square; 'A'–'Z' = solution letter.
  const GRID_OFFSET = 0x34;
  const gridSize    = width * height;
  const solution    = [];
  for (let i = 0; i < gridSize; i++) {
    solution.push(String.fromCharCode(bytes[GRID_OFFSET + i]));
  }

  // ── Strings section ───────────────────────────────────────────────────────
  // Starts after both grids (solution + player-state).
  const stringsOffset = GRID_OFFSET + gridSize * 2;
  // Read: title, author, copyright, numClues clue strings, notepad
  const strings = readStrings(bytes, stringsOffset, 3 + numClues + 1);

  const title     = strings[0] ?? '';
  const author    = strings[1] ?? '';
  const copyright = strings[2] ?? '';
  const notepad   = strings[3 + numClues] ?? '';
  const rawClues  = strings.slice(3, 3 + numClues);

  // ── Cell numbering ────────────────────────────────────────────────────────
  // Standard crossword convention: scan row-major (left-to-right, top-to-bottom).
  // A white cell gets the next number if it starts an Across run (≥2 cells)
  // and/or a Down run (≥2 cells). A cell that starts BOTH gets ONE number.
  const cellNumbers  = Array.from({ length: height }, () => Array(width).fill(null));
  const acrossStarts = []; // { number, row, col } — cells starting an Across answer
  const downStarts   = []; // { number, row, col } — cells starting a Down answer
  let nextNumber = 1;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (solution[row * width + col] === '.') continue; // skip black squares

      // Does this cell start an Across answer?
      //   - Nothing white immediately to its left  (it's at the left edge, or left cell is black)
      //   - Something white immediately to its right
      const startsAcross =
        (col === 0 || solution[row * width + col - 1] === '.') &&
        (col + 1 < width && solution[row * width + col + 1] !== '.');

      // Does this cell start a Down answer?
      //   - Nothing white immediately above it
      //   - Something white immediately below it
      const startsDown =
        (row === 0 || solution[(row - 1) * width + col] === '.') &&
        (row + 1 < height && solution[(row + 1) * width + col] !== '.');

      if (startsAcross || startsDown) {
        cellNumbers[row][col] = nextNumber;
        if (startsAcross) acrossStarts.push({ number: nextNumber, row, col });
        if (startsDown)   downStarts.push({ number: nextNumber, row, col });
        nextNumber++;
      }
    }
  }

  // ── Clue assignment ───────────────────────────────────────────────────────
  // The .puz file stores clues interleaved by cell number:
  //   for each numbered cell (ascending order):
  //     Across clue first  (if this cell starts an Across answer)
  //     Down clue second   (if this cell starts a Down answer)
  //
  // We iterate cells in the same row-major order used for numbering, which
  // guarantees ascending cell-number order.
  const acrossNums = new Set(acrossStarts.map(s => s.number));
  const downNums   = new Set(downStarts.map(s => s.number));

  let clueIdx = 0;
  const acrossClues = [];
  const downClues   = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const num = cellNumbers[row][col];
      if (num === null) continue;

      if (acrossNums.has(num)) {
        acrossClues.push({ number: num, text: rawClues[clueIdx++] ?? '' });
      }
      if (downNums.has(num)) {
        downClues.push({ number: num, text: rawClues[clueIdx++] ?? '' });
      }
    }
  }

  // ── Word map ──────────────────────────────────────────────────────────────
  // For every white cell, record which clue number "owns" it in each direction.
  // Cells that are not part of any word in that direction get null.
  const wordMapAcross = Array.from({ length: height }, () => Array(width).fill(null));
  const wordMapDown   = Array.from({ length: height }, () => Array(width).fill(null));

  for (const { number, row, col } of acrossStarts) {
    let c = col;
    while (c < width && solution[row * width + c] !== '.') {
      wordMapAcross[row][c] = number;
      c++;
    }
  }

  for (const { number, row, col } of downStarts) {
    let r = row;
    while (r < height && solution[r * width + col] !== '.') {
      wordMapDown[r][col] = number;
      r++;
    }
  }

  // ── Debug output (visible in browser DevTools console) ───────────────────
  console.group('[puz-parser] Parsed puzzle');
  console.log('Title:', title, '| Author:', author);
  console.log(`Grid: ${width}×${height}, ${numClues} clues, scrambled: ${isScrambled}`);
  console.log('Solution rows:', Array.from({ length: height }, (_, r) =>
    solution.slice(r * width, (r + 1) * width).join('')));
  console.log('Cell numbers:', cellNumbers);
  console.log('Across clues:', acrossClues);
  console.log('Down clues:', downClues);
  console.groupEnd();

  return {
    width,
    height,
    title,
    author,
    copyright,
    notepad,
    isScrambled,
    solution,
    cellNumbers,
    clues: { across: acrossClues, down: downClues },
    wordMap: { across: wordMapAcross, down: wordMapDown }
  };
}
