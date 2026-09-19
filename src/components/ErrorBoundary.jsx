import { Component } from 'react';

/** Last-resort screen so a render error never leaves users on a blank page. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-slate-50">
        <img src="/img/logo.png" alt="" className="h-20 w-20" />
        <h1 className="font-display text-xl mt-4 text-slate-900">Something went wrong</h1>
        <p className="text-slate-600 mt-2 text-sm max-w-sm">{String(this.state.error?.message || this.state.error)}</p>
        <button
          className="mt-6 rounded-xl bg-brand-600 text-white px-5 py-2.5 font-semibold"
          onClick={() => {
            window.location.href = '/';
          }}
        >
          Reload app
        </button>
      </div>
    );
  }
}
