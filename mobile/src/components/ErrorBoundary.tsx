import React from 'react';
import { logError } from '../utils/errorHandler';
import { serializeErrorState, type SerializedErrorState } from '../utils/errorSerializer';
import ErrorFallback from './ErrorFallback';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  timestamp: number | null;
}

/**
 * React Error Boundary that catches render errors and displays a fallback UI.
 * Prevents white-screen crashes and logs errors for debugging.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: null,
      timestamp: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      timestamp: Date.now(),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const componentStack = info.componentStack ?? null;
    this.setState({ componentStack });

    // Log via existing error handler
    logError(error, 'ErrorBoundary');

    // Serialize for potential debugging/reporting
    const serialized: SerializedErrorState = {
      message: error.message,
      componentStack,
      timestamp: this.state.timestamp ?? Date.now(),
    };
    // Store serialized state for debugging (could be sent to crash reporting)
    if (__DEV__) {
      console.warn('[ErrorBoundary] Serialized state:', serializeErrorState(serialized));
    }
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
      componentStack: null,
      timestamp: null,
    });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <ErrorFallback
          onRetry={this.resetError}
          errorMessage={this.state.error?.message}
        />
      );
    }

    return this.props.children;
  }
}
