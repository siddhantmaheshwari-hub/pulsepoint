'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, CalendarRange, ChevronDown, HeartPulse, Lightbulb, Menu, MessagesSquare, Newspaper, Radio, Settings2, Tags, X } from 'lucide-react';
import { BrandMark } from './Brand';

// Four everyday sections up front; the rest sit in a quiet "More" group (no page was removed).
export const NAV = [
  { href: '/', label: 'Friday brief', icon: Newspaper },
  { href: '/reports', label: 'Weekly reports', icon: CalendarRange },
  { href: '/pain-points', label: 'Pain points', icon: Activity },
  { href: '/topics', label: 'Topics & keywords', icon: Tags },
];
export const MORE = [
  { href: '/opportunities', label: 'Opportunities', icon: Lightbulb },
  { href: '/discussions', label: 'Discussions', icon: MessagesSquare },
  { href: '/sources', label: 'Sources', icon: Radio },
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

  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  const inMore = MORE.some((m) => isActive(m.href));
  const [moreOpen, setMoreOpen] = useState(inMore);
  useEffect(() => { if (inMore) setMoreOpen(true); }, [inMore]);

  const items = (nav: typeof NAV, quiet = false) => nav.map(({ href, label, icon: Icon }) => {
    const active = isActive(href);
    return (
      <li key={href}>
        <Link href={`${href}${qs}`} aria-current={active ? 'page' : undefined}
          className={`flex items-center gap-3 rounded-ctl px-3 transition-colors ${quiet ? 'h-9 text-[13px]' : 'h-10 text-[14px]'} ${active ? 'bg-paper font-medium text-ink' : `${quiet ? 'text-frame-muted' : 'text-frame-text/80'} hover:bg-frame-2 hover:text-frame-text`}`}>
          <Icon size={quiet ? 15 : 17} strokeWidth={active ? 2.1 : 1.7} aria-hidden="true" className={active ? 'text-ink' : 'text-frame-muted'} />
          {label}
        </Link>
      </li>
    );
  });

  // Rendered twice (desktop rail and mobile drawer), so each copy gets its own id.
  const list = (where: string) => (
    <>
      <ul className="flex flex-col gap-0.5">{items(NAV)}</ul>
      <div className="mt-5">
        <button type="button" aria-expanded={moreOpen} aria-controls={`nav-more-${where}`} onClick={() => setMoreOpen((o) => !o)}
          className="flex h-8 w-full items-center justify-between rounded-ctl px-3 text-[12px] font-medium uppercase tracking-[0.06em] text-frame-muted hover:text-frame-text">
          More
          <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
        </button>
        <ul id={`nav-more-${where}`} hidden={!moreOpen} className="mt-0.5 flex flex-col gap-0.5">{items(MORE, true)}</ul>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden w-[232px] shrink-0 flex-col px-4 py-6 lg:flex">
        <Link href={`/${qs}`} className="flex items-center gap-2.5 px-2">
          <BrandMark className="h-7 w-7" />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-frame-text">PulsePoint</span>
        </Link>
        <nav aria-label="Main" className="mt-9">{list('rail')}</nav>
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
            {list('drawer')}
          </nav>
        </div>
      )}
    </>
  );
}
