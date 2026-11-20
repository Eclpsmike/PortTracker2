import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <main style={{ padding: 32, fontFamily: 'system-ui' }}><h1>PortTracker couldn’t render the rack.</h1><p role="alert">{this.state.error}</p><button onClick={() => location.reload()}>Reload demo</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>);
