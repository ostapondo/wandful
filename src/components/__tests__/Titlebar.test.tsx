import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApp } from "../../state/app";
import { resetStores } from "../../test/fixtures";
import { Titlebar } from "../Titlebar";

const caption = vi.hoisted(() => ({
  minimize: vi.fn(),
  close: vi.fn(),
  toggleMaximize: vi.fn(() => Promise.resolve()),
  isMaximized: vi.fn(() => Promise.resolve(false)),
  onResized: vi.fn((_cb: () => void) => Promise.resolve(() => {})),
}));
vi.mock("../../api/caption", () => ({ caption }));

describe("<Titlebar>", () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it("leaves the caption buttons to macOS, which draws its own", () => {
    render(<Titlebar />);
    expect(screen.queryByLabelText("Close")).not.toBeInTheDocument();
  });

  it("draws minimize, maximize and close where the window is undecorated", async () => {
    useApp.setState({ platform: { os: "windows", physical_coords: true } });
    render(<Titlebar />);
    for (const label of ["Minimize", "Maximize", "Close"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(await screen.findByText("Wandful")).toBeInTheDocument();
  });

  it("follows the window's own maximized state, not just its own clicks", async () => {
    useApp.setState({ platform: { os: "windows", physical_coords: true } });
    caption.isMaximized.mockResolvedValueOnce(true);
    render(<Titlebar />);
    // Win+Up and snapping maximize without the button ever being pressed.
    expect(await screen.findByLabelText("Restore")).toBeInTheDocument();
    expect(caption.onResized).toHaveBeenCalled();
  });

  it("redraws the glyph when the window is resized behind its back", async () => {
    useApp.setState({ platform: { os: "windows", physical_coords: true } });
    caption.isMaximized.mockResolvedValueOnce(true);
    render(<Titlebar />);
    expect(await screen.findByLabelText("Restore")).toBeInTheDocument();
    // The window is restored by dragging it off the top of the screen.
    caption.isMaximized.mockResolvedValue(false);
    caption.onResized.mock.calls[0][0]();
    expect(await screen.findByLabelText("Maximize")).toBeInTheDocument();
  });

  it("stops listening when it goes away", async () => {
    useApp.setState({ platform: { os: "windows", physical_coords: true } });
    const unlisten = vi.fn();
    caption.onResized.mockResolvedValueOnce(unlisten);
    const { unmount } = render(<Titlebar />);
    await screen.findByLabelText("Maximize");
    unmount();
    await waitFor(() => expect(unlisten).toHaveBeenCalled());
  });

  it("wires each button to the window it draws for", async () => {
    useApp.setState({ platform: { os: "windows", physical_coords: true } });
    render(<Titlebar />);
    fireEvent.click(await screen.findByLabelText("Minimize"));
    fireEvent.click(screen.getByLabelText("Maximize"));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(caption.minimize).toHaveBeenCalled();
    expect(caption.toggleMaximize).toHaveBeenCalled();
    expect(caption.close).toHaveBeenCalled();
  });
});
