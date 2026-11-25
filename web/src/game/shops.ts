export const SHP_SELL = 0x1;
export const SHP_BUY = 0x2;
export const SHP_AUTOADD = 0x4;
export const SHP_SPECIAL = 0x8;
export const SHP_NOEDIT = 0x40;
export const SHP_TYPE = 0x80;

export const TSHOP_SIZE = 51;
export const TPRODUCT_SIZE = 16;

export interface Product {
  item: number;
  cena: number;
  tradeFlags: number;
  pocet: number;
  maxPocet: number;
}

export interface ProductState {
  count: number;
  previousPrice: number;
}

export interface Shop {
  keeper: string;
  picture: string;
  koef: number;
  products: number;
  shopId: number;
  listSize: number;
  specMax: number;
  list: Product[];
  state: ProductState[];
}

function readCString(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset;
  while (end < offset + length && bytes[end] !== 0) end++;
  let s = "";
  for (let i = offset; i < end; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return s;
}

export function parseShops(buffer: ArrayBuffer, names?: ReadonlyMap<number, string>): Shop[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let off = 0;
  const maxShops = view.getInt32(off, true);
  off += 4;
  const shops: Shop[] = [];
  for (let i = 0; i < maxShops; i++) {
    let keeper = readCString(bytes, off, 16);
    const picture = readCString(bytes, off + 16, 13);
    const koef = view.getInt32(off + 29, true);
    const products = view.getInt32(off + 33, true);
    const shopId = view.getInt32(off + 37, true);
    const listSize = view.getInt32(off + 41, true);
    const specMax = view.getInt16(off + 45, true);
    off += TSHOP_SIZE;
    const name = names?.get(shopId);
    if (name !== undefined) keeper = name.slice(0, 15);
    const list: Product[] = [];
    const state: ProductState[] = [];
    for (let j = 0; j < products; j++) {
      const p: Product = {
        item: view.getInt16(off, true),
        cena: view.getInt32(off + 2, true),
        tradeFlags: view.getInt16(off + 6, true),
        pocet: view.getInt32(off + 8, true),
        maxPocet: view.getInt32(off + 12, true),
      };
      off += TPRODUCT_SIZE;
      list.push(p);
      state.push({ count: p.pocet & 0xffff, previousPrice: 0 });
    }
    shops.push({ keeper, picture, koef, products, shopId, listSize, specMax, list, state });
  }
  return shops;
}

function cdiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

export function makeOffer(shop: Shop, item: number): number {
  const i = item - 1;
  for (let j = 0; j < shop.listSize; j++) {
    const p = shop.list[j];
    if (p && p.item === i && p.tradeFlags & SHP_BUY) return p.cena - cdiv(p.cena * shop.koef, 100);
  }
  return 0;
}

export function getSellPrice(shop: Shop, item: number): number {
  const i = item - 1;
  for (let j = 0; j < shop.listSize; j++) {
    const p = shop.list[j];
    const s = shop.state[j];
    if (p && s && p.item === i && p.tradeFlags & SHP_SELL && s.count > 0) return p.cena + cdiv(p.cena * shop.koef, 100);
  }
  return 0;
}

export function findSellProduct(shop: Shop, item: number): Product | null {
  const i = item - 1;
  for (let j = 0; j < shop.listSize; j++) {
    const p = shop.list[j];
    if (p && p.item === i) return p;
  }
  return null;
}

function adjustCount(shop: Shop, item: number, delta: number): void {
  const i = item - 1;
  for (let j = 0; j < shop.listSize; j++) {
    const p = shop.list[j];
    const s = shop.state[j];
    if (p && s && p.item === i) {
      s.count = (s.count + delta) & 0xffff;
      return;
    }
  }
}

export function sellItem(shop: Shop, item: number): void {
  adjustCount(shop, item, -1);
}

export function buyItem(shop: Shop, item: number): void {
  adjustCount(shop, item, 1);
}
