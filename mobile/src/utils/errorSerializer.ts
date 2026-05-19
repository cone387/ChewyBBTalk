/**
 * Error state serialization/deserialization for Error Boundary.
 * Supports round-trip property: deserialize(serialize(x)) === x
 */

export interface SerializedErrorState {
  message: string;
  componentStack: string | null;
  timestamp: number;
}

/**
 * Serialize an error state object to a JSON string.
 */
export function serializeErrorState(state: SerializedErrorState): string {
  return JSON.stringify({
    message: state.message,
    componentStack: state.componentStack,
    timestamp: state.timestamp,
  });
}

/**
 * Deserialize a JSON string back into a SerializedErrorState object.
 * Throws if the JSON is invalid or missing required fields.
 */
export function deserializeErrorState(json: string): SerializedErrorState {
  const parsed = JSON.parse(json);

  if (typeof parsed.message !== 'string') {
    throw new Error('Invalid error state: message must be a string');
  }
  if (parsed.componentStack !== null && typeof parsed.componentStack !== 'string') {
    throw new Error('Invalid error state: componentStack must be string or null');
  }
  if (typeof parsed.timestamp !== 'number') {
    throw new Error('Invalid error state: timestamp must be a number');
  }

  return {
    message: parsed.message,
    componentStack: parsed.componentStack,
    timestamp: parsed.timestamp,
  };
}
