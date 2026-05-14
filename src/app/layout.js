import "./globals.css";
import Script from "next/script";

export const metadata = {
  title: "AI Watermark Remover",
  description: "Next.js Watermark Remover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>

        <Script
          src="https://docs.opencv.org/4.x/opencv.js"
          strategy="beforeInteractive"
        />

        {children}

      </body>
    </html>
  );
}