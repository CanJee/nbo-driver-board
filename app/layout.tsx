import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "@/components/ui/ThemeProvider";

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
    // suppressHydrationWarning: next-themes mutates the html class before hydration
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full bg-page text-fg antialiased">
        {/* defaultTheme="dark" keeps the board's original look until a user
            explicitly toggles — no surprise theme flips on venue displays. */}
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
