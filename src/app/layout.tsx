import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { UserMenu } from '@/components/UserMenu'
import './forkful.css'

export const metadata: Metadata = {
  title: { default: 'Forkful', template: '%s · Forkful' },
  description: 'Save, edit, and scan recipes in your own private cookbook.',
}

// §3.1: Home, Search, Library, Profile, and Help on every page.
// §6.4: privacy policy and terms linked from every page.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <header className="site-header">
          <nav aria-label="Main" className="site-nav">
            <Link href="/" className="brand">Forkful</Link>
            <ul className="nav-links">
              <li><Link href="/">Home</Link></li>
              <li><Link href="/catalog">Search</Link></li>
              <li><Link href="/library">Library</Link></li>
              <li><Link href="/profile">Profile</Link></li>
              <li><Link href="/help">Help</Link></li>
            </ul>
            <Suspense fallback={<div className="user-menu" />}>
              <UserMenu />
            </Suspense>
          </nav>
        </header>
        <main id="main" className="page">{children}</main>
        <footer className="site-footer">
          <Link href="/help#privacy">Privacy policy</Link>
          <span aria-hidden="true"> · </span>
          <Link href="/help#terms">Terms of use</Link>
        </footer>
      </body>
    </html>
  )
}
