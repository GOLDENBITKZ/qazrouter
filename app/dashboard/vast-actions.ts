"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deployModel, quoteDeployment, refreshForUser } from "@/lib/vast/deployments";
import type { DeploymentView, OfferQuote } from "@/lib/vast/catalog";

export interface VastActionResult {
  error?: string;
  quote?: OfferQuote;
  deployment?: DeploymentView | null;
}

export async function vastAction(action: "quote" | "deploy" | "refresh" | "destroy", value = ""): Promise<VastActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Сессия истекла. Войдите снова." };
  if (value.length > 4_000) return { error: "Некорректный запрос." };
  try {
    switch (action) {
      case "quote": return { quote: await quoteDeployment(user.id, value) };
      case "deploy": return { deployment: await deployModel(user.id, value) };
      case "refresh": return { deployment: await refreshForUser(user.id) };
      case "destroy": return { deployment: await refreshForUser(user.id, true) };
      default: return { error: "Неизвестное действие." };
    }
  } catch (error) {
    // Only our fixed messages are shown. Raw network/DB/provider errors are never exposed.
    const message = error instanceof Error ? error.message : "";
    const safe = /^(Vast\.ai API: HTTP \d+\.|[А-ЯЁ])/.test(message);
    return { error: safe ? message : "Не удалось выполнить операцию GPU. Повторите проверку статуса." };
  }
}
