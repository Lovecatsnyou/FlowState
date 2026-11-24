import React from 'react';
import './globals.css';

export const metadata = {
  title: 'FlowState',
  description: 'Персональный сервис для управления продуктивностью',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
