import { describe, expect, it } from "bun:test";
import { Theme } from "../../src/core/theme";

describe("theme", () => {
  it("exposes expected color keys", () => {
    expect(Theme.colors.primary).toBeTypeOf("string");
    expect(Theme.colors.secondary).toBeTypeOf("string");
    expect(Theme.colors.text.primary).toBeTypeOf("string");
    expect(Theme.colors.text.muted).toBeTypeOf("string");
    expect(Theme.colors.text.highlight).toBeTypeOf("string");
    expect(Theme.colors.text.inverse).toBeTypeOf("string");
    expect(Theme.colors.background.highlight).toBeTypeOf("string");
    expect(Theme.colors.status.loading).toBeTypeOf("string");
    expect(Theme.colors.status.error).toBeTypeOf("string");
    expect(Theme.colors.status.success).toBeTypeOf("string");
    expect(Theme.colors.status.warning).toBeTypeOf("string");
  });
});
