import { describe, expect, it } from "vitest";
import { buildChord, chordProblem, splitChord } from "../chord";

describe("chords composed by hand", () => {
  it("orders modifiers so the same chord has one spelling", () => {
    expect(buildChord(["Shift", "Ctrl"], "S")).toBe("Ctrl+Shift+S");
    expect(buildChord(["Ctrl", "Shift"], "S")).toBe("Ctrl+Shift+S");
  });

  it("survives a round trip", () => {
    const { mods, key } = splitChord("Cmd+Alt+F4");
    expect(mods).toEqual(["Cmd", "Alt"]);
    expect(key).toBe("F4");
    expect(buildChord(mods, key)).toBe("Cmd+Alt+F4");
  });

  it("takes a bare key, and refuses bare modifiers", () => {
    expect(buildChord([], "F5")).toBe("F5");
    expect(chordProblem([], "F5", false)).toBeNull();
    expect(chordProblem(["Ctrl"], "", false)).toMatch(/Add a key/);
  });

  it("refuses what Windows will never deliver", () => {
    expect(chordProblem(["Ctrl", "Alt"], "Delete", false)).toMatch(/reserves/);
    expect(chordProblem(["Cmd"], "L", false)).toMatch(/Win\+L/);
    // The same keys are ordinary on macOS.
    expect(chordProblem(["Ctrl", "Alt"], "Delete", true)).toBeNull();
  });

  it("lets ordinary chords through", () => {
    expect(chordProblem(["Ctrl", "Shift"], "K", false)).toBeNull();
    expect(chordProblem(["Cmd", "Ctrl"], "`", false)).toBeNull();
  });
});
