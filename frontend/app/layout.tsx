import './globals.css';

export const metadata = {
  title: 'AgriConnect',
  description: 'Smart Farmer & Buyer Agritech Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}