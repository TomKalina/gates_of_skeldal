// Reader for the .DDL asset archive format (game/skeldal.ini: "data = ... path to
// skeldal.ddl"). Mirrors tools/ddl_ar_class.cpp exactly: u32 group id (unused) +
// u32 directory offset, then a flat directory of 12-byte uppercase name + u32
// data offset entries running up to the first file's data, then each file as a
// u32 size prefix followed by its raw bytes.
const NAME_FIELD_LENGTH = 12;
const DIRECTORY_ENTRY_LENGTH = NAME_FIELD_LENGTH + 4;

export interface DDLArchive {
  readonly directory: ReadonlyMap<string, number>;
  extract(name: string): Uint8Array | null;
}

export function openDDLArchive(buffer: ArrayBuffer): DDLArchive {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const dirOffset = view.getUint32(4, true);

  const directory = new Map<string, number>();
  let pos = dirOffset;
  let smallestOffset = Infinity;
  while (pos < smallestOffset) {
    if (pos + DIRECTORY_ENTRY_LENGTH > bytes.length) {
      throw new Error(`DDL archive: directory entry runs past end of file at offset ${pos}`);
    }
    const nameBytes = bytes.subarray(pos, pos + NAME_FIELD_LENGTH);
    const nul = nameBytes.indexOf(0);
    const name = new TextDecoder('ascii').decode(nul === -1 ? nameBytes : nameBytes.subarray(0, nul));
    const offset = view.getUint32(pos + NAME_FIELD_LENGTH, true);
    directory.set(name, offset);
    smallestOffset = Math.min(smallestOffset, offset);
    pos += DIRECTORY_ENTRY_LENGTH;
  }

  function extract(name: string): Uint8Array | null {
    const offset = directory.get(name.toUpperCase());
    if (offset === undefined) return null;
    const size = view.getUint32(offset, true);
    return bytes.subarray(offset + 4, offset + 4 + size);
  }

  return { directory, extract };
}
