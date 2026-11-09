import { NextResponse } from "next/server";

export type OpenAIErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "insufficient_quota"
  | "rate_limit_error"
  | "server_error";

export function openAIError(
  status: number,
  message: string,
  type: OpenAIErrorType,
  code: string,
  param: string | null = null
) {
  return NextResponse.json(
    {
      error: {
        message,
        type,
        param,
        code
      }
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );
}
