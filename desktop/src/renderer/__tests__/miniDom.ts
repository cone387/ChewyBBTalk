/**
 * Minimal in-repo DOM shim so renderer components can run under vitest's node
 * environment with the real react-dom client renderer. No jsdom dependency.
 *
 * It implements just enough of the DOM surface for react-dom 18 (element
 * creation, tree mutation, attributes, delegated events on the root container)
 * plus the browser globals our components touch (window listeners, rAF,
 * getComputedStyle, ResizeObserver, localStorage, navigator).
 */

export type FakeEventInit = Record<string, unknown> & { type: string; bubbles?: boolean };

export interface FakeNativeEvent {
  type: string;
  target: FakeNode | null;
  srcElement: FakeNode | null;
  currentTarget: FakeNode | null;
  defaultPrevented: boolean;
  propagationStopped: boolean;
  bubbles: boolean;
  timeStamp: number;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
  [key: string]: unknown;
}

type Listener = (event: FakeNativeEvent) => void;
interface ListenerSet { capture: Listener[]; bubble: Listener[] }

export class FakeNode {
  nodeType = 0;
  parentNode: FakeNode | null = null;
  ownerDocument: FakeDocument;
  children: FakeNode[] = [];
  constructor(ownerDocument: FakeDocument) { this.ownerDocument = ownerDocument; }
  get childNodes() { return this.children.slice(); }
  get firstChild() { return this.children[0] ?? null; }
  get lastChild() { return this.children[this.children.length - 1] ?? null; }
  get nextSibling(): FakeNode | null {
    const siblings = this.parentNode?.children;
    if (!siblings) return null;
    const index = siblings.indexOf(this);
    return siblings[index + 1] ?? null;
  }
  appendChild(child: FakeNode) { return this.insertBefore(child, null); }
  insertBefore(child: FakeNode, ref: FakeNode | null) {
    if (child.parentNode) {
      const siblings = child.parentNode.children;
      const at = siblings.indexOf(child);
      if (at >= 0) siblings.splice(at, 1);
    }
    const at = ref ? this.children.indexOf(ref) : -1;
    if (at >= 0) this.children.splice(at, 0, child); else this.children.push(child);
    child.parentNode = this;
    return child;
  }
  removeChild(child: FakeNode) {
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
    child.parentNode = null;
    return child;
  }
  contains(node: FakeNode | null): boolean {
    for (let cur: FakeNode | null = node; cur; cur = cur.parentNode) if (cur === this) return true;
    return false;
  }
}

/** Match a single compound clause: `tag.class[attr=value]` (no combinators). */
function matchesClause(el: FakeElement, clause: string): boolean {
  let rest = clause;
  let tag: string | null = null;
  let id: string | null = null;
  const classes: string[] = [];
  const attrs: Array<{ name: string; value?: string }> = [];
  const tagMatch = /^[-\w]+/.exec(rest);
  if (tagMatch) { tag = tagMatch[0]; rest = rest.slice(tag.length); }
  const tokenRe = /\.([-\w]+)|#([-\w]+)|\[([-\w]+)(?:=([^\]]*))?\]/y;
  while (rest.length) {
    tokenRe.lastIndex = 0;
    const m = tokenRe.exec(rest);
    if (!m) return false; // unsupported syntax -> no match
    rest = rest.slice(m[0].length);
    if (m[1]) classes.push(m[1]);
    else if (m[2]) id = m[2];
    else attrs.push({ name: m[3], value: m[4] });
  }
  if (!tag && !id && !classes.length && !attrs.length) return false;
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  if (id && el.attributes.get('id') !== id) return false;
  for (const name of classes) if (!el.classList.contains(name)) return false;
  for (const attr of attrs) {
    if (attr.value !== undefined) {
      if (el.attributes.get(attr.name) !== attr.value) return false;
    } else if (!el.attributes.has(attr.name)) return false;
  }
  return true;
}

