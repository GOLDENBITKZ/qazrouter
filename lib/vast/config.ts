export function vastSettings() {
  const apiKey = process.env.VAST_API_KEY?.trim();
  const image = process.env.VAST_WORKER_IMAGE?.trim();
  const secret = process.env.VAST_DEPLOYMENT_SECRET?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();
  const maxHourlyUsd = Number(process.env.VAST_MAX_HOURLY_USD || "0.5");
  const durationMinutes = Number(process.env.VAST_SESSION_MINUTES || "60");
  if (!apiKey || !image || !secret || secret.length < 32 || !cronSecret ||
      !/^[-\w./]+@sha256:[a-f0-9]{64}$/.test(image) ||
      !Number.isFinite(maxHourlyUsd) || maxHourlyUsd <= 0 || maxHourlyUsd > 10 ||
      !Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 120) {
    throw new Error("Vast.ai не настроен: проверьте ключи, digest образа и лимиты.");
  }
  return { apiKey, image, secret, maxHourlyUsd, durationMinutes };
}

export function canDeployVast(userId: string): boolean {
  return (process.env.VAST_ALLOWED_USER_IDS || "").split(",").map(x => x.trim()).includes(userId);
}
