import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MapCrowd — Crowd-sourced community maps",
  description:
    "Drop pins, vote, and explore crowd-sourced maps for everything from bird sightings to vegan restaurants.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
