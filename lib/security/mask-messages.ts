import type { ChatMessage } from "../providers/types";
import {
  maskSensitiveText,
  mergeMaskingCounts,
  type MaskingResult
} from "./mask-sensitive-data";

function maskUnknown(
  value: unknown,
  counts: MaskingResult["counts"]
): unknown {
  if (typeof value === "string") {
    const result = maskSensitiveText(value);
    mergeMaskingCounts(counts, result.counts);
    return result.text;
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskUnknown(item, counts));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        maskUnknown(nested, counts)
      ])
    );
  }

  return value;
}

/**
 * Поля role и name не содержат пользовательских данных в штатном запросе.
 * Маскируется content и tool_calls, включая вложенные текстовые аргументы.
 */
export function maskChatMessages(messages: ChatMessage[]): {
  messages: ChatMessage[];
  counts: MaskingResult["counts"];
} {
  const counts = { iin: 0, phone: 0, card: 0 };

  const masked = messages.map((message) => ({
    role: message.role,
    name: message.name,
    tool_call_id: message.tool_call_id,
    content: maskUnknown(message.content, counts),
    ...(message.tool_calls !== undefined
      ? { tool_calls: maskUnknown(message.tool_calls, counts) }
      : {})
  }));

  return { messages: masked, counts };
}
