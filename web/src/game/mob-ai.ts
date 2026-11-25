export const SD_MONST_IMPS = 0x4;
export const MC_PLAYER = 0x4;
export const MOB_BIG = 0x8;
export const MOB_PASSABLE = 0x2;

export interface MobMap {
  sectorCount: number;
  sideFlags(sector: number, dir: number): number;
  stepNext(sector: number, dir: number): number;
  coordFlags(sector: number): number;
  mobsOnSector(sector: number): number;
  mobAt(sector: number): { stayStrategy: number; next: number } | null;
}

export function mobExitCount(map: MobMap, sector: number, dir: number): number {
  const free = (d: number): number => ((map.sideFlags(sector, d & 3) & SD_MONST_IMPS) === 0 ? 1 : 0);
  return free(dir) + free(dir + 1) + free(dir - 1);
}

export function mobCheckNextSector(map: MobMap, sect: number, dir: number, alone: number, passable: number): 0 | 1 | 2 {
  if (map.sideFlags(sect, dir) & SD_MONST_IMPS) return 1;
  const next = map.stepNext(sect, dir);
  if (map.coordFlags(next) & MC_PLAYER && ~passable & MOB_PASSABLE) return 2;
  const mob = map.mobAt(next);
  if (!mob) return 0;
  if (alone & MOB_BIG) return 1;
  if (mob.stayStrategy & MOB_BIG) return 1;
  if (mob.next === 0) return 0;
  return 1;
}

export function mobPickExit(map: MobMap, r: number, sector: number, dir: number, alone: number, mobile: number): number {
  let cnt = 0;
  let d = (dir - 1) & 3;
  for (; r > 0 && cnt < 5; cnt++, d = (d + 1) & 3) {
    if (!mobCheckNextSector(map, sector, d, alone, mobile)) {
      r--;
      if (!r) break;
    }
  }
  return cnt === 5 ? -1 : d;
}

export function findPath(map: MobMap, start: number, goal: number, flag: number, maxMobs: number): number[] | null {
  const visited = new Uint8Array(map.sectorCount + 8);
  const queue: number[] = [start];
  const parent: number[] = [-1];
  visited[start] = 1;
  let cur = 0;
  let d = -1;
  for (; cur < queue.length; cur++) {
    const ss = queue[cur] as number;
    d = -1;
    for (let i = 0; i < 4; i++) {
      if (map.sideFlags(ss, i) & flag) continue;
      d = map.stepNext(ss, i);
      if (!visited[d] && map.mobsOnSector(d) < maxMobs) {
        visited[d] = 1;
        queue.push(d);
        parent.push(cur);
      }
      if (d === goal) break;
    }
    if (d === goal) break;
  }
  if (queue.length === cur) return null;
  const path: number[] = [];
  let p = queue.length - 1;
  while (queue[p] !== start) {
    path.push(queue[p] as number);
    p = parent[p] as number;
  }
  return path.reverse();
}
