import type { Metadata, Viewport } from "next";
import "react-datepicker/dist/react-datepicker.css";
import "./globals.css";
import "./datepicker.css";
import { ViewerTimeZoneProvider } from "@/components/viewer-time-zone";

export const metadata: Metadata = {
  title: {
    default: "eevents | events for learning together",
    template: "%s · eevents",
  },
  description: "A home for learning events, registrations, and certificates.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#101112",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/Geist-Variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/tiktok-sans-latin-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <ViewerTimeZoneProvider>{children}</ViewerTimeZoneProvider>
      </body>
    </html>
  );
}
