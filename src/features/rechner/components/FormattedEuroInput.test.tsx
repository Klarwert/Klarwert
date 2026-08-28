import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { FormattedEuroInput } from "./FormattedEuroInput";

test("FormattedEuroInput allows numbers and commas during input and formats on blur", () => {
  const handleChange = vi.fn();
  render(
    <FormattedEuroInput
      value=""
      onChange={handleChange}
      placeholder="Betrag"
      id="test-input"
    />
  );

  const input = screen.getByPlaceholderText("Betrag");

  // Simulate typing (removes invalid characters automatically)
  fireEvent.change(input, { target: { value: "10000a" } });
  expect(handleChange).toHaveBeenCalledWith("10000");

  fireEvent.change(input, { target: { value: "10000,50" } });
  expect(handleChange).toHaveBeenCalledWith("10000,50");

  // Simulate blur (formats the string)
  fireEvent.blur(input, { target: { value: "10000" } });
  expect(handleChange).toHaveBeenCalledWith("10.000,00");

  fireEvent.blur(input, { target: { value: "1234567,89" } });
  expect(handleChange).toHaveBeenCalledWith("1.234.567,89");
});
