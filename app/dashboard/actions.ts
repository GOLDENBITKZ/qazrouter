"use server";

import { revalidatePath } from "next/cache";

import { generateApiKey } from "@/lib/security/api-keys";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CreateKeyState {
  status: "idle" | "success" | "error";
  secret?: string;
  keyId?: string;
  message?: string;
}

export interface TopupState {
  status: "idle" | "success" | "error";
  message?: string;
}

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return { supabase, user };
}

export async function createApiKeyAction(
  _previousState: CreateKeyState,
  formData: FormData
): Promise<CreateKeyState> {
  const { user } = await getAuthenticatedUser();

  if (!user) {
    return {
      status: "error",
      message: "Сессия истекла. Войдите снова."
    };
  }

  const rawName = String(formData.get("name") || "").trim();
  const name = rawName.slice(0, 60) || "Default key";
  const generated = generateApiKey();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .insert({
      user_id: user.id,
      name,
      key_prefix: generated.prefix,
      key_last_four: generated.lastFour,
      key_hash: generated.hash
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("create_api_key_failed", {
      userId: user.id,
      code: error?.code
    });
    return {
      status: "error",
      message: "Не удалось создать ключ. Попробуйте ещё раз."
    };
  }

  revalidatePath("/dashboard");

  return {
    status: "success",
    secret: generated.secret,
    keyId: data.id
  };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const { user } = await getAuthenticatedUser();
  const keyId = String(formData.get("keyId") || "");

  if (!user || !keyId) {
    return;
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("api_keys")
    .update({
      is_active: false,
      revoked_at: new Date().toISOString()
    })
    .eq("id", keyId)
    .eq("user_id", user.id);

  if (error) {
    console.error("revoke_api_key_failed", {
      userId: user.id,
      keyId,
      code: error.code
    });
  }

  revalidatePath("/dashboard");
}

export async function createTopupRequestAction(
  _previousState: TopupState,
  formData: FormData
): Promise<TopupState> {
  const { supabase, user } = await getAuthenticatedUser();

  if (!user) {
    return {
      status: "error",
      message: "Сессия истекла. Войдите снова."
    };
  }

  const amount = Number(
    String(formData.get("amount") || "0").replace(/\s/g, "").replace(",", ".")
  );
  const transactionId = String(
    formData.get("transactionId") || ""
  ).trim();

  if (!Number.isFinite(amount) || amount < 5_000 || amount > 1_000_000) {
    return {
      status: "error",
      message: "Сумма должна быть от 5 000 до 1 000 000 ₸."
    };
  }

  if (
    transactionId.length < 6 ||
    transactionId.length > 100 ||
    !/^[A-Za-z0-9._-]+$/.test(transactionId)
  ) {
    return {
      status: "error",
      message: "Введите корректный номер Kaspi-транзакции."
    };
  }

  const { error } = await supabase.from("topup_requests").insert({
    user_id: user.id,
    amount_kzt: Math.round(amount * 100) / 100,
    kaspi_transaction_id: transactionId,
    status: "pending"
  });

  if (error) {
    const duplicate = error.code === "23505";
    return {
      status: "error",
      message: duplicate
        ? "Заявка с таким номером транзакции уже существует."
        : "Не удалось создать заявку. Попробуйте позже."
    };
  }

  revalidatePath("/dashboard");

  return {
    status: "success",
    message:
      "Заявка создана. Мы проверим поступление и зачислим средства после сверки."
  };
}
