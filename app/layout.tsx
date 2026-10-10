import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SSPP Portal | Assumption College of Davao",
  description: "Sign in to the Assumption College of Davao SSPP Portal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
