/** Exact, reviewed model IDs. Never accept images, model paths or shell args from the browser. */
export const VAST_MODELS = {
  "kz-vast-qwen": {
    label: "Qwen 2.5 · 7B Instruct",
    huggingFaceId: "Qwen/Qwen2.5-7B-Instruct",
    description: "Чаты, документы, русский и казахский языки",
    gpuRamMb: 24_000,
    diskGb: 40,
    gated: false,
    inputPricePerMillionKzt: 45,
    outputPricePerMillionKzt: 180
  },
  "kz-vast-coder": {
    label: "Qwen 2.5 Coder · 7B Instruct",
    huggingFaceId: "Qwen/Qwen2.5-Coder-7B-Instruct",
    description: "Генерация и разбор кода",
    gpuRamMb: 24_000,
    diskGb: 40,
    gated: false,
    inputPricePerMillionKzt: 45,
    outputPricePerMillionKzt: 180
  },
  "kz-vast-llama": {
    label: "Llama 3.1 · 8B Instruct",
    huggingFaceId: "meta-llama/Llama-3.1-8B-Instruct",
    description: "Общие задачи; требуется доступ к весам Meta",
    gpuRamMb: 24_000,
    diskGb: 40,
    gated: true,
    inputPricePerMillionKzt: 30,
    outputPricePerMillionKzt: 120
  }
} as const;

export type VastModel = keyof typeof VAST_MODELS;

export function isVastModel(value: string): value is VastModel {
  return Object.hasOwn(VAST_MODELS, value);
}

export interface DeploymentView {
  id: string;
  model: VastModel;
  state: string;
  hourlyUsd: number;
  gpuName: string;
  expiresAt: string;
}

export interface OfferQuote {
  token: string;
  model: VastModel;
  gpuName: string;
  location: string;
  hourlyUsd: number;
  expiresAt: string;
  durationMinutes: number;
}
