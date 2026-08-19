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

  it("closes on Escape without saving", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(<ChordPicker value="" onSave={onSave} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
