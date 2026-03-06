import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getCurrentUser } from "@/lib/supabase/user";
import "./globals.css";
import Nav from "./components/nav";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ContextVocab — 通过语境掌握英语",
  description:
    "AI 驱动的词汇学习应用。使用目标单词造句，获得即时 AI 反馈，通过间隔重复建立持久记忆。",
  icons: { icon: "/favicon.ico" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser()

  return (
    <html lang="zh-CN">
      <body className={`${inter.variable} antialiased`}>
        <Nav userEmail={user?.email ?? null} />
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
      </body>
    </html>
  );
}
