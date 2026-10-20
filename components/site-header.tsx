'use client';

import { usePathname } from 'next/navigation';
import { Shield } from 'lucide-react';
import { CollectorAccountMenu, useCollectorAccount } from '@/components/collector-account';

const links = [
  { href: '/', label: 'Catalog' },
  { href: '/?view=collection', label: 'My collection' },
  { href: '/collectors', label: 'Collectors' },
  { href: '/discussions', label: 'Discussions' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/transfer', label: 'Import / export' },
  { href: '/admin', label: 'Add / edit catalog items', admin: true },
  { href: '/discussions/moderation', label: 'Moderation', admin: true },
];

export function SiteHeader({ catalogView = 'catalog' }: { catalogView?: string }) {
  const pathname = usePathname();
  const { account } = useCollectorAccount();
  function isCurrent(href: string) {
    if (href === '/') return pathname === '/' && catalogView !== 'collection';
    if (href === '/?view=collection') return pathname === '/' && catalogView === 'collection';
    if (href === '/discussions' && pathname === '/discussions/moderation') return false;
    return pathname === href || pathname?.startsWith(href + '/');
  }

  return <header className="collector-site-header">
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Full navigation resets the catalog's local view and filters. */}
    <a className="brand" href="/"><Shield size={30} aria-hidden="true" /><span>G.I. JEFF</span></a>
    <nav className="account-actions site-navigation" aria-label="Site">
      {links.filter(link => !link.admin || account?.role === 'admin').map(link =>
        <a key={link.href} href={link.href} className={link.admin ? 'admin-link' : undefined} aria-current={isCurrent(link.href) ? 'page' : undefined}>
          {link.label}{link.admin && <span className="admin-link-label">Admin</span>}
        </a>
      )}
    </nav>
    <CollectorAccountMenu />
  </header>;
}
