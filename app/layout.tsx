import type { Metadata } from "next";
import { Source_Serif_4, Inter } from "next/font/google";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Visa Document Preparation",
  description:
    "Prepare and export visa application documents entirely in your browser.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          src="https://docs.opencv.org/4.9.0/opencv.js"
          async
        />
      </head>

      <body
        className={`${sourceSerif.variable} ${inter.variable} font-sans bg-[#F5F8FA] text-[#152A3D] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
