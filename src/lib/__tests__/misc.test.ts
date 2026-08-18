import { describe, expect, it } from "vitest";
import { hexToRgba } from "../color";
import { fitPoints } from "../geometry";
import { appBaseName } from "../path";

describe("color", () => {
  it("converts hex", () => expect(hexToRgba("#ff0080", 0.5)).toBe("rgba(255,0,128,0.5)"));
  it("falls back", () => expect(hexToRgba("nope", 1)).toBe("rgba(6,4,14,1)"));
});
describe("path", () => {
  it("strips app/exe", () => {
    expect(appBaseName("/Applications/Spotify.app")).toBe("Spotify");
    expect(appBaseName("C:\\Program Files\\Foo\\bar.exe")).toBe("bar");
    expect(appBaseName("/Applications/Spotify.app/")).toBe("Spotify");
  });
});
describe("geometry", () => {
  it("fits and centres", () => {
    const pts = fitPoints(
      [
        [0, 0],
        [10, 10],
      ],
      100,
      100,
      10,
    );
    expect(pts[0]).toEqual({ x: 10, y: 10 });
    expect(pts[1]).toEqual({ x: 90, y: 90 });
  });
});
