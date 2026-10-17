import type { JSX } from 'preact';
import type { Route } from '../../app/nav';

/** 其余界面的注册表（按路由名查找） */
export const SCREENS: Partial<Record<Route['name'], (r: Route) => JSX.Element>> = {};
