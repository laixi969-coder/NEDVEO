import { jsxDEV as reactJsxDEV, Fragment } from 'react/jsx-dev-runtime';
import { Native } from './jsx-runtime';

export type { JSX } from 'react/jsx-dev-runtime';
export { Fragment };

// Vite uses jsxDEV during development; production uses jsx/jsxs. Both must
// share localization, source-text preservation, and canonical option values.
export function jsxDEV(
  type: any,
  props: any,
  key: any,
  isStaticChildren: boolean,
  source: any,
  self: any,
) {
  return typeof type === 'string'
    ? reactJsxDEV(Native, { tag: type, raw: props }, key, false, source, self)
    : reactJsxDEV(type, props, key, isStaticChildren, source, self);
}
