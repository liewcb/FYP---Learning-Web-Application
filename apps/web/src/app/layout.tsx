import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Student Home | LearnTogether AI",
  description:
    "Organise learning materials, generate quizzes and collaborate with classmates.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
