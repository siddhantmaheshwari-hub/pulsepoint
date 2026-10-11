'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: 'Friday brief' },
  { href: '/reports', label: 'Report history' },
  { href: '/runs', label: 'Collection status' },
  { href: '/topics', label: 'Topics & keywords' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="border-b border-line px-5 py-4 md:w-56 md:shrink-0 md:border-b-0 md:border-r md:py-8" aria-label="Main">
      <Link href="/" className="flex items-center gap-2 text-ink no-underline hover:no-underline">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M1 12h4l2.5-7 4 13 3-9 1.5 3H21" fill="none" stroke="#34537A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="text-[15px] font-semibold leading-tight">Community Pulse</span>
      </Link>
      <ul className="mt-4 flex gap-1 overflow-x-auto md:mt-8 md:flex-col">
        {items.map((i) => {
          const active = i.href === '/' ? path === '/' : path.startsWith(i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={active ? 'page' : undefined}
                className={`block whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm no-underline hover:no-underline ${active ? 'bg-panel font-medium text-ink shadow-[inset_2px_0_0_#34537A]' : 'text-muted hover:text-ink'}`}>
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
