export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect width="28" height="28" rx="8" fill="#F5F3EE" />
      <path d="M5 15h4l2.2-6 3.6 12 2.6-8.5L19 15h4" fill="none" stroke="#1E2A30" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="15" r="2.2" fill="#5B4FE0" />
    </svg>
  );
}
