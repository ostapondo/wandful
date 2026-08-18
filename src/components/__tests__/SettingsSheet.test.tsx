import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useApp } from "../../state/app";
import { resetStores } from "../../test/fixtures";
import { SettingsSheet } from "../SettingsSheet";

const app = () => useApp.getState();

describe("<SettingsSheet>", () => {
  beforeEach(() => {
    resetStores();
    useApp.setState({ settingsOpen: true });
  });

  it("renders nothing when closed", () => {
    useApp.setState({ settingsOpen: false });
    const { container } = render(<SettingsSheet />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows current values and closes on ✕", () => {
    render(<SettingsSheet />);
    expect(screen.getByText("#050506")).toBeInTheDocument();
    expect(screen.getByText("0.90")).toBeInTheDocument();
    fireEvent.click(screen.getByText("✕"));
    expect(app().settingsOpen).toBe(false);
  });

  it("closes on backdrop click but not on the card", () => {
    const { container } = render(<SettingsSheet />);
    fireEvent.click(container.querySelector(".sheet-card")!);
    expect(app().settingsOpen).toBe(true);
    fireEvent.click(container.querySelector(".sheet")!);
    expect(app().settingsOpen).toBe(false);
  });

  it("previews while dragging, saves on commit", async () => {
    const { container } = render(<SettingsSheet />);
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.input(range, { target: { value: "0.5" } });
    expect(screen.getByText("0.50")).toBeInTheDocument();
    expect(app().book.overlay_opacity).toBe(0.9); // not saved yet
    fireEvent.change(range, { target: { value: "0.5" } });
    await waitFor(() => expect(app().book.overlay_opacity).toBe(0.5));
  });

  it("saves on commit even when opened after mounting (regression)", async () => {
    useApp.setState({ settingsOpen: false });
    const { container } = render(<SettingsSheet />);
    act(() => useApp.setState({ settingsOpen: true }));
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(range, { target: { value: "0.4" } });
    await waitFor(() => expect(app().book.overlay_opacity).toBe(0.4));
  });

  it("reset restores defaults and says so", async () => {
    useApp.setState({ book: { ...app().book, overlay_opacity: 0.3 } });
    render(<SettingsSheet />);
    fireEvent.click(screen.getByText("Reset to defaults"));
    await screen.findByText("Defaults restored");
    expect(app().book.overlay_opacity).toBe(0.9);
  });
});
