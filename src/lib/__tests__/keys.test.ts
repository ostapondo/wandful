import { describe, expect, it } from "vitest";
import { chordFromKeyEvent, chordLabel, keyTokens, prettyKey } from "../keys";

describe("keys", () => {
  it("splits chords", () => {
    expect(keyTokens("Cmd+Shift+M")).toEqual(["Cmd", "Shift", "M"]);
    expect(keyTokens("")).toEqual([]);
  });
  it("prettifies per platform", () => {
    expect(prettyKey("Cmd", true)).toBe("⌘");
    expect(prettyKey("CmdOrCtrl", false)).toBe("Ctrl");
    expect(prettyKey("X", true)).toBe("X");
  });
  it("labels compactly", () => {
    expect(chordLabel("CmdOrCtrl+Shift+M", true)).toBe("⌘⇧M");
    expect(chordLabel("CmdOrCtrl+Shift+M", false)).toBe("Ctrl+Shift+M");
  });
  it("builds a chord from a key event", () => {
    const ev = (o: Partial<KeyboardEvent>) => o as KeyboardEvent;
    expect(chordFromKeyEvent(ev({ key: "Shift" }))).toBeNull();
    expect(chordFromKeyEvent(ev({ key: "z", code: "KeyZ", metaKey: true }))).toBe("Cmd+Z");
    expect(chordFromKeyEvent(ev({ key: " ", code: "Space", ctrlKey: true }))).toBe("Ctrl+Space");
    expect(chordFromKeyEvent(ev({ key: "ArrowLeft", code: "ArrowLeft", altKey: true }))).toBe("Alt+Left");
    expect(chordFromKeyEvent(ev({ key: "5", code: "Digit5", shiftKey: true }))).toBe("Shift+5");
  });
});
