import { describe, expect, it } from 'vitest';
import { openDDLArchive } from './ddl-archive';

// Builds a synthetic archive using the exact layout tools/ddl_ar.cpp writes,
// so this never touches real (copyrighted) game data.
function buildArchive(files: Array<{ name: string; data: Uint8Array }>): ArrayBuffer {
  const headerSize = 8;
  const dirEntrySize = 16;
  const dirSize = files.length * dirEntrySize;
  let dataOffset = headerSize + dirSize;
  const offsets = files.map((f) => {
    const offset = dataOffset;
    dataOffset += 4 + f.data.length;
    return offset;
  });

  const buffer = new ArrayBuffer(dataOffset);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint32(0, 0, true); // group (unused)
  view.setUint32(4, headerSize, true); // dir offset

  let pos = headerSize;
  files.forEach((f, i) => {
    const nameBytes = new TextEncoder().encode(f.name.toUpperCase());
    bytes.set(nameBytes.subarray(0, 12), pos);
    view.setUint32(pos + 12, offsets[i]!, true);
    pos += dirEntrySize;
  });

  files.forEach((f, i) => {
    const offset = offsets[i]!;
    view.setUint32(offset, f.data.length, true);
    bytes.set(f.data, offset + 4);
  });

  return buffer;
}

describe('openDDLArchive', () => {
  it('lists and extracts files by uppercase 8.3 name', () => {
    const a = new TextEncoder().encode('hello');
    const b = new TextEncoder().encode('world!!');
    const archive = openDDLArchive(buildArchive([
      { name: 'A.TXT', data: a },
      { name: 'BEE.TXT', data: b },
    ]));

    expect(archive.directory.size).toBe(2);
    expect(archive.directory.has('A.TXT')).toBe(true);
    expect(new TextDecoder().decode(archive.extract('A.TXT')!)).toBe('hello');
    expect(new TextDecoder().decode(archive.extract('bee.txt')!)).toBe('world!!');
  });

  it('returns null for a missing file', () => {
    const archive = openDDLArchive(buildArchive([{ name: 'A.TXT', data: new Uint8Array([1]) }]));
    expect(archive.extract('MISSING.TXT')).toBeNull();
  });
});
