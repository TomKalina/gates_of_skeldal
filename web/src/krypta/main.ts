import { createScreenCanvas } from '../platform/canvas-context';
import { runDungeonView } from '../game/dungeon-view';
import type { Direction } from '../game/dungeon';
import { buildKryptaMap, DEFEAT_TEXT, VICTORY_TEXT } from './map';
import { createEncounter } from '../game/encounter';
import { createKryptaMobs, KRYPTA_CONSUMABLES, KRYPTA_FIGHTERS } from './actors';
import { createKryptaTextures } from './textures';
import { createPartyDeskPanel, KRYPTA_PARTY } from './party';

const root = document.getElementById('app');
if (!root) throw new Error('#app root missing');

const ctx = createScreenCanvas(root);
const { map, levelTexts, macros, mobSpawns } = buildKryptaMap();

runDungeonView(
  ctx,
  { map, sector: map.startSector, direction: map.startDirection as Direction },
  createKryptaTextures(),
  KRYPTA_PARTY,
  { deskPanel: createPartyDeskPanel() },
  () => Promise.resolve(null),
  levelTexts,
  {},
  {
    encounter: createEncounter(createKryptaMobs(mobSpawns), KRYPTA_PARTY, KRYPTA_FIGHTERS),
    macros: { table: macros, states: new Uint8Array(macros.count) },
    consumables: KRYPTA_CONSUMABLES,
    endings: { victory: VICTORY_TEXT, defeat: DEFEAT_TEXT },
  },
);
