import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApp } from "../../state/app";
import { useForge } from "../../state/forge";
import { demoSpells, resetStores } from "../../test/fixtures";
import { Spellbook } from "../Spellbook";

describe("<Spellbook>", () => {
  beforeEach(() => resetStores(demoSpells));

  it("lists spells with their action", () => {
    render(<Spellbook onPick={() => {}} onNew={() => {}} />);
    expect(screen.getByText("Circle of Undo")).toBeInTheDocument();
    expect(screen.getByText("⌘")).toBeInTheDocument();
    expect(screen.getByText(/Spotify/, { selector: ".appchip" })).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    resetStores([]);
    render(<Spellbook onPick={() => {}} onNew={() => {}} />);
    expect(screen.getByText(/No spells yet/)).toBeInTheDocument();
  });

  it("calls onPick with the clicked spell and highlights the one being edited", () => {
    const onPick = vi.fn();
    useForge.setState({ editingId: "2" });
    render(<Spellbook onPick={onPick} onNew={() => {}} />);
    fireEvent.click(screen.getByText("Circle of Undo"));
    expect(onPick).toHaveBeenCalledWith(demoSpells[0]);
    expect(document.querySelector('.spell[data-id="2"]')).toHaveClass("active");
    expect(document.querySelector('.spell[data-id="1"]')).not.toHaveClass("active");
  });

  it("flashes a spell after a cast", () => {
    useApp.setState({ flashId: "1" });
    render(<Spellbook onPick={() => {}} onNew={() => {}} />);
    expect(document.querySelector('.spell[data-id="1"]')).toHaveClass("flash");
  });

  it("shows the hotkey compactly per platform", () => {
    const { unmount } = render(<Spellbook onPick={() => {}} onNew={() => {}} />);
    expect(screen.getByText("⌘⇧M")).toBeInTheDocument();
    unmount();
    useApp.setState({ platform: { os: "windows", physical_coords: true } });
    render(<Spellbook onPick={() => {}} onNew={() => {}} />);
    expect(screen.getByText("Ctrl+Shift+M")).toBeInTheDocument();
  });

  it("+ starts a new spell", () => {
    const onNew = vi.fn();
    render(<Spellbook onPick={() => {}} onNew={onNew} />);
    fireEvent.click(screen.getByTitle("New spell"));
    expect(onNew).toHaveBeenCalled();
  });

  it("strictness previews while dragging and saves on commit", async () => {
    const { container } = render(<Spellbook onPick={() => {}} onNew={() => {}} />);
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.input(range, { target: { value: "0.6" } });
    expect(screen.getByText("0.60")).toBeInTheDocument();
    expect(useApp.getState().book.threshold).toBe(0.8);
    fireEvent.change(range, { target: { value: "0.6" } });
    await screen.findByText("0.60");
    await vi.waitFor(() => expect(useApp.getState().book.threshold).toBe(0.6));
  });
});
