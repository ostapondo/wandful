import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useApp } from "../../state/app";
import { PermissionBanner } from "../PermissionBanner";

describe("<PermissionBanner>", () => {
  it("is hidden until accessibility is missing", async () => {
    useApp.setState({ needsAccessibility: false });
    const { container } = render(<PermissionBanner />);
    expect(container).toBeEmptyDOMElement();
    useApp.setState({ needsAccessibility: true });
    expect(await screen.findByText(/needs/)).toHaveTextContent("Accessibility");
    expect(screen.getByText("Open settings")).toBeInTheDocument();
  });
});
