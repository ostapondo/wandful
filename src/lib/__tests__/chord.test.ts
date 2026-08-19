import { describe, expect, it } from "vitest";
import { buildChord, chordProblem, keyFromEvent, splitChord } from "../chord";

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

  /** The app ships "CmdOrCtrl+Shift+M" as its own hotkey. Reading the key as
   *  "the first token that is not one of our four modifiers" picks CmdOrCtrl
   *  and throws the M away — the picker then showed a hotkey nobody set. */
  it("reads the hotkey the app ships with", () => {
    expect(splitChord("CmdOrCtrl+Shift+M")).toEqual({ mods: ["Ctrl", "Shift"], key: "M" });
    expect(splitChord("CmdOrCtrl+Shift+M", true)).toEqual({ mods: ["Cmd", "Shift"], key: "M" });
  });

  it("reads the other spellings the backend accepts", () => {
    expect(splitChord("Control+Alt+esc")).toEqual({ mods: ["Ctrl", "Alt"], key: "Escape" });
    expect(splitChord("Win+ArrowUp")).toEqual({ mods: ["Cmd"], key: "Up" });
    expect(splitChord("")).toEqual({ mods: [], key: "" });
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

  /** Win+L is the reserved one. Ctrl+Win+L is not, and refusing it would be
   *  inventing a rule Windows does not have. */
  it("refuses only the combination Windows actually reserves", () => {
    expect(chordProblem(["Cmd"], "L", false)).toMatch(/Win\+L/);
    expect(chordProblem(["Ctrl", "Cmd"], "L", false)).toBeNull();
  });

  /** A key the backend cannot press saves fine and fails at cast time with
   *  "unknown key", days later, with nothing to connect it to. */
  it("refuses a key nothing can send", () => {
    expect(chordProblem(["Ctrl"], "AltGraph", false)).toMatch(/can't send/);
    expect(chordProblem([], "F13", false)).toMatch(/can't send/);
    expect(chordProblem(["Ctrl", "Shift"], ":", false)).toMatch(/can't send/);
  });

  /** A bare key is a fine thing to cast and a terrible thing to grab: the
   *  hotkey is registered system-wide and that key stops reaching any app. */
  it("wants a modifier on the summon hotkey", () => {
    expect(chordProblem([], "M", false, "hotkey")).toMatch(/needs a modifier/);
    expect(chordProblem(["Ctrl", "Shift"], "M", false, "hotkey")).toBeNull();
    expect(chordProblem([], "M", false, "cast")).toBeNull();
  });

  describe("which key a keydown means", () => {
    const ev = (key: string, code: string) => ({ key, code });

    /** `e.key` is the shifted glyph, and ":" is not a key anything can press:
     *  it would be typed as text with the modifiers dropped, which is the bug
     *  `oem_key` exists to fix, arriving through the other door. */
    it("takes punctuation from the physical key, not the glyph", () => {
      expect(keyFromEvent(ev(":", "Semicolon"))).toBe(";");
      expect(keyFromEvent(ev("_", "Minus"))).toBe("-");
      expect(keyFromEvent(ev("~", "Backquote"))).toBe("`");
    });

    it("ignores the modifiers themselves, AltGr included", () => {
      expect(keyFromEvent(ev("Shift", "ShiftLeft"))).toBeNull();
      expect(keyFromEvent(ev("AltGraph", "AltRight"))).toBeNull();
    });

    it("names the keys the keycaps name", () => {
      expect(keyFromEvent(ev("s", "KeyS"))).toBe("S");
      expect(keyFromEvent(ev(" ", "Space"))).toBe("Space");
      expect(keyFromEvent(ev("ArrowUp", "ArrowUp"))).toBe("Up");
    });
  });

  it("lets ordinary chords through", () => {
    expect(chordProblem(["Ctrl", "Shift"], "K", false)).toBeNull();
    expect(chordProblem(["Cmd", "Ctrl"], "`", false)).toBeNull();
  });
});
