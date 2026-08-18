import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installRecorder, stopRecording } from "../../state/recorder";
import { resetStores } from "../../test/fixtures";
import { KeyRecorderButton } from "../KeyRecorderButton";

describe("<KeyRecorderButton>", () => {
  beforeEach(() => {
    resetStores();
    installRecorder();
    stopRecording();
  });

  it("shows placeholder, then the chord", () => {
    const { rerender } = render(<KeyRecorderButton id="k" value="" placeholder="Shortcut…" onChord={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent("Shortcut…");
    rerender(<KeyRecorderButton id="k" value="Cmd+K" placeholder="Shortcut…" onChord={() => {}} />);
    expect(screen.getByRole("button")).toHaveClass("set");
    expect(screen.getAllByText(/⌘|K/).length).toBe(2);
  });

  it("records a chord on click + keydown", () => {
    const onChord = vi.fn();
    render(<KeyRecorderButton id="k" value="" placeholder="Shortcut…" onChord={onChord} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveClass("listening");
    expect(screen.getByRole("button")).toHaveTextContent(/Press keys/);
    fireEvent.keyDown(window, { key: "k", code: "KeyK", metaKey: true });
    expect(onChord).toHaveBeenCalledWith("Cmd+K");
    expect(screen.getByRole("button")).not.toHaveClass("listening");
  });

  it("second click cancels", () => {
    render(<KeyRecorderButton id="k" value="" placeholder="Shortcut…" onChord={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("Shortcut…");
  });
});
