import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Last line of defence. If any view throws while rendering, React unmounts the
 * whole tree and the screen goes white with no way back — which is exactly what
 * one malformed order used to do. This catches it and shows something a person
 * can act on instead.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Zayaka crashed while rendering:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash">
        <span className="crash-mark" aria-hidden="true">
          ⚠
        </span>
        <h1>Something went wrong on this screen</h1>
        <p>
          Your cakes and costs are safe — this is only the display. Reloading usually clears it.
        </p>
        <div className="crash-actions">
          <button className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </div>
        <details>
          <summary>Technical details</summary>
          <pre>{this.state.error.message}</pre>
        </details>
      </div>
    )
  }
}
