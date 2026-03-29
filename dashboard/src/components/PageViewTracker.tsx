'use client'

/**
 * PageViewTracker.tsx — Auto-tracks page views on every route change
 *
 * Invisible component. Uses usePathname() to detect navigation.
 * Fires page() on initial load and every pathname change.
 * Drop into layout.tsx — no props needed.
 */

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { page } from '@/lib/analytics'

export default function PageViewTracker() {
  const pathname = usePathname()

  useEffect(() => {
    page(pathname)
  }, [pathname])

  return null
}
