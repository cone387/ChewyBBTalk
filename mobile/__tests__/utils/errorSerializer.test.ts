import {
  serializeErrorState,
  deserializeErrorState,
  type SerializedErrorState,
} from '../../src/utils/errorSerializer';

describe('serializeErrorState', () => {
  it('round-trips a full state', () => {
    const state: SerializedErrorState = {
      message: 'boom',
      componentStack: 'in Component\nin App',
      timestamp: 1760000000000,
    };
    expect(JSON.parse(serializeErrorState(state))).toEqual(state);
    expect(deserializeErrorState(serializeErrorState(state))).toEqual(state);
  });

  it('keeps a null component stack', () => {
    const json = serializeErrorState({ message: 'x', componentStack: null, timestamp: 1 });
    expect(json).toBe('{"message":"x","componentStack":null,"timestamp":1}');
    expect(deserializeErrorState(json).componentStack).toBeNull();
  });
});

describe('deserializeErrorState validation', () => {
  const valid = JSON.stringify({ message: 'x', componentStack: null, timestamp: 1 });

  it('rejects broken json', () => {
    expect(() => deserializeErrorState('not-json')).toThrow();
  });

  it('rejects a missing or non-string message', () => {
    expect(() => deserializeErrorState(JSON.stringify({ componentStack: null, timestamp: 1 })))
      .toThrow('message must be a string');
    expect(() => deserializeErrorState(JSON.stringify({ message: 42, componentStack: null, timestamp: 1 })))
      .toThrow('message must be a string');
  });

  it('rejects a non-string component stack', () => {
    expect(() => deserializeErrorState(JSON.stringify({ message: 'x', componentStack: 7, timestamp: 1 })))
      .toThrow('componentStack must be string or null');
  });

  it('rejects a non-number timestamp', () => {
    expect(() => deserializeErrorState(JSON.stringify({ message: 'x', componentStack: null, timestamp: '1' })))
      .toThrow('timestamp must be a number');
  });

  it('accepts the valid shape', () => {
    expect(deserializeErrorState(valid)).toEqual({ message: 'x', componentStack: null, timestamp: 1 });
  });
});
