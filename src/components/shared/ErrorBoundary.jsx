import { Component } from 'react'

/**
 * Generic error boundary — catches render/lifecycle errors in its subtree
 * and shows a readable error panel instead of crashing the entire React tree.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught render error:', error, info)
    this.setState({ info })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-stone-50 px-6 text-center gap-4">
          <span className="text-5xl">💥</span>
          <h2 className="text-base font-semibold text-stone-800">Something went wrong</h2>
          <p className="text-sm text-stone-500 max-w-md">
            {this.state.error?.message || 'Unknown render error'}
          </p>
          <pre className="text-[10px] text-left text-red-600 bg-red-50 rounded-xl p-4 max-w-2xl w-full overflow-auto max-h-64 border border-red-100 whitespace-pre-wrap">
            {this.state.error?.stack || String(this.state.error)}
          </pre>
          {this.state.info?.componentStack && (
            <pre className="text-[10px] text-left text-stone-500 bg-stone-100 rounded-xl p-4 max-w-2xl w-full overflow-auto max-h-40 border border-stone-200 whitespace-pre-wrap">
              {this.state.info.componentStack}
            </pre>
          )}
          <button
            onClick={() => { this.setState({ error: null, info: null }); window.history.back() }}
            className="px-4 py-2 bg-[#4d68f0] text-white rounded-xl text-sm font-semibold"
          >
            ← Go back
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