/** Match a selector group, including descendant combinators (`a b c`). */
function matchesGroup(el: FakeElement, group: string): boolean {
  // Split on whitespace that is not inside an attribute selector's brackets.
  const parts = group.split(/\s+(?![^[]*\])/).filter(Boolean);
  if (!parts.length) return false;
  if (parts.length === 1) return matchesClause(el, parts[0]);
  if (!matchesClause(el, parts[parts.length - 1])) return false;
  const ancestorsMatch = (node: FakeNode | null, prefix: string[]): boolean => {
    if (!prefix.length) return true;
    for (let cur: FakeNode | null = node; cur; cur = cur.parentNode) {
      if (cur instanceof FakeElement && matchesClause(cur, prefix[prefix.length - 1])
        && ancestorsMatch(cur.parentNode, prefix.slice(0, -1))) return true;
    }
    return false;
  };
  return ancestorsMatch(el.parentNode, parts.slice(0, -1));
}

export class ListenerTarget {
  private listeners = new Map<string, ListenerSet>();
  addEventListener(type: string, listener: Listener, capture = false) {
    const set = this.listeners.get(type) || { capture: [], bubble: [] };
    (capture ? set.capture : set.bubble).push(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type);
    if (!set) return;
    set.capture = set.capture.filter(fn => fn !== listener);
    set.bubble = set.bubble.filter(fn => fn !== listener);
  }
  listenersFor(type: string, capture: boolean): Listener[] {
    return this.listeners.get(type) ? (capture ? this.listeners.get(type)!.capture : this.listeners.get(type)!.bubble) : [];
  }
  removeAll() { this.listeners.clear(); }
}

export class FakeElement extends FakeNode {
  override nodeType = 1;
  tagName: string;
  attributes = new Map<string, string>();
  override children: FakeNode[] = [];
  style: Record<string, string> = { setProperty() {} } as unknown as Record<string, string>;
  private classes = new Set<string>();
  events = new ListenerTarget();
  [key: string]: any;

  constructor(ownerDocument: FakeDocument, tag: string) { super(ownerDocument); this.tagName = tag.toUpperCase(); if (this.tagName === 'INPUT') this.type = 'text'; }

  get nodeName() { return this.tagName; }

  get classList() {
    const self = this;
    return {
      add: (...names: string[]) => names.forEach(name => self.classes.add(name)),
      remove: (...names: string[]) => names.forEach(name => self.classes.delete(name)),
      contains: (name: string) => self.classes.has(name),
      toggle: (name: string) => (self.classes.has(name) ? self.classes.delete(name) : self.classes.add(name)),
    };
  }
  get className() { return [...this.classes].join(' '); }
  set className(value: string) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }

  get textContent(): string {
    let out = '';
    for (const child of this.children) {
      if (child instanceof FakeText || child instanceof FakeCommentNode) out += child.nodeValue;
      else if (child instanceof FakeElement) out += child.textContent;
    }
    return out;
  }
  set textContent(value: string) {
    for (const child of this.children.slice()) this.removeChild(child);
    if (value !== '') this.appendChild(new FakeText(this.ownerDocument, String(value)));
  }

  setAttribute(name: string, value: unknown) {
    this.attributes.set(name, String(value));
    if (name === 'class') this.className = String(value);
    if (name === 'value') this.value = String(value);
    if (name === 'disabled') this.disabled = value != null && value !== false;
    if (name === 'checked') this.checked = value != null && value !== false;
    if (name === 'type') this.type = String(value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name === 'disabled') this.disabled = false;
    if (name === 'checked') this.checked = false;
  }

  addEventListener(type: string, listener: Listener, capture = false) { this.events.addEventListener(type, listener, capture); }
  removeEventListener(type: string, listener: Listener) { this.events.removeEventListener(type, listener); }
  listenersFor(type: string, capture: boolean) { return this.events.listenersFor(type, capture); }

  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null; }
  setSelectionRange(_start: number, _end: number) { /* tracked via selectionStart/End fields */ }
  selectionStart = 0;
  selectionEnd = 0;
  scrollHeight = 0;
  scrollWidth = 0;
  scrollTop = 0;
  files: unknown[] | null = null;

  matches(selector: string) {
    return selector.split(',').map(s => s.trim()).some(clause => matchesGroup(this, clause));
  }
  closest(selector: string): FakeElement | null {
    for (let node: FakeNode | null = this; node; node = node.parentNode) {
      if (node instanceof FakeElement && node.matches(selector)) return node;
    }
    return null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const clauses = selector.split(',').map(s => s.trim()).filter(Boolean);
    const found: FakeElement[] = [];
    const visit = (node: FakeNode) => {
      for (const child of node.children) {
        if (child instanceof FakeElement) {
          if (clauses.some(clause => matchesGroup(child, clause))) found.push(child);
          visit(child);
        }
      }
    };
    visit(this);
    return found;
  }
  click() { this.ownerDocument.defaultView!.dom.dispatch(this, { type: 'click' }); }
}

