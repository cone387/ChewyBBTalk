import React from 'react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { useSelector } from 'react-redux';
import { useAppDispatch, useAppSelector } from '../../src/store/hooks';

const { create, act } = require('react-test-renderer');

describe('store hooks', () => {
  it('binds the typed selector to react-redux', () => {
    expect(useAppSelector).toBe(useSelector);
  });

  it('dispatches and selects through the store context', async () => {
    const dispatched: unknown[] = [];
    const store = createStore((state: unknown = { value: 'state-value' }, action: { type: string; payload?: unknown }) => {
      if (action.type === 'record') dispatched.push(action.payload);
      return state;
    });

    let sawDispatch: unknown;
    let sawState: unknown;
    function Probe() {
      const dispatch = useAppDispatch();
      const value = useAppSelector((s: any) => s.value);
      sawDispatch = dispatch;
      sawState = value;
      return null;
    }

    await act(async () => {
      create(
        <Provider store={store as any}>
          <Probe />
        </Provider>,
      );
    });
    expect(sawState).toBe('state-value');
    expect(sawDispatch).toBe(store.dispatch);
  });
});
