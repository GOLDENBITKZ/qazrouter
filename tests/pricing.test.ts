import { describe, expect, it } from "vitest";

import { calculateCostKzt, isPublicModel } from "../lib/billing/pricing";

describe("calculateCostKzt", () => {
  it("считает входные и выходные токены DeepSeek", () => {
    expect(calculateCostKzt("kz-deepseek", 1_000_000, 0)).toBe(150);
    expect(calculateCostKzt("kz-deepseek", 0, 1_000_000)).toBe(600);
  });

  it("сохраняет четыре знака после запятой", () => {
    expect(calculateCostKzt("kz-gemini", 1_000, 500)).toBe(0.54);
  });

  it("не допускает отрицательные токены", () => {
    expect(calculateCostKzt("kz-gemini", -100, -100)).toBe(0);
  });
});

describe("isPublicModel", () => {
  it("разрешает только публичные алиасы", () => {
    expect(isPublicModel("kz-deepseek")).toBe(true);
    expect(isPublicModel("kz-gemini")).toBe(true);
    expect(isPublicModel("kz-gpt")).toBe(true);
    expect(isPublicModel("kz-claude")).toBe(true);
    expect(isPublicModel("kz-qwen")).toBe(true);
    expect(isPublicModel("kz-llama")).toBe(true);
    expect(isPublicModel("deepseek-chat")).toBe(false);
  });
});
