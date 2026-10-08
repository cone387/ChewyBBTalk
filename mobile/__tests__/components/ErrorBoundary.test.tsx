jest.mock('react-native', () => ({
  __esModule: true,
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('../../src/utils/errorHandler', () => ({ logError: jest.fn() }));
jest.mock('../../src/utils/errorSerializer', () => ({ serializeErrorState: jest.fn(() => 'serialized-error') }));
jest.mock('../../src/components/ErrorFallback', () => ({ __esModule: true, default: 'ErrorFallback' }));

import React from 'react';
import { Text } from 'react-native';
import ErrorBoundary from '../../src/components/ErrorBoundary';

const { create, act } = require('react-test-renderer');
const { logError } = require('../../src/utils/errorHandler');
const { serializeErrorState } = require('../../src/utils/errorSerializer');

(global as any).__DEV__ = true;

function Boom(): never {
  throw new Error('render blew up');
}

let broken = true;
function Flaky() {
  if (broken) throw new Error('render blew up');
  return <Text>recovered</Text>;
}

let tree: any;
let consoleError: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).__DEV__ = true;
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  act(() => { tree?.unmount(); });
  tree = undefined;
  consoleError.mockRestore();
});

describe('ErrorBoundary', () => {
  it('renders children while healthy', async () => {
    await act(async () => {
      tree = create(<ErrorBoundary><Text>hello</Text></ErrorBoundary>);
    });
    expect(tree.root.findByType('Text').props.children).toBe('hello');
    expect(logError).not.toHaveBeenCalled();
  });

  it('catches render errors, logs and shows the fallback', async () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await act(async () => {
        tree = create(
          <ErrorBoundary>
            <Boom />
          </ErrorBoundary>,
        );
      });
      expect(tree.root.findByType('ErrorFallback').props.errorMessage).toBe('render blew up');
      expect(typeof tree.root.findByType('ErrorFallback').props.onRetry).toBe('function');
      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError.mock.calls[0]![0]).toBeInstanceOf(Error);
      expect(logError.mock.calls[0]![1]).toBe('ErrorBoundary');
      expect(serializeErrorState).toHaveBeenCalledTimes(1);
      expect(consoleWarn).toHaveBeenCalledWith('[ErrorBoundary] Serialized state:', 'serialized-error');
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it('serializes without the dev warning in release builds', async () => {
    (global as any).__DEV__ = false;
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await act(async () => {
        tree = create(
          <ErrorBoundary>
            <Boom />
          </ErrorBoundary>,
        );
      });
      expect(tree.root.findByType('ErrorFallback')).toBeDefined();
      expect(serializeErrorState).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it('shows a fully custom fallback when provided', async () => {
    await act(async () => {
      tree = create(
        <ErrorBoundary fallback={<Text>定制兜底</Text>}>
          <Boom />
        </ErrorBoundary>,
      );
    });
    expect(tree.root.findByType('Text').props.children).toBe('定制兜底');
    expect(tree.root.findAllByType('ErrorFallback')).toHaveLength(0);
  });

  it('recovers through the retry callback', async () => {
    broken = true;
    await act(async () => {
      tree = create(
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>,
      );
    });
    expect(tree.root.findByType('ErrorFallback')).toBeDefined();
    broken = false;
    const retry = tree.root.findByType('ErrorFallback').props.onRetry as () => void;
    await act(async () => { retry(); });
    expect(tree.root.findAllByType('ErrorFallback')).toHaveLength(0);
    expect(tree.root.findByType('Text').props.children).toBe('recovered');
  });
});
