import { createContext, useContext } from "react";

export type ClientNameMap = Map<string, string>;

export const ClientNameContext = createContext<ClientNameMap | null>(null);

export function useClientNameMap(): ClientNameMap | null {
  return useContext(ClientNameContext);
}
