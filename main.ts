// "The World in One Day" — Monday 23 November 2026 front page.
// Entry program for the make.fun news-image-20261123 competition.
//
// The repository ships the finished front page as entry.png. This program
// checks that the file is a complete, well-formed PNG of exactly the size
// the rules require, then copies its bytes unchanged to the output
// directory, so both grading runs write byte-identical files.
//
// Checks, in order:
//   1. file size is within the 1 MiB cap;
//   2. the file starts with the PNG signature;
//   3. the IHDR chunk describes a 1024 x 1024 image;
//   4. every chunk's CRC-32 matches the bytes it covers;
//   5. the chunk chain ends with IEND and nothing follows it.
//
// Node 22 standard library only, no network, no other files read.
// Run locally with:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import * as fs from 'node:fs';
import * as path from 'node:path';

const IMAGE = 'entry.png';
const WANT_W = 1024;
const WANT_H = 1024;
const MAX_BYTES = 1024 * 1024;

const PNG_SIG = Buffer.from('89504e470d0a1a0a', 'hex');

function fail(msg: string): never {
  throw new Error(`entry.png failed validation: ${msg}`);
}

// Build the CRC-32 table PNG chunks use (polynomial 0xEDB88320).
const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function main(): void {
  const bytes = fs.readFileSync(new URL(`./${IMAGE}`, import.meta.url));
  if (bytes.length > MAX_BYTES) {
    fail(`is ${bytes.length} bytes, over the 1 MiB cap`);
  }
  if (bytes.length < PNG_SIG.length + 25) fail('file is too short');
  if (!bytes.subarray(0, 8).equals(PNG_SIG)) fail('bad PNG signature');

  // First chunk must be a 13-byte IHDR.
  if (bytes.readUInt32BE(8) !== 13) fail('first chunk is not a 13-byte IHDR');
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') fail('first chunk is not IHDR');
  const w = bytes.readUInt32BE(16);
  const h = bytes.readUInt32BE(20);
  if (w !== WANT_W || h !== WANT_H) {
    fail(`must be ${WANT_W}x${WANT_H}, got ${w}x${h}`);
  }

  // Walk the chunk chain, checking each CRC, until IEND.
  let off = 8;
  let ended = false;
  while (off + 12 <= bytes.length) {
    const len = bytes.readUInt32BE(off);
    const type = bytes.toString('latin1', off + 4, off + 8);
    const end = off + 12 + len;
    if (end > bytes.length) fail(`chunk ${type} runs past the end`);
    const stored = bytes.readUInt32BE(off + 8 + len);
    const actual = crc32(bytes.subarray(off + 4, off + 8 + len));
    if (stored !== actual) fail(`chunk ${type} has a bad CRC`);
    off = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended) fail('no terminating IEND chunk');
  if (off !== bytes.length) fail('bytes follow the IEND chunk');

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, IMAGE);
  fs.writeFileSync(out, bytes);
  if (!fs.readFileSync(out).equals(bytes)) {
    throw new Error('output copy differs from entry.png');
  }
}

main();
