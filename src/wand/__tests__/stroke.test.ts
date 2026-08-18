import { describe, expect, it } from "vitest";
import { strokeCells } from "../wand";

describe("strokeCells", () => {
  it("snaps a segment to the grid without gaps or duplicates", () => {
    const cells = strokeCells(
      [
        { x: 0, y: 0 },
        { x: 9, y: 0 },
      ],
      3,
    );
    expect(cells).toEqual([
      [0, 0],
      [3, 0],
      [6, 0],
      [9, 0],
    ]);
  });
  it("keeps a single point", () => {
    expect(strokeCells([{ x: 4, y: 4 }], 3)).toEqual([[3, 3]]);
  });
  it("does not revisit a cell the stroke crosses twice", () => {
    const back = strokeCells(
      [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 0, y: 0 },
      ],
      3,
    );
    expect(back).toHaveLength(3);
  });
});
