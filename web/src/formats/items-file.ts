// Parser for ITEMS.DAT (game/inv.c: load_items/load_section) — the same
// tag+type+size+ignored+payload block container as .MAP (see map-file.ts),
// with its own, unrelated section-type numbering (game/inv.c's SV_*
// constants and small literal case values, not the .MAP file's A_*
// constants).
//
// Only what floor-item rendering needs is extracted here: each item's
// resolved appearance texture. TITEM.vzhled (a real 222-byte struct field,
// offset 140 — confirmed by compiling the real struct with `-funsigned-
// char` and reading offsetof(), since the source's own inline byte-offset
// comments have drifted from the actual field layout) is a 1-based index
// into section 1's filename list ("face 0" — the only face floor rendering
// ever uses: draw_placed_items_normal/draw_vyklenek both hardcode
// `ablock(vzhled+face_arr[0])`). Sections 2-5 (other facings, spell-effect
// frames, weapon-attack .mgf animations) and the sound-name section are for
// combat/inventory-UI features not in scope yet — read past, not stored.
const BLOCK_TAG = '<BLOCK>\0';
const TAG_LENGTH = 8;
const SECTION_FACE0 = 1;
const SECTION_ITEM_LIST = 0x8001;
const SECTION_END = 0x8000;

const TITEM_SIZE = 222;
const TITEM_VZHLED_OFFSET = 140;

export interface ItemsFile {
  // itemAppearance[itemNumber - 1] = this item's floor-appearance texture
  // filename, or null if it has none (TITEM.vzhled === 0).
  itemAppearance: readonly (string | null)[];
}

function readCString(bytes: Uint8Array, start: number, end: number): string {
  let i = start;
  while (i < end && bytes[i] !== 0) i++;
  return new TextDecoder('ascii').decode(bytes.subarray(start, i));
}

function readNulSeparatedList(bytes: Uint8Array): string[] {
  const names: string[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      if (i > start) names.push(readCString(bytes, start, i));
      start = i + 1;
    }
  }
  return names;
}

export function parseItemsFile(buffer: ArrayBuffer): ItemsFile {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const tagBytes = new TextEncoder().encode(BLOCK_TAG);

  let pos = 0;
  let faceTextures: string[] = [];
  let vzhledByItem: number[] = [];

  for (;;) {
    if (pos + TAG_LENGTH + 12 > bytes.length) break;
    for (let i = 0; i < TAG_LENGTH; i++) {
      if (bytes[pos + i] !== tagBytes[i]) {
        throw new Error(`ITEMS.DAT: expected block tag "<BLOCK>" at offset ${pos}`);
      }
    }
    const sectionType = view.getInt32(pos + TAG_LENGTH, true);
    const size = view.getInt32(pos + TAG_LENGTH + 4, true);
    const payloadStart = pos + TAG_LENGTH + 12;
    if (sectionType === SECTION_END) break;
    const payload = bytes.subarray(payloadStart, payloadStart + size);

    if (sectionType === SECTION_FACE0) {
      faceTextures = readNulSeparatedList(payload);
    } else if (sectionType === SECTION_ITEM_LIST) {
      const count = Math.floor(size / TITEM_SIZE);
      vzhledByItem = new Array<number>(count);
      for (let i = 0; i < count; i++) {
        vzhledByItem[i] = view.getUint16(payloadStart + i * TITEM_SIZE + TITEM_VZHLED_OFFSET, true);
      }
    }

    pos = payloadStart + size;
  }

  const itemAppearance = vzhledByItem.map((vzhled) => (vzhled > 0 ? (faceTextures[vzhled - 1] ?? null) : null));
  return { itemAppearance };
}
