import { z } from 'zod';

export const OWNER_EMAIL = 'admin.agriguard@gmail.com';
export const PRESENCE_WINDOW_MS = 120_000;
export function hasOwnerRole(claims: { owner?: unknown; admin?: unknown; email?: unknown }) {
  return claims.owner === true && claims.admin === true && typeof claims.email === 'string' && claims.email.toLowerCase() === OWNER_EMAIL;
}
export function isRecentlyActive(lastSeenAt: string | null, now = Date.now()) {
  const time = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  return Number.isFinite(time) && time <= now && now - time < PRESENCE_WINDOW_MS;
}
const id = z.string().min(1).max(128).refine(value => !/[\/\u0000-\u001f]/.test(value) && value !== '.' && value !== '..', 'Invalid record identifier.');
const shortText = (max: number, min = 0) => z.string().trim().min(min).max(max).refine(value => !/[\u0000-\u001f]/.test(value), 'Invalid text.');
const version = z.string().min(1).max(80);
const target = { uid: id };
export const ownerActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('profile.update'), ...target, version, name: shortText(80, 1), location: shortText(160) }).strict(),
  z.object({ action: z.literal('crop.update'), ...target, cropId: id, version, name: shortText(64, 1), notes: z.string().trim().max(1500) }).strict(),
  z.object({ action: z.literal('crop.delete'), ...target, cropId: id, version, confirmation: shortText(64, 1) }).strict(),
  z.object({ action: z.literal('account.suspend'), ...target }).strict(),
  z.object({ action: z.literal('account.restore'), ...target }).strict(),
  z.object({ action: z.literal('account.delete'), ...target, confirmation: z.string().max(254) }).strict(),
]);
export const ownerIdSchema = id;
export type OwnerAction = z.infer<typeof ownerActionSchema>;
export type Farmer = {
  uid: string; name: string; email: string; phone: string; location: string;
  createdAt: string | null; lastSignInAt: string | null; lastSeenAt: string | null;
  online: boolean; disabled: boolean; protected: boolean; cropCount: number; reportCount: number;
};
export type OwnerAudit = { id: string; action: string; targetName: string; targetUid: string; resourceName?: string; status: string; createdAt: string; };
export type OwnerOverview = {
  farmers: Farmer[]; total: number; page: number; pageSize: number;
  stats: { farmers: number; online: number; crops: number; reports: number };
  activity: OwnerAudit[];
};
export type OwnerCrop = { id: string; name: string; notes: string; plantCount: number; createdAt: string | null; updatedAt: string | null; version: string; deleting: boolean; };
export type OwnerReport = { id: string; crop: string; disease: string; severity: string; status: string; createdAt: string | null; plantName: string; };
export type FarmerDetail = { farmer: Farmer; profileVersion: string; crops: OwnerCrop[]; reports: OwnerReport[]; activity: OwnerAudit[]; hasMoreCrops: boolean; hasMoreReports: boolean; };
