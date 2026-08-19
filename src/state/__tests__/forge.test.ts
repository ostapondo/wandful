import { beforeEach, describe, expect, it } from "vitest";
import type { Spell } from "../../api/types";
import { useForge } from "../forge";

const spell: Spell = {
  id: "s1",
  name: "Circle",
  shortcut: "Cmd+Z",
  action: "shortcut",
  app_path: "",
  app_name: "",
  system: "",
  points: [
    [0, 0],
    [10, 10],
  ],
  enabled: true,
};
const get = () => useForge.getState();

describe("forge store", () => {
  beforeEach(() => get().resetForge());

  it("resets to an empty forge and sends a clear command", () => {
    const seq = get().command.seq;
    get().setName("x");
    get().setPoints([{ x: 1, y: 1 }]);
    get().resetForge();
    expect(get().name).toBe("");
    expect(get().points).toEqual([]);
    expect(get().editingId).toBe("");
    expect(get().command).toMatchObject({ kind: "clear" });
    expect(get().command.seq).toBeGreaterThan(seq);
  });

  it("loads a spell for editing and asks the canvas to replay it", () => {
    const fitted = [
      { x: 5, y: 5 },
      { x: 50, y: 50 },
    ];
    get().startEdit(spell, fitted);
    expect(get()).toMatchObject({ editingId: "s1", name: "Circle", shortcut: "Cmd+Z", kind: "shortcut" });
    expect(get().points).toBe(fitted);
    expect(get().command).toMatchObject({ kind: "replay", pts: fitted });
  });

  it("maps app spells to the app kind", () => {
    get().startEdit({ ...spell, action: "app", app_path: "/Applications/X.app", app_name: "X" }, []);
    expect(get().kind).toBe("app");
    expect(get().app).toEqual({ path: "/Applications/X.app", name: "X" });
  });

  it("clearRune keeps the form but drops the rune", () => {
    get().setName("keep");
    get().setPoints([{ x: 1, y: 1 }]);
    get().setMsg("oops");
    get().clearRune();
    expect(get().name).toBe("keep");
    expect(get().points).toEqual([]);
    expect(get().msg.text).toBe("");
    expect(get().command.kind).toBe("clear");
  });

  it("every command gets a fresh seq so identical commands still fire", () => {
    get().clearRune();
    const a = get().command.seq;
    get().clearRune();
    expect(get().command.seq).toBe(a + 1);
  });
});
