import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStores } from "../../test/fixtures";
import { KeyRecorderButton } from "../KeyRecorderButton";

describe("<KeyRecorderButton>", () => {
  beforeEach(() => resetStores());

  it("shows placeholder, then the chord", () => {
    const { rerender } = render(<KeyRecorderButton id="k" value="" placeholder="Shortcut…" onChord={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent("Shortcut…");
    rerender(<KeyRecorderButton id="k" value="Cmd+K" placeholder="Shortcut…" onChord={() => {}} />);
    expect(screen.getByRole("button")).toHaveClass("set");
    expect(screen.getAllByText(/⌘|K/).length).toBe(2);
  });

  it("opens the picker, and hands back what it builds", () => {
    const onChord = vi.fn();
    render(<KeyRecorderButton id="k" value="" placeholder="Shortcut…" onChord={onChord} />);
    fireEvent.click(screen.getByRole("button", { name: "Shortcut…" }));
    const picker = screen.getByRole("dialog");
    expect(picker).toBeInTheDocument();
    fireEvent.keyDown(picker, { key: "k", code: "KeyK", metaKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onChord).toHaveBeenCalledWith("Cmd+K");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancelling leaves the chord alone", () => {
    const onChord = vi.fn();
    render(<KeyRecorderButton id="k" value="Ctrl+B" placeholder="Shortcut…" onChord={onChord} />);
    fireEvent.click(screen.getByRole("button", { name: /B/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChord).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
