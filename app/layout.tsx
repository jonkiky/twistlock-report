import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Twistlock Report Generator",
  description: "Search Twistlock repositories, select image tags, and generate downloadable container scan reports.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
