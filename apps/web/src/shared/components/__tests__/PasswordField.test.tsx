import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";

import { PasswordField } from "../PasswordField.js";

/**
 * `PasswordField` requires a `UseFormRegisterReturn`, so the harness renders a
 * real `useForm` instance instead of faking the register contract. That keeps
 * the assertions honest about the props actually reaching the DOM input.
 */
function Harness({ error }: { error?: string }) {
  const { register } = useForm<{ password: string }>();
  return (
    <PasswordField
      id="password"
      label="Password"
      autoComplete="current-password"
      placeholder="Enter your password"
      register={register("password")}
      error={error}
    />
  );
}

describe("PasswordField", () => {
  it("associates the label with the input and hides the password by default", () => {
    render(<Harness />);

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("placeholder", "Enter your password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
  });

  it("renders the reveal toggle in the collapsed state", () => {
    render(<Harness />);

    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles the input type and the toggle's accessible name", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByLabelText("Password");
    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(input).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(hide).toHaveAttribute("aria-pressed", "true");

    await user.click(hide);

    expect(input).toHaveAttribute("type", "password");
  });

  it("keeps the typed value when the field is toggled", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByLabelText("Password");
    await user.type(input, "s3cret");
    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(screen.getByLabelText("Password")).toHaveValue("s3cret");
  });

  it("shows the error as an alert only when one is provided", () => {
    const { rerender } = render(<Harness />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(<Harness error="Password is required." />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Password is required.");
  });
});
