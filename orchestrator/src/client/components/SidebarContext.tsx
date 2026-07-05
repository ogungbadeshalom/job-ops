import type React from "react";
import { createContext, useContext, useState } from "react";

interface SidebarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  open: false,
  setOpen: () => {},
  toggle: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((prev) => !prev);
  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
};
