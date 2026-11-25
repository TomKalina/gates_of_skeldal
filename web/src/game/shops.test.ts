import { describe, expect, it } from "vitest";
import { SHP_BUY, SHP_SELL, TPRODUCT_SIZE, TSHOP_SIZE, buyItem, findSellProduct, getSellPrice, makeOffer, parseShops, sellItem } from "./shops";

interface P { item: number; cena: number; flags: number; pocet: number; max: number }

function build(shops: { keeper: string; picture: string; koef: number; id: number; spec: number; products: P[] }[]): ArrayBuffer {
  let size = 4;
  for (const s of shops) size += TSHOP_SIZE + s.products.length * TPRODUCT_SIZE;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  const b = new Uint8Array(buf);
  let o = 0;
  v.setInt32(o, shops.length, true);
  o += 4;
  for (const s of shops) {
    for (let i = 0; i < s.keeper.length; i++) b[o + i] = s.keeper.charCodeAt(i);
    for (let i = 0; i < s.picture.length; i++) b[o + 16 + i] = s.picture.charCodeAt(i);
    v.setInt32(o + 29, s.koef, true);
    v.setInt32(o + 33, s.products.length, true);
    v.setInt32(o + 37, s.id, true);
    v.setInt32(o + 41, s.products.length, true);
    v.setInt16(o + 45, s.spec, true);
    v.setInt32(o + 47, 0xdeadbeef | 0, true);
    o += TSHOP_SIZE;
    for (const p of s.products) {
      v.setInt16(o, p.item, true);
      v.setInt32(o + 2, p.cena, true);
      v.setInt16(o + 6, p.flags, true);
      v.setInt32(o + 8, p.pocet, true);
      v.setInt32(o + 12, p.max, true);
      o += TPRODUCT_SIZE;
    }
  }
  return buf;
}

const fixture = build([
  {
    keeper: "Bertram",
    picture: "SHOP01.PCX",
    koef: 25,
    id: 7,
    spec: 2,
    products: [
      { item: 10, cena: 100, flags: SHP_SELL | SHP_BUY, pocet: 3, max: 5 },
      { item: 11, cena: 33, flags: SHP_BUY, pocet: 0, max: 0 },
    ],
  },
  { keeper: "Empty", picture: "X.PCX", koef: 0, id: 8, spec: 0, products: [] },
]);

describe("parseShops", () => {
  it("parses packed TSHOP and TPRODUCT records", () => {
    const shops = parseShops(fixture);
    expect(shops).toHaveLength(2);
    const s = shops[0]!;
    expect(s.keeper).toBe("Bertram");
    expect(s.picture).toBe("SHOP01.PCX");
    expect(s.koef).toBe(25);
    expect(s.shopId).toBe(7);
    expect(s.specMax).toBe(2);
    expect(s.list[0]).toEqual({ item: 10, cena: 100, tradeFlags: 3, pocet: 3, maxPocet: 5 });
    expect(s.state[0]).toEqual({ count: 3, previousPrice: 0 });
    expect(shops[1]!.list).toEqual([]);
  });

  it("overrides keeper name from string table", () => {
    const shops = parseShops(fixture, new Map([[7, "A very long keeper name"]]));
    expect(shops[0]!.keeper).toBe("A very long kee");
  });
});

describe("prices and trade", () => {
  it("computes offer and sell price with koef, truncating like C", () => {
    const s = parseShops(fixture)[0]!;
    expect(makeOffer(s, 11)).toBe(75);
    expect(makeOffer(s, 12)).toBe(33 - 8);
    expect(getSellPrice(s, 11)).toBe(125);
    expect(getSellPrice(s, 12)).toBe(0);
    expect(makeOffer(s, 99)).toBe(0);
  });

  it("sell/buy adjust stock and sell price drops to 0 when sold out", () => {
    const s = parseShops(fixture)[0]!;
    sellItem(s, 11);
    sellItem(s, 11);
    sellItem(s, 11);
    expect(s.state[0]!.count).toBe(0);
    expect(getSellPrice(s, 11)).toBe(0);
    buyItem(s, 11);
    expect(getSellPrice(s, 11)).toBe(125);
    expect(findSellProduct(s, 12)?.cena).toBe(33);
    expect(findSellProduct(s, 50)).toBeNull();
  });
});
