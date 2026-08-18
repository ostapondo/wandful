import { describe, expect, it } from "vitest";
import { mockInvoke } from "../mock";

describe("mockInvoke (browser preview backend)", () => {
  it("returns a book with the demo spells", async () => {
    const book = await mockInvoke("get_book");
    expect(book.spells.length).toBeGreaterThan(0);
    expect(book).toMatchObject({ threshold: 0.8, hotkey: "CmdOrCtrl+Shift+M" });
  });
  it("saves, updates and deletes spells", async () => {
    const before = (await mockInvoke("get_book")).spells.length;
    const spell = {
      id: "",
      name: "T",
      shortcut: "Cmd+T",
      action: "shortcut",
      app_path: "",
      app_name: "",
      points: [
        [0, 0],
        [1, 1],
      ],
      enabled: true,
    };
    let book = await mockInvoke("save_spell", { spell });
    expect(book.spells.length).toBe(before + 1);
    const saved = book.spells.at(-1)!;
    expect(saved.id).not.toBe("");
    book = await mockInvoke("save_spell", { spell: { ...saved, name: "T2" } });
    expect(book.spells.length).toBe(before + 1);
    expect(book.spells.find((s: any) => s.id === saved.id)?.name).toBe("T2");
    book = await mockInvoke("delete_spell", { id: saved.id });
    expect(book.spells.length).toBe(before);
  });
  it("patches settings and resets them", async () => {
    let book = await mockInvoke("set_settings", { patch: { overlay_opacity: 0.5, hotkey: undefined } });
    expect(book.overlay_opacity).toBe(0.5);
    expect(book.hotkey).toBe("CmdOrCtrl+Shift+M");
    book = await mockInvoke("set_threshold", { threshold: 0.6 });
    expect(book.threshold).toBe(0.6);
    book = await mockInvoke("reset_settings");
    expect(book).toMatchObject({ overlay_opacity: 0.9, threshold: 0.8 });
  });
  it("toggles the wand", async () => {
    await mockInvoke("set_wand", { on: true });
    expect(await mockInvoke("get_wand")).toBe(true);
    await mockInvoke("set_wand", { on: false });
    expect(await mockInvoke("get_wand")).toBe(false);
  });
});
