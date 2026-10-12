'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, CalendarRange, HeartPulse, LayoutGrid, Lightbulb, Menu, MessagesSquare, Radio, Settings2, Tags, X } from 'lucide-react';
import { BrandMark } from './Brand';

export const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutGrid },
  { href: '/reports', label: 'Weekly reports', icon: CalendarRange },
  { href: '/pain-points', label: 'Pain points', icon: Activity },
  { href: '/opportunities', label: 'Opportunities', icon: Lightbulb },
  { href: '/discussions', label: 'Discussions', icon: MessagesSquare },
  { href: '/sources', label: 'Sources', icon: Radio },
  { href: '/topics', label: 'Topics & keywords', icon: Tags },
  { href: '/health', label: 'System health', icon: HeartPulse },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

export function Sidebar({ nextBrief }: { nextBrief: string }) {
  const path = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  // Carry the selected week and comparison mode across sections
  const keep = new URLSearchParams();
  for (const k of ['report', 'compare']) { const v = sp.get(k); if (v) keep.set(k, v); }
  const qs = keep.toString() ? `?${keep}` : '';

  const list = (
    <ul className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <li key={href}>
            <Link href={`${href}${qs}`} aria-current={active ? 'page' : undefined}
              className={`flex h-10 items-center gap-3 rounded-ctl px-3 text-[14px] transition-colors ${active ? 'bg-paper font-medium text-ink' : 'text-frame-text/80 hover:bg-frame-2 hover:text-frame-text'}`}>
              <Icon size={17} strokeWidth={active ? 2.1 : 1.7} aria-hidden="true" className={active ? 'text-ink' : 'text-frame-muted'} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden w-[232px] shrink-0 flex-col px-4 py-6 lg:flex">
        <Link href={`/${qs}`} className="flex items-center gap-2.5 px-2">
          <BrandMark className="h-7 w-7" />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-frame-text">PulsePoint</span>
        </Link>
        <nav aria-label="Main" className="mt-9">{list}</nav>
        <div className="mt-auto space-y-4 px-2">
          <div className="rounded-panel bg-frame-2 p-4">
            <p className="text-[12px] text-frame-muted">Next scheduled brief</p>
            <p className="mt-1 text-[14px] font-medium text-frame-text">{nextBrief}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-frame-3 text-[13px] font-semibold text-frame-text" aria-hidden="true">S</span>
            <span className="leading-tight"><span className="block text-[13px] font-medium text-frame-text">Sumit</span><span className="text-[12px] text-frame-muted">Product</span></span>
          </div>
        </div>
      </aside>

      {/* Mobile bar */}
      <div className="flex items-center justify-between px-4 py-3 lg:hidden">
        <Link href={`/${qs}`} className="flex items-center gap-2"><BrandMark className="h-7 w-7" /><span className="font-semibold text-frame-text">PulsePoint</span></Link>
        <button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full text-frame-text hover:bg-frame-2" aria-label="Open navigation"><Menu size={20} /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <nav aria-label="Main" className="h-full w-[270px] bg-frame px-4 py-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between px-2">
              <span className="flex items-center gap-2"><BrandMark className="h-7 w-7" /><span className="font-semibold text-frame-text">PulsePoint</span></span>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-frame-text hover:bg-frame-2" aria-label="Close navigation"><X size={18} /></button>
            </div>
            {list}
          </nav>
        </div>
      )}
    </>
  );
}
