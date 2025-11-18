import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Weapon Detection System',
  description: 'Real-time AI-powered weapon detection with YOLO',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}