import { ProviderError, type ChatMessage } from "@/lib/providers/types";

export function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

export function assertTextOnlyMessages(
  messages: ChatMessage[],
  provider: string
): void {
  const hasUnsupportedPart = messages.some((message) => {
    if (!Array.isArray(message.content)) {
      return false;
    }

    return message.content.some(
      (part) =>
        !part ||
        typeof part !== "object" ||
        !("text" in part) ||
        typeof part.text !== "string"
    );
  });

  if (hasUnsupportedPart) {
    throw new ProviderError(
      "Пока поддерживается только текстовое содержимое сообщений (type: text).",
      400,
      provider
    );
  }
}

export function normalizeFinishReason(reason: string | null | undefined): string {
  switch (reason) {
    case "length":
    case "max_tokens":
      return "length";
    case "tool_calls":
      return "tool_calls";
    case "content_filter":
    case "safety":
      return "content_filter";
    case "stop":
    case "end_turn":
    case "STOP":
      return "stop";
    default:
      return "stop";
  }
}

export async function readProviderJson(
  response: Response,
  provider: string
): Promise<Record<string, unknown>> {
  const raw = await response.text();

  if (!response.ok) {
    let detail = raw.slice(0, 800);

    try {
      const parsed = JSON.parse(raw) as {
        error?: { message?: string } | string;
        message?: string;
      };

      if (typeof parsed.error === "string") {
        detail = parsed.error;
      } else {
        detail = parsed.error?.message || parsed.message || detail;
      }
    } catch {
      // Провайдер вернул не JSON — используем безопасный текстовый фрагмент.
    }

    const status =
      response.status === 429
        ? 429
        : response.status >= 400 && response.status < 500
          ? response.status
          : 502;

    throw new ProviderError(
      `Ошибка провайдера ${provider}: ${detail || response.statusText}`,
      status,
      provider
    );
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new ProviderError(
      `Провайдер ${provider} вернул некорректный JSON.`,
      502,
      provider
    );
  }
}
