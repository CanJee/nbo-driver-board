import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NBO Transportation Dispatch",
  description: "National Bank Open - Live Driver Dispatch Board",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-[#0F172A] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
