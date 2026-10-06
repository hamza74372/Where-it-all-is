import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

export type Tab = 'today' | 'log' | 'bills' | 'plan' | 'more';

export const NavContext = createContext<(tab: Tab) => void>(() => {});

export const useNav = () => useContext(NavContext);
