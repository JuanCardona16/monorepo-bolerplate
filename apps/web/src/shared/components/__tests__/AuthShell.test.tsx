import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AuthArt } from "../AuthArt.js";
import { AuthShell } from "../AuthShell.js";

describe("AuthArt", () => {
  it("exposes the illustration as a labelled image", () => {
    render(<AuthArt />);

    expect(
      screen.getByRole("img", { name: "Playful geometric characters" }),
    ).toBeInTheDocument();
  });

  it("renders a single svg root", () => {
    const { container } = render(<AuthArt />);

    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });
});

describe("AuthShell", () => {
  it("renders its children", () => {
    render(
      <AuthShell>
        <h1>Welcome back!</h1>
      </AuthShell>,
    );

    expect(screen.getByRole("heading", { name: "Welcome back!" })).toBeInTheDocument();
  });

  it("renders the decorative artwork alongside the children", () => {
    render(
      <AuthShell>
        <p>Form goes here</p>
      </AuthShell>,
    );

    expect(screen.getByText("Form goes here")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Playful geometric characters" }),
    ).toBeInTheDocument();
  });

  it("keeps the artwork out of the accessibility tree as a duplicate landmark", () => {
    render(
      <AuthShell>
        <p>Only child</p>
      </AuthShell>,
    );

    // The shell itself must not add landmarks or duplicate the art's label.
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
