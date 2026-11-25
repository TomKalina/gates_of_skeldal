// Parser for the game's .ENC level-text format (game/interfac.c:
// enc_open/load_string_list_ex). Two independent transforms stack:
//
// 1. A trivial running-sum byte cipher — enc_open's fallback branch, used
//    whenever no plaintext companion file exists (the only case this
//    port's data has, since every map ships only the .ENC form):
//    `last=(last+encdata[i])&0xFF; encdata[i]=last;` run once over the
//    *whole* file (not reset per line) is the decode step; decoded[i] =
//    (decoded[i-1] + raw[i]) & 0xFF, decoded[-1] = 0.
// 2. The decoded bytes are Kamenický (DOS Czech code page) text. This port
//    converts it to real Unicode via libs/cztable.c's 36-entry diacritic
//    remap into Windows-1250, then a standard WHATWG TextDecoder — the
//    original never does this (its own bitmap font renders Kamenický
//    bytes directly; kamenik2windows is export-tooling only, see
//    game/gen_stringtable.c), but this port draws text with a real system
//    font, so it needs actual Unicode. Verified against the real
//    LESPRED.ENC/SKRETI.ENC: decodes to grammatically correct, correctly-
//    accented Czech ("Tvé dobrodružství začalo ve Fregharově obydlí...").
//
// The decoded text is a simple line-oriented format (load_string_list_ex):
// blank lines and `;`-prefixed comments are skipped, each real line is
// `<index> <text>` (index -1 terminates the list), trailing whitespace is
// trimmed, and `|` within the text means an embedded newline. Entry 0 is
// always the map's music playlist (game/realgame.c:
// `create_playlist(level_texts[0])`), never real display text.
const KAMENICKY_TO_WINDOWS_1250: readonly (readonly [number, number])[] = [
  [0xa0, 0xe1], [0x87, 0xe8], [0x83, 0xef], [0x82, 0xe9], [0x88, 0xec],
  [0xa1, 0xed], [0x8d, 0xe5], [0x8c, 0xbe], [0xa4, 0xf2], [0xa2, 0xf3],
  [0xaa, 0xe0], [0xa9, 0xf8], [0xa8, 0x9a], [0x9f, 0x9d], [0xa3, 0xfa],
  [0x96, 0xf9], [0x98, 0xfd], [0x91, 0x9e], [0x8f, 0xc1], [0x80, 0xc8],
  [0x85, 0xcf], [0x90, 0xc9], [0x89, 0xcc], [0x8b, 0xcd], [0x8a, 0xc5],
  [0x9c, 0xbc], [0xa5, 0xd2], [0x95, 0xd3], [0xab, 0xc0], [0x9e, 0xd8],
  [0x9b, 0x8a], [0x86, 0x8d], [0x97, 0xda], [0xa6, 0xd9], [0x9d, 0xdd],
  [0x92, 0x8e],
];

function buildKamenickyToWindows1250Table(): Uint8Array {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = i;
  for (const [kamenicky, windows] of KAMENICKY_TO_WINDOWS_1250) table[kamenicky] = windows;
  return table;
}
const KAMENICKY_TABLE = buildKamenickyToWindows1250Table();

function decodeRunningSumCipher(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  let last = 0;
  for (let i = 0; i < bytes.length; i++) {
    last = (last + bytes[i]!) & 0xff;
    out[i] = last;
  }
  return out;
}

function kamenickyToUnicode(bytes: Uint8Array): string {
  const windows1250 = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) windows1250[i] = KAMENICKY_TABLE[bytes[i]!]!;
  return new TextDecoder('windows-1250').decode(windows1250);
}

const ENTRY_LINE = /^(-?\d+)\s*(.*)$/;

export function parseEncFile(buffer: ArrayBuffer): ReadonlyMap<number, string> {
  const decoded = decodeRunningSumCipher(new Uint8Array(buffer));
  const text = kamenickyToUnicode(decoded);
  const entries = new Map<number, string>();

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trimStart();
    if (line === '' || line.startsWith(';')) continue;
    const match = ENTRY_LINE.exec(line);
    if (!match) continue;
    const index = Number(match[1]);
    if (index === -1) break;
    const value = (match[2] ?? '').replace(/\s+$/, '').replace(/\|/g, '\n');
    entries.set(index, value);
  }

  return entries;
}
