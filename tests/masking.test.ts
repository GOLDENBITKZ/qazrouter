import { describe, expect, it } from "vitest";

import { maskChatMessages } from "../lib/security/mask-messages";
import { maskSensitiveText } from "../lib/security/mask-sensitive-data";

describe("maskSensitiveText", () => {
  it("маскирует казахстанский ИИН", () => {
    const result = maskSensitiveText("ИИН клиента: 940512300123.");

    expect(result.text).toBe(
      "ИИН клиента: [ИИН СКРЫТ ПО ЗАКОНУ РК]."
    );
    expect(result.counts.iin).toBe(1);
  });

  it("маскирует телефоны в распространённых форматах", () => {
    const result = maskSensitiveText(
      "Позвоните +7 (701) 555-42-10 или 8 777 123 45 67."
    );

    expect(result.text).not.toContain("555-42-10");
    expect(result.text).not.toContain("123 45 67");
    expect(result.counts.phone).toBe(2);
  });

  it("маскирует валидную банковскую карту и не трогает случайное число", () => {
    const result = maskSensitiveText(
      "Карта 4111 1111 1111 1111, номер заказа 1234 5678 9012 3456."
    );

    expect(result.text).toContain("[КАРТА СКРЫТА ПО ЗАКОНУ РК]");
    expect(result.text).toContain("1234 5678 9012 3456");
    expect(result.counts.card).toBe(1);
  });

  it("идемпотентно обрабатывает уже замаскированный текст", () => {
    const first = maskSensitiveText("Тел: +7 701 000 00 00");
    const second = maskSensitiveText(first.text);

    expect(second.text).toBe(first.text);
    expect(second.counts.phone).toBe(0);
  });
});

describe("maskChatMessages", () => {
  it("маскирует content и tool_calls, не меняя role", () => {
    const result = maskChatMessages([
      {
        role: "user",
        content: '{"iin":"940512300123","phone":"+77015554210"}'
      },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            function: {
              name: "lookup",
              arguments: '{"card":"4111111111111111"}'
            }
          }
        ]
      }
    ]);

    expect(result.messages[0].role).toBe("user");
    expect(JSON.stringify(result.messages)).not.toContain("940512300123");
    expect(JSON.stringify(result.messages)).not.toContain("4111111111111111");
    expect(result.counts).toEqual({ iin: 1, phone: 1, card: 1 });
  });
});