export class FakeText extends FakeNode {
  override nodeType = 3;
  constructor(ownerDocument: FakeDocument, public nodeValue: string) { super(ownerDocument); }
}

export class FakeCommentNode extends FakeNode {
  override nodeType = 8;
  constructor(ownerDocument: FakeDocument, public nodeValue: string) { super(ownerDocument); }
}

class FakeStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

export class FakeDocument extends FakeNode {
  override nodeType = 9;
  body: FakeElement;
  activeElement: FakeElement | null = null;
  documentMode: number | undefined = undefined;
  /** Present so react-dom's isEventSupported('input') takes the standards path. */
  oninput: null = null;
  defaultView: FakeWindow | null = null;
  events = new ListenerTarget();
  constructor() { super(null as unknown as FakeDocument); this.ownerDocument = this; this.body = this.createElement('body'); }
  addEventListener(type: string, listener: Listener, capture = false) { this.events.addEventListener(type, listener, capture); }
  removeEventListener(type: string, listener: Listener) { this.events.removeEventListener(type, listener); }
  listenersFor(type: string, capture: boolean) { return this.events.listenersFor(type, capture); }
  querySelectorAll(selector: string): FakeElement[] { return this.body.querySelectorAll(selector); }
  getElementById(id: string): FakeElement | null {
    const visit = (node: FakeNode): FakeElement | null => {
      for (const child of node.children) {
        if (child instanceof FakeElement && child.attributes.get('id') === id) return child;
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(this.body);
  }
  createElement(tag: string) { return new FakeElement(this, tag); }
  createElementNS(_ns: string, tag: string) { const el = new FakeElement(this, tag); el.namespaceURI = 'http://www.w3.org/2000/svg'; return el; }
  createTextNode(value: string) { return new FakeText(this, value); }
  createComment(value: string) { return new FakeCommentNode(this, value); }
}

export class FakeWindow {
  document: FakeDocument;
  events = new ListenerTarget();
  localStorage = new FakeStorage();
  private rafQueue = new Map<number, () => void>();
  private rafNext = 1;
  setTimeout = (fn: () => void, ms?: number) => setTimeout(fn, ms);
  clearTimeout = (id: number) => clearTimeout(id);
  getComputedStyle = () => ({ position: 'static', getPropertyValue: () => '' });
  getSelection = () => ({ anchorNode: null, focusNode: null, rangeCount: 0, getRangeAt: () => { throw new Error('no range'); } });
  location = { protocol: 'http:', href: 'http://localhost/', origin: 'http://localhost' };
  top: FakeWindow = this;
  self: FakeWindow = this;
  /** Interface stubs so react-dom's instanceof checks have a right-hand side. */
  HTMLIFrameElement = class FakeHTMLIFrameElement {};
  HTMLElement = FakeElement;
  Element = FakeElement;
  Node = FakeNode;
  dom!: MiniDom;
  constructor(document: FakeDocument) { this.document = document; document.defaultView = this; }
  addEventListener(type: string, listener: Listener, capture = false) { this.events.addEventListener(type, listener, capture); }
  removeEventListener(type: string, listener: Listener) { this.events.removeEventListener(type, listener); }
  listenersFor(type: string, capture: boolean) { return this.events.listenersFor(type, capture); }
  requestAnimationFrame(callback: () => void) { const id = this.rafNext++; this.rafQueue.set(id, callback); return id; }
  cancelAnimationFrame(id: number) { this.rafQueue.delete(id); }
  runAnimationFrames() { const pending = [...this.rafQueue.entries()]; this.rafQueue.clear(); pending.forEach(([, cb]) => cb()); }
  clearAnimationFrames() { this.rafQueue.clear(); }
}

export class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed = new Set<FakeElement>();
  constructor(public callback: (entries: Array<{ target: FakeElement }>) => void) { FakeResizeObserver.instances.push(this); }
  observe(target: FakeElement) { this.observed.add(target); }
  unobserve(target: FakeElement) { this.observed.delete(target); }
  disconnect() { this.observed.clear(); }
  trigger() { if (this.observed.size) this.callback([...this.observed].map(target => ({ target }))); }
}

export class MiniDom {
  readonly window: FakeWindow;
  readonly document: FakeDocument;
  private savedGlobals: Array<[Record<string, unknown>, string, PropertyDescriptor | undefined]> = [];

