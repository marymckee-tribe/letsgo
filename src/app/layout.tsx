import type { Metadata } from "next";
import { Jost, DM_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MainNav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";
import { HubProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/auth-provider";
import { TRPCProvider } from "@/lib/trpc/provider";

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Hub",
  description: "AI-powered personal productivity dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jost.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <AuthProvider>
            <TRPCProvider>
            <HubProvider>
              <MainNav />
              {children}
              <Toaster position="bottom-right" toastOptions={{ className: "border-0 shadow-none rounded-none bg-foreground text-background px-6 py-4 font-mono uppercase tracking-widest text-xs" }} />
            </HubProvider>
            </TRPCProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
