import { Component } from 'react';

/**
 * Catches React render errors and shows the message on the page,
 * so a buggy component doesn't render as a blank white screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        padding: 24, margin: 24, border: '2px solid #ef4444',
        borderRadius: 8, background: '#fef2f2', color: '#991b1b',
        fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxWidth: 900
      }}>
        <h2 style={{ marginTop: 0 }}>App crashed</h2>
        <p><strong>Error:</strong> {String(this.state.error?.message || this.state.error)}</p>
        <details open>
          <summary>Stack</summary>
          <pre style={{ fontSize: 12 }}>{this.state.error?.stack}</pre>
        </details>
        {this.state.info?.componentStack && (
          <details open>
            <summary>Component stack</summary>
            <pre style={{ fontSize: 12 }}>{this.state.info.componentStack}</pre>
          </details>
        )}
        <button
          onClick={() => this.setState({ error: null, info: null })}
          style={{ marginTop: 12, padding: '6px 12px' }}
        >Reset</button>
      </div>
    );
  }
}
