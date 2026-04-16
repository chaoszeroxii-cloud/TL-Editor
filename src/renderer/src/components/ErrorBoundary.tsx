import React, { ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  name?: string
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`Error in ${this.props.name || 'component'}:`, error, errorInfo.componentStack)

    // Optional: Send to error tracking service
    // Sentry.captureException(error, { tags: { component: this.props.name } })
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div
            style={{
              padding: '20px',
              margin: '10px',
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#333'
            }}
          >
            <h3 style={{ margin: '0 0 10px 0', color: '#856404' }}>
              ⚠️ {this.props.name || 'Component'} Error
            </h3>
            <details style={{ marginBottom: '10px' }}>
              <summary style={{ cursor: 'pointer', color: '#856404', fontWeight: 'bold' }}>
                Error details
              </summary>
              <pre
                style={{
                  margin: '10px 0 0 0',
                  padding: '10px',
                  background: '#f5f5f5',
                  overflow: 'auto',
                  maxHeight: '200px',
                  color: '#d32f2f'
                }}
              >
                {this.state.error?.message}
                {'\n\n'}
                {this.state.error?.stack}
              </pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '6px 12px',
                background: '#ffc107',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: 'bold',
                color: '#000'
              }}
            >
              🔄 Reload Application
            </button>
          </div>
        )
      )
    }

    return this.props.children
  }
}
