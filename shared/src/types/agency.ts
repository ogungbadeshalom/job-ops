export const TENANT_MEMBER_ROLES = [
  "owner",
  "member",
  "admin",
  "worker",
  "client",
] as const;

export type TenantMemberRole = (typeof TENANT_MEMBER_ROLES)[number];

export const CLIENT_STATUSES = ["active", "inactive", "archived"] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const ASSIGNMENT_STATUSES = ["active", "inactive"] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export interface ClientProfile {
  searchTerms: string[];
  workplaceTypes: string[];
  searchCities: string[];
  enableTailoring: boolean;
}

export interface Client {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  notes: string | null;
  status: ClientStatus;
  resumePdfPath: string | null;
  resumeText: string | null;
  searchTerms: string;
  workplaceTypes: string;
  searchCities: string;
  enableTailoring: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  hasLogin?: boolean;
  clientUserId?: string | null;
}

export interface WorkerClientAssignment {
  id: string;
  workerId: string;
  clientId: string;
  tenantId: string;
  status: AssignmentStatus;
  createdAt: string;
  updatedAt: string;
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
  status?: ClientStatus;
}

export interface CreateAssignmentInput {
  workerId: string;
  clientId: string;
}
