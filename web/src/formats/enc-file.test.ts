import { describe, expect, it } from 'vitest';
import { parseEncFile } from './enc-file';

// Builds a synthetic .ENC buffer: applies the *forward* running-sum
// cipher (the inverse of enc-file.ts's decode step) to raw Kamenický-
// encoded bytes, so parseEncFile round-trips back to the original text.
function encodeEnc(decodedBytes: number[]): ArrayBuffer {
  const encoded = new Uint8Array(decodedBytes.length);
  let last = 0;
  for (let i = 0; i < decodedBytes.length; i++) {
    encoded[i] = (decodedBytes[i]! - last) & 0xff;
    last = decodedBytes[i]!;
  }
  return encoded.buffer;
}

function bytes(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

describe('parseEncFile', () => {
  it('decodes plain ASCII entries, skipping comments and blank lines, stopping at -1', () => {
    const lines = ['; a comment line', '', '0 track01.mus', '1 Hello there', '-1', ''];
    const buffer = encodeEnc(bytes(lines.join('\r\n')));
    const entries = parseEncFile(buffer);
    expect(entries.get(0)).toBe('track01.mus');
    expect(entries.get(1)).toBe('Hello there');
    expect(entries.size).toBe(2);
  });

  it('converts | within a line to an embedded newline', () => {
    const buffer = encodeEnc(bytes('2 First line|Second line\r\n-1\r\n'));
    const entries = parseEncFile(buffer);
    expect(entries.get(2)).toBe('First line\nSecond line');
  });

  it('trims trailing whitespace but keeps the text otherwise intact', () => {
    const buffer = encodeEnc(bytes('3 Padded text   \r\n-1\r\n'));
    expect(parseEncFile(buffer).get(3)).toBe('Padded text');
  });

  it('converts Kamenický diacritic bytes to the correct Unicode characters', () => {
    // 0xA0 -> Windows-1250 0xE1 -> 'á'; 0x9D -> 0xDD -> 'Ý' (see
    // KAMENICKY_TO_WINDOWS_1250's own table, cross-checked against the
    // real LESPRED.ENC/SKRETI.ENC decode in the codebase's own history).
    const buffer = encodeEnc([...bytes('4 '), 0xa0, ...bytes('no'), 0x9d, 0x0d, 0x0a, ...bytes('-1'), 0x0d, 0x0a]);
    expect(parseEncFile(buffer).get(4)).toBe('ánoÝ');
  });
});
