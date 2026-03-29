/// <reference types="vitest/globals" />
import '@testing-library/jest-dom'

// Mock next/navigation for PageViewTracker tests
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))
