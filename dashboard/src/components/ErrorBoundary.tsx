'use client'

/**
 * ErrorBoundary.tsx — React error boundary for MCM Forge dashboard
 *
 * Catches render crashes and fires a 'js_error' analytics event.
 * Wraps the full app in layout.tsx so all routes are covered.
 * Falls back to a minimal error UI that doesn't break the page entirely.
 */

import React from 'react'
import { track } from '@/lib/analytics'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Fire-and-forget — track the crash, never re-throw
    track('js_error', {
      message: error.message,
      stack: error.stack?.slice(0, 500),
      component_stack: info.componentStack?.slice(0, 500),
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa]">
          <div className="max-w-md rounded-lg border border-red-200 bg-white p-8 text-center shadow-sm">
            <h1 className="mb-2 text-lg font-semibold text-red-600">
              Something went wrong
            </h1>
            <p className="mb-4 text-sm text-gray-500">
              {this.state.errorMessage || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
