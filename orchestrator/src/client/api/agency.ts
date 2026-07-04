import type { AuthUser } from "./auth";
import type { Client } from "@shared/types";
import { fetchApi } from "./core";

export interface ClientWithAssignment extends Client {
  assignedWorkerId: string | null;
  assignedWorkerName: string | null;
}

export interface ClientStats {
  total: number;
  applied: number;
  interviewing: number;
  offer: number;
}

interface ClientsListResponse {
  clients: ClientWithAssignment[];
}

export interface ClientDetailResponse {
  client: ClientWithAssignment;
  stats: ClientStats;
}

interface ClientStatsResponse {
  stats: ClientStats;
}

export interface Assignment {
  id: string;
  workerId: string;
  clientId: string;
  tenantId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  workerName: string | null;
  clientName: string | null;
  clientStatus: string | null;
}

export interface CreateClientInput {
  name: string;
  email: string;
  notes?: string;
  searchTerms?: string[];
  workplaceTypes?: string[];
  searchCities?: string[];
  enableTailoring?: boolean;
}

export interface UpdateClientInput {
  name?: string;
  email?: string;
  notes?: string;
  searchTerms?: string[];
  workplaceTypes?: string[];
  searchCities?: string[];
  enableTailoring?: boolean;
  status?: "active" | "inactive" | "archived";
}

export async function fetchMyClients(): Promise<ClientWithAssignment[]> {
  const response = await fetchApi<ClientsListResponse>("/clients");
  return response.clients;
}

export async function fetchClients(): Promise<ClientWithAssignment[]> {
  const response = await fetchApi<ClientsListResponse>("/clients");
  return response.clients;
}

export async function fetchClient(id: string): Promise<ClientDetailResponse> {
  return fetchApi<ClientDetailResponse>(`/clients/${id}`);
}

export async function fetchClientStats(id: string): Promise<ClientStats> {
  const response = await fetchApi<ClientStatsResponse>(`/clients/${id}/stats`);
  return response.stats;
}

export async function createClient(
  data: CreateClientInput,
): Promise<ClientWithAssignment> {
  const result = await fetchApi<{ client: ClientWithAssignment }>("/clients", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return result.client;
}

export async function updateClient(
  id: string,
  data: UpdateClientInput,
): Promise<ClientWithAssignment> {
  const result = await fetchApi<{ client: ClientWithAssignment }>(
    `/clients/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );
  return result.client;
}

export async function deleteClient(id: string): Promise<void> {
  await fetchApi<{ deleted: boolean }>(
    `/clients/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function fetchAssignments(): Promise<Assignment[]> {
  const result = await fetchApi<{ assignments: Assignment[] }>("/assignments");
  return result.assignments;
}

export async function fetchClientAssignments(
  clientId: string,
): Promise<Assignment[]> {
  const result = await fetchApi<{ assignments: Assignment[] }>(
    `/assignments?clientId=${encodeURIComponent(clientId)}`,
  );
  return result.assignments;
}

export async function assignWorker(
  workerId: string,
  clientId: string,
): Promise<Assignment> {
  const result = await fetchApi<{ assignment: Assignment }>("/assignments", {
    method: "POST",
    body: JSON.stringify({ workerId, clientId }),
  });
  return result.assignment;
}

export async function removeAssignment(id: string): Promise<void> {
  await fetchApi<{ deleted: boolean }>(
    `/assignments/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function fetchUsers(): Promise<AuthUser[]> {
  const result = await fetchApi<{ users: AuthUser[] }>("/workspaces/users");
  return result.users;
}

export async function runPipelineForClient(
  clientId: string,
): Promise<{ message: string }> {
  return fetchApi<{ message: string }>("/pipeline/run", {
    method: "POST",
    body: JSON.stringify({ clientId }),
  });
}

export async function createClientLogin(
  clientId: string,
): Promise<{ username: string; password: string }> {
  const result = await fetchApi<{ username: string; password: string }>(
    `/clients/${encodeURIComponent(clientId)}/create-login`,
    { method: "POST" },
  );
  return result;
}
