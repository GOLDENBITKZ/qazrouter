import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PiiProtectionError,
  protectChatMessages,
  restoreRedactedText
} from "../lib/security/pii-protection";

const originalScannerUrl = process.env.PII_SCANNER_URL;
const originalScannerToken = process.env.PII_SCANNER_TOKEN;
const originalStrictMode = process.env.PII_STRICT_MODE;
const originalPolicyVersion = process.env.PII_POLICY_VERSION;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalScannerUrl === undefined) {
    delete process.env.PII_SCANNER_URL;
  } else {
    process.env.PII_SCANNER_URL = originalScannerUrl;
  }
  if (originalScannerToken === undefined) {
    delete process.env.PII_SCANNER_TOKEN;
  } else {
    process.env.PII_SCANNER_TOKEN = originalScannerToken;
  }
  if (originalStrictMode === undefined) {
    delete process.env.PII_STRICT_MODE;
  } else {
    process.env.PII_STRICT_MODE = originalStrictMode;
  }
  if (originalPolicyVersion === undefined) {
    delete process.env.PII_POLICY_VERSION;
  } else {
    process.env.PII_POLICY_VERSION = originalPolicyVersion;
  }
});

describe("protectChatMessages", () => {
  it("блокирует запрос без scanner в strict-режиме", async () => {
    delete process.env.PII_SCANNER_URL;
    delete process.env.PII_SCANNER_TOKEN;
    process.env.PII_STRICT_MODE = "true";

    await expect(
      protectChatMessages(
        [{ role: "user", content: "Мой ИИН 940512300123" }],
        "request-1"
      )
    ).rejects.toBeInstanceOf(PiiProtectionError);
  });

  it("использует regex fallback только при явном отключении strict", async () => {
    delete process.env.PII_SCANNER_URL;
    delete process.env.PII_SCANNER_TOKEN;
    process.env.PII_STRICT_MODE = "false";

    const result = await protectChatMessages(
      [{ role: "user", content: "Мой ИИН 940512300123" }],
      "request-2"
    );

    expect(result.engine).toBe("regex-fallback-v1");
    expect(result.counts.iin).toBe(1);
    expect(JSON.stringify(result.messages)).not.toContain("940512300123");
  });

  it("принимает обратимое обезличивание от локального scanner", async () => {
    process.env.PII_SCANNER_URL = "http://pii-scanner:8000";
    process.env.PII_SCANNER_TOKEN = "scanner-secret";
    process.env.PII_STRICT_MODE = "true";
    process.env.PII_POLICY_VERSION = "kz-pii-v2";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          messages: [
            {
              role: "user",
              content: "Клиент __KZ_PII_PERSON_1__, ИИН __KZ_PII_IIN_2__"
            }
          ],
          extras: {},
          counts: {
            iin: 1,
            phone: 0,
            card: 0,
            email: 0,
            person: 1,
            address: 0,
            account: 0,
            passport: 0,
            other: 0
          },
          replacements: [
            { token: "__KZ_PII_PERSON_1__", original: "Алия" },
            { token: "__KZ_PII_IIN_2__", original: "940512300123" }
          ],
          risk_score: 0.98,
          engine: "gliner+regex-v2",
          policy_version: "kz-pii-v2"
        })
      )
    );

    const result = await protectChatMessages(
      [{ role: "user", content: "Клиент Алия, ИИН 940512300123" }],
      "request-3"
    );

    expect(result.maskedTotal).toBe(2);
    expect(result.engine).toBe("gliner+regex-v2");
    expect(JSON.stringify(result.messages)).not.toContain("940512300123");
  });

  it("блокирует scanner, который оставил PII в очищенном prompt", async () => {
    process.env.PII_SCANNER_URL = "http://pii-scanner:8000";
    process.env.PII_SCANNER_TOKEN = "scanner-secret";
    process.env.PII_STRICT_MODE = "true";
    process.env.PII_POLICY_VERSION = "kz-pii-v2";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          messages: [
            {
              role: "user",
              content: "Клиент Алия, ИИН __KZ_PII_IIN_1__"
            }
          ],
          extras: {},
          counts: {
            iin: 1,
            phone: 0,
            card: 0,
            email: 0,
            person: 0,
            address: 0,
            account: 0,
            passport: 0,
            other: 0
          },
          replacements: [
            { token: "__KZ_PII_PERSON_1__", original: "Алия" },
            { token: "__KZ_PII_IIN_1__", original: "940512300123" }
          ],
          risk_score: 1,
          engine: "broken-scanner",
          policy_version: "kz-pii-v2"
        })
      )
    );

    await expect(
      protectChatMessages(
        [{ role: "user", content: "Клиент Алия, ИИН 940512300123" }],
        "request-4"
      )
    ).rejects.toBeInstanceOf(PiiProtectionError);
  });
});

describe("restoreRedactedText", () => {
  it("восстанавливает исходные значения только для текущего запроса", () => {
    const restored = restoreRedactedText(
      "Клиент __KZ_PII_PERSON_1__ имеет ИИН __KZ_PII_IIN_2__.",
      [
        { token: "__KZ_PII_PERSON_1__", original: "Алия" },
        { token: "__KZ_PII_IIN_2__", original: "940512300123" }
      ]
    );

    expect(restored).toBe("Клиент Алия имеет ИИН 940512300123.");
  });
});
