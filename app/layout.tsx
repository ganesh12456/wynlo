import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Wynlo — Wind Decision Studio', description: 'Reconstruct the wind forecast available at your decision time. Compare publications, review historical performance and prepare a traceable decision brief.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: Readonly<{
    children: React.ReactNode;
}>) { return <html lang="en"><body>{children}</body></html>; }
