import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default: "QazRouter — мировой ИИ для бизнеса в Казахстане",
    template: "%s | QazRouter"
  },
  description:
    "OpenAI-совместимый AI-роутер с оплатой в тенге, маскированием персональных данных и биллингом по фактическим токенам.",
  applicationName: "QazRouter",
  keywords: [
    "AI router Kazakhstan",
    "DeepSeek Казахстан",
    "Gemini API тенге",
    "ИИ для бизнеса",
    "МЦРИАП",
    "маскирование персональных данных"
  ],
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
