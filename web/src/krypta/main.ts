import { createScreenCanvas } from '../platform/canvas-context';
import { runDungeonView } from '../game/dungeon-view';
import type { Direction } from '../game/dungeon';
import { buildKryptaMap } from './map';
import { createKryptaTextures } from './textures';
import { createPartyDeskPanel, KRYPTA_PARTY } from './party';

const root = document.getElementById('app');
if (!root) throw new Error('#app root missing');

const ctx = createScreenCanvas(root);
const { map, levelTexts } = buildKryptaMap();

runDungeonView(
  ctx,
  { map, sector: map.startSector, direction: map.startDirection as Direction },
  createKryptaTextures(),
  KRYPTA_PARTY,
  { deskPanel: createPartyDeskPanel() },
  () => Promise.resolve(null),
  levelTexts,
);
