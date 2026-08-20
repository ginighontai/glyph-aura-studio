/**
 * Minimal stand-in declarations for react / react-dom, used only by
 * tools/offline-typecheck/tsconfig.json. See the README in this folder.
 */

declare namespace GlyphAuraJSX {
  interface Element {
    readonly __brand: unique symbol;
  }
  interface ElementClass {
    render(): unknown;
  }
  interface ElementAttributesProperty {
    props: unknown;
  }
  interface ElementChildrenAttribute {
    children: unknown;
  }
  interface IntrinsicAttributes {
    key?: string | number | null;
  }
  interface IntrinsicElements {
    // The real @types/react provides precise per-element props (and therefore
    // contextual types for event handlers). Loosening this here keeps the stub
    // small; prop-level mistakes are caught by the real `npm run typecheck`.
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    [tag: string]: any;
  }
}

declare module 'react' {
  export type Key = string | number;
  export type ReactNode =
    | GlyphAuraJSX.Element
    | string
    | number
    | boolean
    | null
    | undefined
    | Iterable<ReactNode>;

  export interface CSSProperties {
    [property: string]: string | number | undefined;
  }

  export type PropsWithChildren<P = unknown> = P & { children?: ReactNode };
  export type FC<P = Record<string, never>> = (props: PropsWithChildren<P>) => GlyphAuraJSX.Element | null;

  export interface RefObject<T> {
    readonly current: T | null;
  }
  export interface MutableRefObject<T> {
    current: T;
  }

  export type SetStateAction<S> = S | ((previous: S) => S);
  export type Dispatch<A> = (value: A) => void;

  export interface SyntheticEvent<T = Element> {
    currentTarget: T;
    target: EventTarget & T;
    preventDefault(): void;
    stopPropagation(): void;
  }
  export interface ChangeEvent<T = Element> extends SyntheticEvent<T> {}
  export interface FormEvent<T = Element> extends SyntheticEvent<T> {}
  export interface MouseEvent<T = Element> extends SyntheticEvent<T> {
    clientX: number;
    clientY: number;
  }
  export interface KeyboardEvent<T = Element> extends SyntheticEvent<T> {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
  }
  export interface DragEvent<T = Element> extends SyntheticEvent<T> {
    dataTransfer: DataTransfer | null;
  }
  export interface ClipboardEvent<T = Element> extends SyntheticEvent<T> {}

  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: readonly unknown[]): T;
  export function useRef<T>(initial: T): MutableRefObject<T>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
  export function useReducer<S, A>(
    reducer: (state: S, action: A) => S,
    initial: S,
  ): [S, Dispatch<A>];
  export function useReducer<S, A, I>(
    reducer: (state: S, action: A) => S,
    initialArg: I,
    init: (arg: I) => S,
  ): [S, Dispatch<A>];
  export function useId(): string;
  export function useContext<T>(context: Context<T>): T;

  export interface Provider<T> {
    (props: { value: T; children?: ReactNode }): GlyphAuraJSX.Element | null;
  }
  export interface Context<T> {
    Provider: Provider<T>;
    displayName?: string;
  }
  export function createContext<T>(defaultValue: T): Context<T>;

  export function memo<P>(component: (props: P) => GlyphAuraJSX.Element | null): (props: P) => GlyphAuraJSX.Element | null;
  export const Fragment: (props: { children?: ReactNode }) => GlyphAuraJSX.Element | null;
  export const StrictMode: (props: { children?: ReactNode }) => GlyphAuraJSX.Element | null;

  export namespace JSX {
    export type Element = GlyphAuraJSX.Element;
    export type IntrinsicElements = GlyphAuraJSX.IntrinsicElements;
  }

  const React: {
    Fragment: typeof Fragment;
    StrictMode: typeof StrictMode;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    createElement(type: unknown, props?: unknown, ...children: unknown[]): GlyphAuraJSX.Element;
  };
  export default React;
}

declare module 'react/jsx-runtime' {
  export namespace JSX {
    export type Element = GlyphAuraJSX.Element;
    export type ElementClass = GlyphAuraJSX.ElementClass;
    export type ElementAttributesProperty = GlyphAuraJSX.ElementAttributesProperty;
    export type ElementChildrenAttribute = GlyphAuraJSX.ElementChildrenAttribute;
    export type IntrinsicAttributes = GlyphAuraJSX.IntrinsicAttributes;
    export type IntrinsicElements = GlyphAuraJSX.IntrinsicElements;
  }
  export const Fragment: unique symbol;
  export function jsx(type: unknown, props: unknown, key?: unknown): JSX.Element;
  export function jsxs(type: unknown, props: unknown, key?: unknown): JSX.Element;
  export function jsxDEV(type: unknown, props: unknown, key?: unknown): JSX.Element;
}

declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  export interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}

declare module '*.css' {
  const content: string;
  export default content;
}
