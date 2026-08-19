import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApp } from "../../state/app";
import { resetStores } from "../../test/fixtures";
import { ChordPicker } from "../ChordPicker";

const win = () => useApp.setState({ platform: { os: "windows", physical_coords: true } });

describe("<ChordPicker>", () => {
  beforeEach(() => resetStores());

  it("builds a chord from clicks and saves it in a fixed order", () => {
    const onSave = vi.fn();
    render(<ChordPicker value="" onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "⇧" })); // Shift first...
    fireEvent.click(screen.getByRole("button", { name: "⌃" })); // ...then Ctrl
    fireEvent.click(screen.getByRole("button", { name: "S" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Ctrl+Shift+S");
  });

  it("takes a typed combination too", () => {
    const onSave = vi.fn();
    render(<ChordPicker value="" onSave={onSave} onClose={() => {}} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "k", code: "KeyK", ctrlKey: true, shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Ctrl+Shift+K");
  });

  it("removes a key with its cross", () => {
    const onSave = vi.fn();
    render(<ChordPicker value="Ctrl+Alt+J" onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Alt" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Ctrl+J");
  });

  it("refuses a chord Windows will never deliver, and says why", () => {
    win();
    const onSave = vi.fn();
    render(<ChordPicker value="Ctrl+Alt+Delete" onSave={onSave} onClose={() => {}} />);
    expect(screen.getByText(/reserves Ctrl\+Alt\+Delete/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  /** The panel presents both ways of choosing keys, so mixing them is the
   *  natural thing to do. Replacing the clicked modifiers with the (empty) set
   *  the keypress carried saved a spell bound to a bare "S" instead. */
  it("finishes a clicked combination with a typed key", () => {
    win();
    const onSave = vi.fn();
    render(<ChordPicker value="" onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Ctrl" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "s", code: "KeyS" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Ctrl+S");
  });

  it("takes typed punctuation as the key that was pressed, not the glyph", () => {
    win();
    const onSave = vi.fn();
    render(<ChordPicker value="" onSave={onSave} onClose={() => {}} />);
    // Ctrl+Shift+; reports ":" — which nothing can press.
    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: ":",
      code: "Semicolon",
      ctrlKey: true,
      shiftKey: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Ctrl+Shift+;");
  });

  /** Every key but Escape used to be swallowed here, Tab included, so focus
   *  never reached the footer and Save was unreachable without a mouse. */
  it("leaves Tab alone so the buttons can be reached", () => {
    render(<ChordPicker value="" onSave={() => {}} onClose={() => {}} />);
    const tab = fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(tab).toBe(true); // not prevented
  });

  it("shows the hotkey the app ships with, key and all", () => {
    win();
    render(<ChordPicker value="CmdOrCtrl+Shift+M" purpose="hotkey" onSave={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/Summons with Ctrl\+Shift\+M/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("will not let the summon hotkey be a bare key", () => {
    win();
    render(<ChordPicker value="M" purpose="hotkey" onSave={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/needs a modifier/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("closes on Escape without saving", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(<ChordPicker value="" onSave={onSave} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
