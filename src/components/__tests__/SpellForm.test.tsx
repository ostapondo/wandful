import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useApp } from "../../state/app";
import { useForge } from "../../state/forge";
import { resetStores, rune } from "../../test/fixtures";
import { SpellForm } from "../SpellForm";

const forge = () => useForge.getState();
const spells = () => useApp.getState().book.spells;

describe("<SpellForm>", () => {
  beforeEach(() => resetStores());

  it("validates before saving", () => {
    render(<SpellForm />);
    fireEvent.click(screen.getByText("Save spell"));
    expect(screen.getByText("Draw a rune first")).toBeInTheDocument();
    forge().setPoints(rune);
    fireEvent.click(screen.getByText("Save spell"));
    expect(screen.getByText("Name the spell")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Spell name"), { target: { value: "Box" } });
    fireEvent.click(screen.getByText("Save spell"));
    expect(screen.getByText("Pick a shortcut")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open app"));
    fireEvent.click(screen.getByText("Save spell"));
    expect(screen.getByText("Choose an application")).toBeInTheDocument();
  });

  it("saves through the api and resets the forge", async () => {
    render(<SpellForm />);
    forge().setPoints(rune);
    forge().setName("Box");
    forge().setShortcut("Cmd+B");
    fireEvent.click(screen.getByText("Save spell"));
    await waitFor(() => expect(spells().some((s) => s.name === "Box")).toBe(true));
    expect(forge().points).toEqual([]);
    expect(forge().name).toBe("");
    expect(useApp.getState().status.ok).toBe(true);
  });

  it("shows Delete and 'Save changes' while editing, and deletes", async () => {
    forge().setPoints(rune);
    forge().setName("Deletable");
    forge().setShortcut("Cmd+D");
    render(<SpellForm />);
    fireEvent.click(screen.getByText("Save spell"));
    const find = () => spells().find((s) => s.name === "Deletable");
    await waitFor(() => expect(find()).toBeTruthy());
    forge().startEdit(find()!, rune);
    expect(await screen.findByText("Save changes")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => expect(find()).toBeUndefined());
    expect(forge().editingId).toBe("");
  });

  it("Test needs a rune, then reports the match", async () => {
    render(<SpellForm />);
    fireEvent.click(screen.getByText("Test"));
    expect(screen.getByText("Draw a rune first")).toBeInTheDocument();
    forge().setPoints(rune);
    fireEvent.click(screen.getByText("Test"));
    await screen.findByText(/Matches/);
  });

  it("switching kind swaps the picker", () => {
    render(<SpellForm />);
    expect(screen.getByText("Shortcut…")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open app"));
    expect(screen.getByText("Choose application…")).toBeInTheDocument();
    expect(forge().kind).toBe("app");
  });
});

describe("<SpellForm> system actions", () => {
  beforeEach(() => resetStores());

  it("are offered off macOS and hidden on it", () => {
    const { unmount } = render(<SpellForm />); // fixtures start on macOS
    expect(screen.queryByText("System")).not.toBeInTheDocument();
    unmount();
    useApp.setState({ platform: { os: "windows", physical_coords: true } });
    render(<SpellForm />);
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("need one picked before they save", () => {
    useApp.setState({ platform: { os: "windows", physical_coords: true } });
    render(<SpellForm />);
    forge().setPoints(rune);
    forge().setName("Lock it");
    fireEvent.click(screen.getByText("System"));
    forge().setSystem("");
    fireEvent.click(screen.getByText("Save spell"));
    expect(screen.getByText("Pick a system action")).toBeInTheDocument();
  });

  it("save the chosen action, and leave it behind when the kind changes", async () => {
    useApp.setState({ platform: { os: "windows", physical_coords: true } });
    render(<SpellForm />);
    forge().setPoints(rune);
    forge().setName("Task list");
    fireEvent.click(screen.getByText("System"));
    forge().setSystem("taskmgr");
    fireEvent.click(screen.getByText("Save spell"));
    await waitFor(() => expect(spells().some((s) => s.name === "Task list")).toBe(true));
    const saved = spells().find((s) => s.name === "Task list")!;
    expect(saved.action).toBe("system");
    expect(saved.system).toBe("taskmgr");

    // A shortcut spell must not carry a stale system action along with it.
    forge().setPoints(rune);
    forge().setName("Chord");
    forge().setKind("shortcut");
    forge().setShortcut("Ctrl+K");
    fireEvent.click(screen.getByText("Save spell"));
    await waitFor(() => expect(spells().some((s) => s.name === "Chord")).toBe(true));
    expect(spells().find((s) => s.name === "Chord")!.system).toBe("");
  });
});
