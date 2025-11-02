// app/layout.tsx
import type { Metadata } from "next";
import "../styles/billing.tokens.css";
import "../styles/template.tokens.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Elegant Auth Shell",
  description: "Next.js authentication UI shell",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Inter:wght@300;400;500;600;700;800;900&family=Montserrat:wght@400;500;600;700;800&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
