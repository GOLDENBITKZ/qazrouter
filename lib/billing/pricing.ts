export const PUBLIC_MODELS = [
  "kz-deepseek",
  "kz-gemini",
  "kz-gpt",
  "kz-claude",
  "kz-qwen",
  "kz-llama"
] as const;

export type PublicModel = (typeof PUBLIC_MODELS)[number];
export type ModelProvider =
  | "deepseek"
  | "gemini"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "groq";

export interface ModelPricing {
  publicName: PublicModel;
  provider: ModelProvider;
  label: string;
  description: string;
  inputPricePerMillionKzt: number;
  outputPricePerMillionKzt: number;
}

/**
 * Единая точка изменения тарифов.
 * Пользователь задал цену за входные токены; цена выходных токенов
 * вынесена отдельно, потому что провайдеры считают её дороже.
 */
export const MODEL_CATALOG: Record<PublicModel, ModelPricing> = {
  "kz-deepseek": {
    publicName: "kz-deepseek",
    provider: "deepseek",
    label: "DeepSeek",
    description: "Для кода, анализа и Agentic-сценариев",
    inputPricePerMillionKzt: 150,
    outputPricePerMillionKzt: 600
  },
  "kz-gemini": {
    publicName: "kz-gemini",
    provider: "gemini",
    label: "Gemini",
    description: "Для длинного контекста и анализа документов",
    inputPricePerMillionKzt: 180,
    outputPricePerMillionKzt: 720
  },
  "kz-gpt": {
    publicName: "kz-gpt",
    provider: "openai",
    label: "GPT",
    description: "OpenAI для сложных рассуждений и инструментов",
    inputPricePerMillionKzt: 1_200,
    outputPricePerMillionKzt: 4_800
  },
  "kz-claude": {
    publicName: "kz-claude",
    provider: "anthropic",
    label: "Claude",
    description: "Anthropic для анализа документов и кода",
    inputPricePerMillionKzt: 1_500,
    outputPricePerMillionKzt: 7_500
  },
  "kz-qwen": {
    publicName: "kz-qwen",
    provider: "openrouter",
    label: "Qwen",
    description: "Экономичная open-weight модель для больших объёмов",
    inputPricePerMillionKzt: 90,
    outputPricePerMillionKzt: 360
  },
  "kz-llama": {
    publicName: "kz-llama",
    provider: "groq",
    label: "Llama",
    description: "Быстрая open-weight модель для чатов и извлечения данных",
    inputPricePerMillionKzt: 60,
    outputPricePerMillionKzt: 240
  }
};

export function isPublicModel(value: string): value is PublicModel {
  return PUBLIC_MODELS.includes(value as PublicModel);
}

export function calculateCostKzt(
  model: PublicModel,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_CATALOG[model];
  const inputCost =
    (Math.max(0, inputTokens) / 1_000_000) *
    pricing.inputPricePerMillionKzt;
  const outputCost =
    (Math.max(0, outputTokens) / 1_000_000) *
    pricing.outputPricePerMillionKzt;

  return Math.round((inputCost + outputCost) * 10_000) / 10_000;
}

export function formatKzt(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat("ru-KZ", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
}
