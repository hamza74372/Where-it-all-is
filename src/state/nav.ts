import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

/** 'partner' only exists while a partner's share is held. */
export type Tab = 'today' | 'log' | 'bills' | 'plan' | 'more' | 'partner';

export const NavContext = createContext<(tab: Tab) => void>(() => {});

export const useNav = () => useContext(NavContext);
