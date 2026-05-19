// Feature: mobile-ui-appstore-ready, Property 5: Error state serialization round-trip
import * as fc from 'fast-check';
import { serializeErrorState, deserializeErrorState, type SerializedErrorState } from '../../src/utils/errorSerializer';

const serializedErrorStateArb = fc.record({
  message: fc.string({ minLength: 0, maxLength: 500 }),
  componentStack: fc.oneof(fc.string({ minLength: 0, maxLength: 1000 }), fc.constant(null)),
  timestamp: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
}) as fc.Arbitrary<SerializedErrorState>;

describe('Property 5: Error state serialization round-trip', () => {
  it('deserialize(serialize(state)) produces an equivalent object for all valid states', () => {
    fc.assert(
      fc.property(serializedErrorStateArb, (state) => {
        const serialized = serializeErrorState(state);
        const deserialized = deserializeErrorState(serialized);

        expect(deserialized.message).toBe(state.message);
        expect(deserialized.componentStack).toBe(state.componentStack);
        expect(deserialized.timestamp).toBe(state.timestamp);
      }),
      { numRuns: 100 },
    );
  });

  it('serialize produces valid JSON', () => {
    fc.assert(
      fc.property(serializedErrorStateArb, (state) => {
        const serialized = serializeErrorState(state);
        expect(() => JSON.parse(serialized)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it('deserialize throws on invalid JSON', () => {
    expect(() => deserializeErrorState('not json')).toThrow();
    expect(() => deserializeErrorState('{}')).toThrow();
    expect(() => deserializeErrorState('{"message": 123}')).toThrow();
  });
});
