import { describe, expect, it } from "vitest";
import { trimTrailingLineWhitespace } from "$/fabric-object/textbox-ext";

describe("trimTrailingLineWhitespace", () => {
  it("removes spaces and tabs from the end of a single line", () => {
    expect(trimTrailingLineWhitespace("Magnesy  \t")).toBe("Magnesy");
  });

  it("preserves whitespace between words", () => {
    expect(trimTrailingLineWhitespace("Cold brew label")).toBe("Cold brew label");
  });

  it("trims every line without removing line breaks", () => {
    expect(trimTrailingLineWhitespace("First  \nSecond\t\r\nThird ")).toBe("First\nSecond\r\nThird");
  });
});
