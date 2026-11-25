import type { Character } from './party';

// A single implicit localStorage slot — there's no save-slot picker UI,
// and no inventory/combat state exists yet to persist beyond position and
// the party's chargen-rolled stats.
const SAVE_KEY = 'skeldal:dungeon-save';

export interface DungeonSave {
  mapName: string;
  sector: number;
  direction: number;
  party: readonly Character[];
}

export function readSave(): DungeonSave | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DungeonSave;
  } catch {
    return null;
  }
}

export function writeSave(save: DungeonSave): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}
