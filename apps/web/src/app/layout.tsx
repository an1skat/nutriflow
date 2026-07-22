import type { Metadata } from 'next';

import { AppProviders } from './AppProviders';
import './globals.css';

export const metadata: Metadata = {
  title: 'NutriFlow',
  description: 'Керування шкільним харчуванням',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
