import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useForge } from "../../state/forge";
import { resetStores } from "../../test/fixtures";
import { App } from "../App";

describe("<App> against the mock backend", () => {
  beforeEach(() => resetStores());

  it("boots, lists the demo spells, and opens one in the forge", async () => {
    render(<App />);
    await screen.findByText("Circle of Undo");
    expect(screen.getByText("Wandful")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Circle of Undo"));
    await waitFor(() => expect(useForge.getState().editingId).toBe("1"));
    expect(await screen.findByText("Save changes")).toBeInTheDocument();
    expect((screen.getByPlaceholderText("Spell name") as HTMLInputElement).value).toBe("Circle of Undo");
    fireEvent.click(screen.getByTitle("New spell"));
    expect(useForge.getState().editingId).toBe("");
    expect(await screen.findByText("Save spell")).toBeInTheDocument();
  });

  it("opens the settings sheet from the title bar", async () => {
    render(<App />);
    fireEvent.click(screen.getByTitle("Settings"));
    expect(await screen.findByText("Overlay colour")).toBeInTheDocument();
  });
});
