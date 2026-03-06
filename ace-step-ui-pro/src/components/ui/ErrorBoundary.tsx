import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Copy, CheckCheck } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleCopy = () => {
    const { error, errorInfo } = this.state;
    const text = [
      `Error: ${error?.message || 'Unknown error'}`,
      `Name: ${error?.name || 'Error'}`,
      '',
      '--- Stack Trace ---',
      error?.stack || '(no stack)',
      '',
      '--- Component Stack ---',
      errorInfo?.componentStack || '(no component stack)',
      '',
      `Date: ${new Date().toISOString()}`,
      `URL: ${window.location.href}`,
      `UserAgent: ${navigator.userAgent}`,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  handleRefresh = () => {
    window.location.reload();
  };

  handleRecover = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, copied } = this.state;

    return (
      <div className="h-screen flex items-center justify-center bg-surface-0 text-surface-900 p-6">
        <div className="max-w-lg w-full space-y-6">
          {/* Error icon */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-surface-900">Something went wrong</h1>
            <p className="text-sm text-surface-500 text-center">
              The application encountered an unexpected error. You can try refreshing or copying the error details for debugging.
            </p>
          </div>

          {/* Error message */}
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
            <p className="text-sm font-mono text-red-400 break-all">
              {error?.message || 'Unknown error'}
            </p>
          </div>

          {/* Stack trace (collapsible) */}
          <details className="bg-surface-100 border border-surface-200 rounded-xl overflow-hidden">
            <summary className="px-4 py-3 text-sm font-medium text-surface-600 cursor-pointer hover:bg-surface-200/50 transition-colors">
              Error Details (click to expand)
            </summary>
            <div className="px-4 pb-4">
              <pre className="text-[11px] font-mono text-surface-500 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {error?.stack || '(no stack trace)'}
              </pre>
              {errorInfo?.componentStack && (
                <>
                  <p className="text-[10px] font-semibold text-surface-400 uppercase mt-3 mb-1">Component Stack</p>
                  <pre className="text-[11px] font-mono text-surface-500 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                    {errorInfo.componentStack}
                  </pre>
                </>
              )}
            </div>
          </details>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={this.handleRefresh}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent-600 text-white font-semibold text-sm hover:bg-accent-500 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Page
            </button>
            <button
              onClick={this.handleCopy}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-surface-200 text-surface-700 font-semibold text-sm hover:bg-surface-300 transition-colors"
            >
              {copied ? <CheckCheck className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Error'}
            </button>
          </div>

          {/* Try recover */}
          <div className="text-center">
            <button
              onClick={this.handleRecover}
              className="text-xs text-surface-400 hover:text-surface-600 underline transition-colors"
            >
              Try to recover without refreshing
            </button>
          </div>
        </div>
      </div>
    );
  }
}
