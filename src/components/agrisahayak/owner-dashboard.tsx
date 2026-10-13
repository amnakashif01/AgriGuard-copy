'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, ArrowLeft, ArrowRight, Check, FileText, Loader2, MapPin, RefreshCw, Search, ShieldCheck, Sprout, Users, Wifi, X } from 'lucide-react';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OWNER_EMAIL, type FarmerDetail, type OwnerAction, type OwnerAudit, type OwnerCrop, type OwnerOverview } from '@/lib/owner-admin';

type Editor = { kind: 'profile'; name: string; location: string } | { kind: 'crop'; crop: OwnerCrop; name: string; notes: string };
type Confirmation = { action: 'crop.delete'; crop: OwnerCrop } | { action: 'account.delete' | 'account.suspend' | 'account.restore' };
type ReportDetail = { id: string; crop: string; disease: string; description: string; severity: string; status: string; image: string; createdAt: string | null; symptoms: string; plantName: string; plan: { steps?: { title: string; description: string; timing?: string }[]; preventionTips?: string[] } | null; history: { action?: string; changedAt?: string }[] };
const actionLabels: Record<string, string> = { 'profile.update': 'Farmer profile updated', 'crop.update': 'Crop record edited', 'crop.delete': 'Crop deleted', 'account.suspend': 'Account suspended', 'account.restore': 'Account restored', 'account.delete': 'Account deleted' };
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not available';
function lastActive(value: string | null) {
  if (!value) return 'Not recorded';
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} hours ago` : formatDate(value);
}
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0,2).map(word => word[0]).join('').toUpperCase();
function AuditList({ items }: { items: OwnerAudit[] }) {
  return items.length ? <ul className="divide-y divide-slate-100">{items.map(item => <li key={item.id} className="flex gap-3 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Activity size={16}/></span><div className="min-w-0"><p className="text-sm font-medium text-slate-800">{actionLabels[item.action] || item.action}<span className={`ml-2 text-xs ${item.status === 'failed' ? 'text-red-600' : 'text-slate-400'}`}>{item.status === 'success' ? '' : item.status}</span></p><p className="mt-1 truncate text-xs text-slate-500">{item.targetName} · {lastActive(item.createdAt)}</p></div></li>)}</ul> : <p className="py-6 text-sm text-slate-500">Owner actions will appear here when you manage a record.</p>;
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>; }

export default function OwnerDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<OwnerOverview | null>(null);
  const [detail, setDetail] = useState<FarmerDetail | null>(null);
  const [selectedUid, setSelectedUid] = useState('');
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'crops' | 'reports' | 'activity'>('crops');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmationText, setConfirmationText] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const overviewRequest = useRef(0);
  const detailRequest = useRef(0);
  const selectedRef = useRef(selectedUid);
  selectedRef.current = selectedUid;

  const api = useCallback(async <T,>(query = '', action?: OwnerAction): Promise<T> => {
    if (!user) throw new Error('Please sign in again.');
    const token = await user.getIdToken();
    const response = await fetch(`/api/owner${query}`, { method: action ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(action ? { 'Content-Type': 'application/json' } : {}) }, ...(action ? { body: JSON.stringify(action) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load this record.');
    return result;
  }, [user]);
  const loadOverview = useCallback(async (silent = false) => {
    const sequence = ++overviewRequest.current;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ search: searchTerm, page: String(page), filter });
      const result = await api<OwnerOverview>(`?${params}`);
      if (sequence !== overviewRequest.current) return;
      setOverview(result); setError('');
    } catch (failure) { if (sequence === overviewRequest.current) setError((failure as Error).message); }
    finally { if (sequence === overviewRequest.current) setLoading(false); }
  }, [api, searchTerm, page, filter]);
  const loadDetail = useCallback(async (uid: string) => {
    const sequence = ++detailRequest.current;
    setDetailLoading(true); setDetailError('');
    try {
      const result = await api<FarmerDetail>(`?uid=${encodeURIComponent(uid)}`);
      if (sequence === detailRequest.current && selectedRef.current === uid) setDetail(result);
    } catch (failure) { if (sequence === detailRequest.current) setDetailError((failure as Error).message); }
    finally { if (sequence === detailRequest.current) setDetailLoading(false); }
  }, [api]);
  useEffect(() => { const timer = setTimeout(() => { setSearchTerm(search); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { void loadOverview(); const timer = setInterval(() => { if (document.visibilityState === 'visible') void loadOverview(true); }, 60000); return () => { clearInterval(timer); overviewRequest.current++; }; }, [loadOverview]);
  useEffect(() => { setDetail(null); setEditor(null); setConfirmation(null); setReport(null); if (selectedUid) void loadDetail(selectedUid); else detailRequest.current++; }, [selectedUid, loadDetail]);

  async function mutate(action: OwnerAction) {
    if (busy) return;
    setBusy(true); setMutationError(''); setNotice('');
    try {
      await api('', action);
      setEditor(null); setConfirmation(null); setConfirmationText(''); setNotice(`${actionLabels[action.action]}.`);
      if (action.action === 'account.delete') { setSelectedUid(''); setDetail(null); }
      else await loadDetail(action.uid);
      await loadOverview(true);
    } catch (failure) { setMutationError((failure as Error).message); }
    finally { setBusy(false); }
  }
  function openConfirmation(value: Confirmation) { setMutationError(''); setConfirmationText(''); setConfirmation(value); }
  async function openReport(id: string) {
    const uid = selectedUid;
    setReportLoading(true); setDetailError('');
    try { const result = await api<ReportDetail>(`?uid=${encodeURIComponent(uid)}&report=${encodeURIComponent(id)}`); if (selectedRef.current === uid) setReport(result); }
    catch (failure) { if (selectedRef.current === uid) setDetailError((failure as Error).message); }
    finally { setReportLoading(false); }
  }
  async function loadMore(resource: 'crops' | 'reports') {
    if (!detail || moreLoading) return;
    const uid = detail.farmer.uid;
    const records = detail[resource];
    const cursor = records.at(-1)?.id;
    if (!cursor) return;
    setMoreLoading(true);
    try {
      const params = new URLSearchParams({ uid, resource, cursor });
      const result = await api<{ crops: FarmerDetail['crops']; reports: FarmerDetail['reports']; hasMore: boolean }>(`?${params}`);
      if (selectedRef.current === uid) setDetail(current => {
        if (!current || current.farmer.uid !== uid) return current;
        return resource === 'crops' ? { ...current, crops: [...current.crops, ...result.crops.filter(item => !current.crops.some(old => old.id === item.id))], hasMoreCrops: result.hasMore } : { ...current, reports: [...current.reports, ...result.reports.filter(item => !current.reports.some(old => old.id === item.id))], hasMoreReports: result.hasMore };
      });
    } catch (failure) { if (selectedRef.current === uid) setDetailError((failure as Error).message); }
    finally { setMoreLoading(false); }
  }
  const confirmValue = confirmation?.action === 'crop.delete' ? confirmation.crop.name : detail?.farmer.email || detail?.farmer.phone || detail?.farmer.uid || '';
  const destructive = confirmation?.action === 'account.delete' || confirmation?.action === 'crop.delete';
  const metrics = [
    { name: 'Registered accounts', value: overview?.stats.farmers, icon: Users },
    { name: 'Active now', value: overview?.stats.online, icon: Wifi },
    { name: 'Total crops', value: overview?.stats.crops, icon: Sprout },
    { name: 'Diagnosis reports', value: overview?.stats.reports, icon: FileText },
  ];

  return <div className="mx-auto max-w-[1600px] space-y-6 text-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-emerald-700">Administration</p><h1 className="text-3xl font-bold tracking-tight">Owner dashboard</h1><p className="mt-2 text-sm text-slate-500">Manage farmer accounts, crops and reports.</p></div><div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-white px-4 py-3"><ShieldCheck className="text-emerald-700" size={24}/><div><p className="text-sm font-semibold">Website owner</p><p className="text-xs text-slate-500">{OWNER_EMAIL}</p></div></div></div>
    {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><Check size={16}/>{notice}<button aria-label="Dismiss notification" className="ml-auto" onClick={() => setNotice('')}><X size={16}/></button></div>}
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<Button variant="outline" size="sm" onClick={() => void loadOverview()}>Retry</Button></div>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map(metric => <Panel key={metric.name} className="flex items-center gap-3 !p-4"><span className="rounded-full bg-emerald-50 p-3 text-emerald-700"><metric.icon size={23}/></span><div><p className="text-xs text-slate-500">{metric.name}</p><p className="mt-1 text-3xl font-semibold tabular-nums">{metric.value ?? '—'}</p></div></Panel>)}</div>
    <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1.5fr)_minmax(350px,1fr)] xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,1fr)]">
      <div className="min-w-0 space-y-5"><Panel><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Farmers</h2><p className="mt-1 text-xs text-slate-500">Accounts and recent activity</p></div><Button size="sm" variant="outline" disabled={loading} onClick={() => { void loadOverview(); if (selectedUid) void loadDetail(selectedUid); }}><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/><span className="ml-2">Refresh</span></Button></div>
        <div className="mt-5 flex flex-wrap gap-2"><div className="relative min-w-[180px] flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><Input aria-label="Search farmers" className="pl-9" placeholder="Search by name, email or city" value={search} onChange={event => setSearch(event.target.value)}/></div><select aria-label="Filter accounts" className="rounded-lg border border-slate-200 bg-white px-3 text-sm" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="all">All accounts</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="rounded-l-lg p-3 font-medium">Farmer</th><th className="p-3 font-medium">Crops</th><th className="p-3 font-medium">Reports</th><th className="p-3 font-medium">Last active</th><th className="rounded-r-lg p-3 font-medium">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{overview?.farmers.map(farmer => <tr key={farmer.uid} className={selectedUid === farmer.uid ? 'bg-emerald-50' : ''}><td className="p-3"><div className="flex items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800">{initials(farmer.name)}</span><div className="min-w-[110px]"><p className="max-w-[180px] truncate font-semibold">{farmer.name}</p><p className="mt-1 max-w-[180px] truncate text-xs text-slate-500">{farmer.protected ? 'Owner account' : farmer.disabled ? 'Suspended' : farmer.location || farmer.email || farmer.phone}</p></div></div></td><td className="p-3">{farmer.cropCount}</td><td className="p-3">{farmer.reportCount}</td><td className="whitespace-nowrap p-3 text-xs">{farmer.online ? <span className="text-emerald-700">● Active now</span> : lastActive(farmer.lastSeenAt || farmer.lastSignInAt)}</td><td className="p-3"><Button size="sm" variant="outline" className="whitespace-nowrap border-emerald-200 text-emerald-800" onClick={() => { setSelectedUid(farmer.uid); setTab('crops'); }}>View record</Button></td></tr>)}</tbody></table></div>
        {!overview && loading && <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 size={18} className="animate-spin"/>Loading registered accounts…</p>}
        {overview && !overview.farmers.length && <p className="py-10 text-center text-sm text-slate-500">No farmers match this search.</p>}
        {overview && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><p>{overview.total ? `${(overview.page - 1) * overview.pageSize + 1}–${Math.min(overview.page * overview.pageSize, overview.total)}` : '0'} of {overview.total} accounts</p><div className="flex items-center gap-2"><Button aria-label="Previous page" size="icon" variant="outline" className="h-8 w-8" disabled={overview.page <= 1 || loading} onClick={() => setPage(overview.page - 1)}><ArrowLeft size={14}/></Button><span>Page {overview.page}</span><Button aria-label="Next page" size="icon" variant="outline" className="h-8 w-8" disabled={overview.page * overview.pageSize >= overview.total || loading} onClick={() => setPage(overview.page + 1)}><ArrowRight size={14}/></Button></div></div>}
        <p className="mt-4 text-[11px] text-slate-400">Active now means the account was active in the last 2 minutes.</p>
      </Panel><Panel><h2 className="flex items-center gap-2 text-base font-semibold"><Activity size={18}/>Recent admin activity</h2><AuditList items={overview?.activity || []}/></Panel></div>
      <Panel className="min-w-0"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Farmer record</h2>{selectedUid && <button aria-label="Close farmer record" onClick={() => setSelectedUid('')}><X size={19} className="text-slate-400"/></button>}</div>
        {!selectedUid && <div className="flex min-h-[380px] flex-col items-center justify-center text-center"><span className="mb-4 rounded-full bg-emerald-50 p-5 text-emerald-700"><Users size={32}/></span><h3 className="font-semibold">Choose a farmer</h3><p className="mt-2 max-w-[240px] text-sm leading-6 text-slate-500">Select View record to inspect their crops, diagnosis reports and account details.</p></div>}
        {detailLoading && <p role="status" className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 size={18} className="animate-spin"/>Loading farmer record…</p>}
        {detailError && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{detailError}</p>}
        {detail && <div className={detailLoading ? 'pointer-events-none opacity-60' : ''}><div className="mt-6 flex items-start gap-3"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl font-semibold text-emerald-800">{initials(detail.farmer.name)}</span><div className="min-w-0 flex-1"><h3 className="text-lg font-semibold">{detail.farmer.name}</h3><span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${detail.farmer.disabled ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{detail.farmer.protected ? 'Owner' : detail.farmer.disabled ? 'Suspended' : 'Active'}</span><p className="mt-2 break-all text-xs text-slate-500">{detail.farmer.email || detail.farmer.phone}</p><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12}/>{detail.farmer.location || 'Location not set'}</p><p className="mt-2 text-xs text-slate-500">Joined {formatDate(detail.farmer.createdAt)}</p></div></div><Button className="mt-4 bg-emerald-700 hover:bg-emerald-800" size="sm" onClick={() => { setMutationError(''); setEditor({ kind: 'profile', name: detail.farmer.name, location: detail.farmer.location }); }}>Edit profile</Button>
          <div role="group" aria-label="Farmer records" className="mt-6 flex border-b border-slate-200">{(['crops','reports','activity'] as const).map(value => <button key={value} aria-pressed={tab === value} className={`flex-1 border-b-2 py-3 text-sm capitalize ${tab === value ? 'border-emerald-700 font-semibold text-emerald-800' : 'border-transparent text-slate-500'}`} onClick={() => setTab(value)}>{value}{value === 'crops' ? ` (${detail.farmer.cropCount})` : value === 'reports' ? ` (${detail.farmer.reportCount})` : ''}</button>)}</div>
          <div aria-label={`${tab} records`} className="max-h-[460px] space-y-3 overflow-y-auto py-4">
            {tab === 'crops' && <>{!detail.crops.length && <p className="py-4 text-sm text-slate-500">This farmer has not added any crops yet.</p>}{detail.crops.map(crop => <div key={crop.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-3"><span className="rounded-lg bg-emerald-50 p-3 text-emerald-700"><Sprout size={24}/></span><div className="min-w-0 flex-1"><p className="font-semibold">{crop.name}</p><p className="mt-1 text-xs text-slate-500">{crop.plantCount} plants · Updated {formatDate(crop.updatedAt)}</p>{crop.notes && <p className="mt-2 text-xs text-slate-600">{crop.notes}</p>}{crop.deleting && <p className="mt-1 text-xs text-red-600">Deletion needs to be completed.</p>}</div></div><div className="mt-3 flex justify-end gap-2"><Button variant="outline" size="sm" disabled={crop.deleting} onClick={() => { setMutationError(''); setEditor({ kind: 'crop', crop, name: crop.name, notes: crop.notes }); }}>Edit</Button><Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => openConfirmation({ action: 'crop.delete', crop })}>Delete</Button></div></div>)}{detail.hasMoreCrops && <Button variant="outline" size="sm" disabled={moreLoading} onClick={() => void loadMore('crops')}>{moreLoading ? 'Loading…' : 'Load more crops'}</Button>}</>}
            {tab === 'reports' && <>{!detail.reports.length && <p className="py-4 text-sm text-slate-500">No diagnosis reports saved yet.</p>}{detail.reports.map(item => <button key={item.id} disabled={reportLoading} onClick={() => void openReport(item.id)} className="block w-full rounded-xl border border-slate-200 p-4 text-left hover:border-emerald-300 hover:bg-emerald-50/40"><p className="text-sm font-semibold">{item.crop || 'Crop report'}{item.plantName ? ` · ${item.plantName}` : ''}</p><p className="mt-1 text-sm text-slate-600">{item.disease || item.status}</p><p className="mt-2 flex justify-between text-xs text-slate-400"><span>{formatDate(item.createdAt)}</span><span className="text-emerald-700">View report →</span></p></button>)}{reportLoading && <p role="status" className="text-sm text-slate-500">Opening report…</p>}{detail.hasMoreReports && <Button variant="outline" size="sm" disabled={moreLoading} onClick={() => void loadMore('reports')}>{moreLoading ? 'Loading…' : 'Load more reports'}</Button>}</>}
            {tab === 'activity' && <><p className="mb-3 text-xs text-slate-500">Last sign-in: {formatDate(detail.farmer.lastSignInAt)} · Recent activity: {lastActive(detail.farmer.lastSeenAt)}</p><AuditList items={detail.activity}/></>}
          </div>
          <div className="border-t border-slate-200 pt-5"><h3 className="text-sm font-semibold">Account management</h3>{detail.farmer.protected ? <p className="mt-3 text-xs leading-5 text-slate-500">The owner account is protected from suspension and deletion.</p> : <><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => openConfirmation({ action: detail.farmer.disabled ? 'account.restore' : 'account.suspend' })}>{detail.farmer.disabled ? 'Restore account' : 'Suspend account'}</Button><Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => openConfirmation({ action: 'account.delete' })}>Delete account</Button></div><p className="mt-2 text-[11px] text-slate-400">Deletion requires confirmation and removes the farmer’s saved data.</p></>}</div>
        </div>}
      </Panel>
    </div>
    <Dialog open={Boolean(editor)} onOpenChange={open => { if (!open && !busy) setEditor(null); }}><DialogContent><DialogHeader><DialogTitle>{editor?.kind === 'profile' ? 'Edit farmer profile' : 'Edit crop'}</DialogTitle><DialogDescription>Update this record for {detail?.farmer.name}. Your change will be recorded in the admin activity log.</DialogDescription></DialogHeader>{editor && <form onSubmit={event => { event.preventDefault(); if (!detail) return; void mutate(editor.kind === 'profile' ? { action: 'profile.update', uid: detail.farmer.uid, version: detail.profileVersion, name: editor.name, location: editor.location } : { action: 'crop.update', uid: detail.farmer.uid, cropId: editor.crop.id, version: editor.crop.version, name: editor.name, notes: editor.notes }); }} className="space-y-4"><fieldset disabled={busy} className="space-y-4"><div className="space-y-2"><Label htmlFor="owner-record-name">Name</Label><Input id="owner-record-name" required maxLength={editor.kind === 'crop' ? 64 : 80} value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })}/></div>{editor.kind === 'profile' ? <div className="space-y-2"><Label htmlFor="owner-location">City / location</Label><Input id="owner-location" maxLength={160} value={editor.location} onChange={event => setEditor({ ...editor, location: event.target.value })}/></div> : <div className="space-y-2"><Label htmlFor="owner-notes">Crop notes</Label><Textarea id="owner-notes" maxLength={1500} value={editor.notes} onChange={event => setEditor({ ...editor, notes: event.target.value })}/><p className="text-xs text-slate-500">Existing diagnosis reports retain the crop name recorded at the time.</p></div>}{mutationError && <p role="alert" className="text-sm text-red-600">{mutationError}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" className="bg-emerald-700 hover:bg-emerald-800">{busy ? 'Saving…' : 'Save changes'}</Button></DialogFooter></fieldset></form>}</DialogContent></Dialog>
    <Dialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><DialogContent><DialogHeader><DialogTitle>{confirmation?.action === 'crop.delete' ? `Delete ${confirmation.crop.name}?` : confirmation?.action === 'account.delete' ? 'Delete farmer account?' : confirmation?.action === 'account.restore' ? 'Restore account?' : 'Suspend account?'}</DialogTitle><DialogDescription>{confirmation?.action === 'crop.delete' ? 'This permanently removes the selected crop, its plants, saved tests and linked reports.' : confirmation?.action === 'account.delete' ? 'This permanently removes the login account, profile, crops, reports and associated saved data. It cannot be undone.' : confirmation?.action === 'account.restore' ? 'This farmer will be able to sign in again. Their saved records will remain available.' : 'This farmer will be signed out and unable to access the app until you restore their account. Their records are retained.'}</DialogDescription></DialogHeader>{destructive && <div className="space-y-2"><Label htmlFor="owner-confirm">Type <strong>{confirmValue}</strong> to confirm</Label><Input id="owner-confirm" autoComplete="off" value={confirmationText} onChange={event => setConfirmationText(event.target.value)} disabled={busy}/></div>}{mutationError && <p role="alert" className="text-sm text-red-600">{mutationError}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button><Button variant={destructive ? 'destructive' : 'default'} disabled={busy || (destructive && confirmationText !== confirmValue)} onClick={() => { if (!confirmation || !detail) return; void mutate(confirmation.action === 'crop.delete' ? { action: confirmation.action, uid: detail.farmer.uid, cropId: confirmation.crop.id, version: confirmation.crop.version, confirmation: confirmationText } : confirmation.action === 'account.delete' ? { action: confirmation.action, uid: detail.farmer.uid, confirmation: confirmationText } : { action: confirmation.action, uid: detail.farmer.uid }); }}>{busy ? 'Please wait…' : destructive ? 'Confirm deletion' : 'Confirm'}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(report)} onOpenChange={open => { if (!open) setReport(null); }}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{report?.crop || 'Crop'} diagnosis report</DialogTitle><DialogDescription>{report?.plantName ? `${report.plantName} · ` : ''}{formatDate(report?.createdAt || null)} · {detail?.farmer.name}</DialogDescription></DialogHeader>{report && <div className="space-y-5">{report.image && /^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(report.image) && <img alt="Farmer's crop diagnosis photo" src={report.image} className="max-h-64 w-full rounded-xl bg-slate-50 object-contain"/>}<div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Saved diagnosis · {report.status}</p><h3 className="mt-2 text-xl font-semibold">{report.disease}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{report.description}</p><p className="mt-2 text-xs text-slate-500">Severity: {report.severity || 'Not recorded'}</p></div>{report.symptoms && <div><h4 className="font-semibold">Reported symptoms</h4><p className="mt-2 text-sm text-slate-600">{report.symptoms}</p></div>}{report.plan?.steps?.length ? <div><h4 className="font-semibold">Saved care plan</h4>{report.plan.steps.map((step,index) => <div key={index} className="mt-3 rounded-lg bg-emerald-50 p-3"><p className="text-sm font-semibold">{index + 1}. {step.title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p></div>)}</div> : null}<div><h4 className="font-semibold">Report history</h4>{report.history.length ? report.history.map((item,index) => <p key={index} className="mt-2 text-sm text-slate-600">{item.action} · {formatDate(item.changedAt || null)}</p>) : <p className="mt-2 text-sm text-slate-500">Created {formatDate(report.createdAt)}. No subsequent changes recorded.</p>}</div></div>}</DialogContent></Dialog>
  </div>;
}
