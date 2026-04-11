/**
 * puz-parser.js
 * Parses the binary Across Lite .puz format from an ArrayBuffer.
 * ES module — export { parsePuz }
 */

/**
 * Decode a byte slice as UTF-8, falling back to ISO-8859-1.
 * Most classic .puz files use Latin-1; modern ones use UTF-8.
 */
function decodeString(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('iso-8859-1').decode(bytes);
  }
}

/**
 * Parse a .puz file from an ArrayBuffer.
 *
 * Returns:
 * {
 *   width, height, title, author, copyright, notepad,
 *   isScrambled,
 *   solution: string[],          // flat row-major; '.' = black square
 *   cellNumbers: (number|null)[][], // 2D; null = no number
 *   clues: {
 *     across: [{number, text}],
 *     down:   [{number, text}]
 *   },
 *   wordMap: {
 *     across: (number|null)[][],  // clue number that owns each cell
 *     down:   (number|null)[][]
 *   }
 * }
 */
export function parsePuz(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  // ── Header ────────────────────────────────────────────────────────────────
  const width     = bytes[0x2C];
  const height    = bytes[0x2D];
  const numClues  = view.getUint16(0x2E, true /* little-endian */);
  const scrambledTag = view.getUint16(0x32, true);
  const isScrambled  = scrambledTag !== 0;

  const gridSize = width * height;

  // ── Grids ─────────────────────────────────────────────────────────────────
  // Solution grid: width×height bytes starting at 0x34
  const solutionStart = 0x34;
  const solution = [];
  for (let i = 0; i < gridSize; i++) {
    solution.push(String.fromCharCode(bytes[solutionStart + i]));
  }

  // Player state grid follows immediately (we don't use it; we manage state ourselves)
  // But we do skip past it to find the strings section.
  const stringsStart = solutionStart + gridSize * 2;

  // ── Strings section ───────────────────────────────────────────────────────
  // Null-terminated strings: title, author, copyright, [numClues clues], notepad
  const strings = [];
  let offset = stringsStart;
  while (offset < bytes.length) {
    const start = offset;
    while (offset < bytes.length && bytes[offset] !== 0x00) {
      offset++;
    }
    strings.push(decodeString(bytes.slice(start, offset)));
    offset++; // skip null terminator
    // Stop once we have all required strings (3 meta + numClues + optional notepad)
    // We'll collect everything and index by position.
    if (strings.length >= 3 + numClues + 1) break;
  }

  const title     = strings[0] ?? '';
  const author    = strings[1] ?? '';
  const copyright = strings[2] ?? '';
  const notepad   = strings[3 + numClues] ?? '';
  const rawClues  = strings.slice(3, 3 + numClues);

  // ── Cell Numbering ────────────────────────────────────────────────────────
  // Scan row-major. A cell gets a number if it starts an Across run (≥2 cells)
  // OR a Down run (≥2 cells). Isolated white cells get no number.
  const cellNumbers = Array.from({ length: height }, () => Array(width).fill(null));
  let clueNumber = 1;

  // Track which numbered cells start across/down words
  const acrossStarts = []; // { number, row, col }
  const downStarts   = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (solution[row * width + col] === '.') continue; // black square

      const leftIsBlackOrEdge  = col === 0 || solution[row * width + col - 1] === '.';
      const rightIsWhite       = col + 1 < width && solution[row * width + col + 1] !== '.';
      const aboveIsBlackOrEdge = row === 0 || solution[(row - 1) * width + col] === '.';
      const belowIsWhite       = row + 1 < height && solution[(row + 1) * width + col] !== '.';

      const startsAcross = leftIsBlackOrEdge && rightIsWhite;
      const startsDown   = aboveIsBlackOrEdge && belowIsWhite;

      if (startsAcross || startsDown) {
        cellNumbers[row][col] = clueNumber;
        if (startsAcross) acrossStarts.push({ number: clueNumber, row, col });
        if (startsDown)   downStarts.push({ number: clueNumber, row, col });
        clueNumber++;
      }
    }
  }

  // ── Assign Clue Texts ────────────────────────────────────────────────────
  // .puz delivers clues in reading order: all across (by number) then all down (by number).
  let clueIdx = 0;
  const acrossClues = acrossStarts.map(({ number }) => ({
    number,
    text: rawClues[clueIdx++] ?? ''
  }));
  const downClues = downStarts.map(({ number }) => ({
    number,
    text: rawClues[clueIdx++] ?? ''
  }));

  // ── Word Map ──────────────────────────────────────────────────────────────
  // For each white cell, record which across/down clue number owns it.
  const wordMapAcross = Array.from({ length: height }, () => Array(width).fill(null));
  const wordMapDown   = Array.from({ length: height }, () => Array(width).fill(null));

  // Propagate across ownership rightward from each across start
  for (const { number, row, col } of acrossStarts) {
    let c = col;
    while (c < width && solution[row * width + c] !== '.') {
      wordMapAcross[row][c] = number;
      c++;
    }
  }

  // Propagate down ownership downward from each down start
  for (const { number, row, col } of downStarts) {
    let r = row;
    while (r < height && solution[r * width + col] !== '.') {
      wordMapDown[r][col] = number;
      r++;
    }
  }

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
    clues: {
      across: acrossClues,
      down:   downClues
    },
    wordMap: {
      across: wordMapAcross,
      down:   wordMapDown
    }
  };
}
