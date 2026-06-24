import { createContext, useContext } from 'react';

interface HelpContextValue {
  isOpen: boolean;
  toggle: () => void;
  close:  () => void;
}

export const HelpContext = createContext<HelpContextValue>({
  isOpen: false,
  toggle: () => {},
  close:  () => {},
});

export const useHelp = () => useContext(HelpContext);
