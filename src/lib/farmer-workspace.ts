import type { Farmer, OwnerCrop, OwnerAudit } from "./owner-admin";
export type FarmReport = {
  id: string;
  version: string;
  crop: string;
  cropId: string;
  plantId: string;
  plantName: string;
  disease: string;
  severity: string;
  status: string;
  createdAt: string | null;
  image: string;
  description: string;
  symptoms: string;
  age: string;
  careNotes: string;
  progress: string;
  severityScore: number | null;
  severityExplanation: string;
  plan: {
    timeline: string;
    totalCost: number;
    steps: {
      title: string;
      description: string;
      timing: string;
      materials: string[];
      cost: number;
      safetyNotes: string;
    }[];
    preventionTips: string[];
  } | null;
  protectionPlan: {
    duration: string;
    phases: { week: number; title: string; tasks: string[] }[];
    recommendations: string[];
  } | null;
  history: {
    action: string;
    changedAt: string;
    previousData?: Record<string, string | number>;
    newData?: Record<string, string | number>;
  }[];
};
export type FarmPlant = {
  id: string;
  version: string;
  cropId: string;
  name: string;
  code: string;
  age: string;
  notes: string;
  image: string;
  recordCount: number;
  latestDisease: string;
  createdAt: string | null;
  updatedAt: string | null;
  deleting: boolean;
};
export type FarmActivity = {
  id: string;
  title: string;
  date: string | null;
  detail: string;
};
export type FarmWorkspace = {
  uid: string;
  name: string;
  city: string;
  crops: OwnerCrop[];
  reports: FarmReport[];
  cropCount: number;
  plantCount: number;
  reportCount: number;
  hasMoreCrops: boolean;
  hasMoreReports: boolean;
  activity: FarmActivity[];
  ownerActivity: OwnerAudit[];
  farmer?: Farmer;
  profileVersion?: string;
  sharing: boolean;
  preferences?: {
    language: string;
    crops: string[];
    weatherAlerts: boolean;
    priceUpdates: boolean;
    treatmentReminders: boolean;
  };
};
export type FarmRecord = {
  id: string;
  version: string;
  title: string;
  values: Record<string, string | number | boolean | string[]>;
  createdAt: string | null;
};
export type FarmResource =
  | "fields"
  | "marketplace"
  | "contacts"
  | "ratings"
  | "notifications"
  | "logs";
export type WorkspaceApi = <T>(query?: string, action?: object) => Promise<T>;
