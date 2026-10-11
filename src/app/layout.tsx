import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = { title: 'Developer Community Pulse', description: 'Weekly developer pain-point intelligence for code review automation' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-[1240px] flex-col md:flex-row">
          <Nav />
          <main className="min-w-0 flex-1 px-5 py-8 md:px-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