  constructor() {
    this.document = new FakeDocument();
    this.window = new FakeWindow(this.document);
    this.window.dom = this;
    this.defineGlobal('window', this.window);
    this.defineGlobal('document', this.document);
    this.defineGlobal('localStorage', this.window.localStorage);
    this.defineGlobal('ResizeObserver', FakeResizeObserver);
    this.defineGlobal('requestAnimationFrame', (cb: () => void) => this.window.requestAnimationFrame(cb));
    this.defineGlobal('cancelAnimationFrame', (id: number) => this.window.cancelAnimationFrame(id));
    this.defineGlobal('getComputedStyle', this.window.getComputedStyle);
    this.defineGlobal('navigator', { platform: 'Win32', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' });
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    try {
      (URL as any).createObjectURL = (URL as any).createObjectURL || ((blob: unknown) => `blob:fake-${String(typeof blob)}`);
      (URL as any).revokeObjectURL = (URL as any).revokeObjectURL || (() => {});
    } catch { /* already patched */ }
  }

  private defineGlobal(key: string, value: unknown) {
    const holder = globalThis as Record<string, unknown>;
    const previous = Object.getOwnPropertyDescriptor(holder, key);
    this.savedGlobals.push([holder, key, previous]);
    try {
      holder[key] = value;
    } catch {
      Object.defineProperty(holder, key, { value, writable: true, configurable: true });
    }
  }

  restore() {
    for (const [holder, key, previous] of this.savedGlobals) {
      const target = holder as Record<string, unknown>;
      if (previous) Object.defineProperty(target, key, previous);
      else delete target[key];
    }
    this.savedGlobals = [];
    FakeResizeObserver.instances.length = 0;
  }

  /** Remove every window listener and clear the body between tests. */
  reset() {
    for (const child of this.document.body.children.slice()) this.document.body.removeChild(child);
    this.window.events.removeAll();
    this.document.events.removeAll();
    this.window.localStorage.clear();
    this.window.clearAnimationFrames();
    FakeResizeObserver.instances.length = 0;
    this.document.activeElement = null;
  }

  /** Dispatch a synthetic native event that propagates to the react root container. */
  dispatch(target: FakeNode, init: FakeEventInit) {
    const chain: FakeNode[] = [];
    for (let node: FakeNode | null = target; node; node = node.parentNode) chain.push(node);
    const event: FakeNativeEvent = {
      target,
      srcElement: target,
      currentTarget: target,
      bubbles: init.bubbles !== false,
      defaultPrevented: false,
      propagationStopped: false,
      timeStamp: Date.now(),
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() { this.propagationStopped = true; },
      ...init,
    };
    event.type = init.type;
    for (let i = chain.length - 1; i >= 1 && !event.propagationStopped; i--) this.runListeners(chain[i], event, true);
    for (let i = 0; i < chain.length && !event.propagationStopped; i++) {
      if (!event.bubbles && i > 0) break;
      this.runListeners(chain[i], event, false);
    }
    return event;
  }

  private runListeners(node: FakeNode, event: FakeNativeEvent, capture: boolean) {
    const target = node instanceof FakeElement || node instanceof FakeDocument ? node : null;
    if (!target) return;
    for (const listener of target.listenersFor(event.type, capture).slice()) {
      event.currentTarget = node;
      listener(event);
      if (event.propagationStopped) return;
    }
  }

  /** Fire a raw listener registered on window (outside react's delegation). */
  fireWindow(type: string, init: Record<string, unknown> = {}) {
    const event: FakeNativeEvent = {
      type,
      target: null,
      srcElement: null,
      currentTarget: this.window as unknown as FakeNode,
      bubbles: true,
      defaultPrevented: false,
      propagationStopped: false,
      timeStamp: Date.now(),
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() { this.propagationStopped = true; },
      ...init,
    };
    for (const listener of this.window.listenersFor(type, true)) listener(event);
    for (const listener of this.window.listenersFor(type, false)) listener(event);
    return event;
  }

  triggerResizeObservers() { FakeResizeObserver.instances.forEach(observer => observer.trigger()); }
}

/** Install the mini DOM as browser globals and return its control handle. */
export function installMiniDom(): MiniDom { return new MiniDom(); }
