'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Users, ShieldCheck, Sprout, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { OwnerReport } from '@/lib/owner-admin';

type Profile = { uid?: string; name: string; city: string; updatedAt: string };
type SharedCase = { id: string; crop: string; disease: string; carePlan: {title: string; description: string}[]; usedTreatment: string; progress: string; updatedAt: string };
type Mine = { profile: Profile | null; cases: SharedCase[]; reports: OwnerReport[]; hasMore: boolean };
const card = 'rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm';

export default function CommunityPanel() {
  const { user } = useAuth();
  const [farmers, setFarmers] = useState<Profile[]>([]);
  const [mine, setMine] = useState<Mine | null>(null);
  const [selected, setSelected] = useState<{profile: Profile; cases: SharedCase[]} | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [reportId, setReportId] = useState('');
  const [usedTreatment, setUsedTreatment] = useState('');
  const [progress, setProgress] = useState('Not started');
  const requestSequence = useRef(0);
  const api = useCallback(async <T,>(query = '', action?: object): Promise<T> => {
    if (!user) throw new Error('Please sign in.');
    const token = await user.getIdToken();
    const response = await fetch(`/api/community${query}`, { method: action ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(action ? {'Content-Type':'application/json'} : {}) }, cache: 'no-store', ...(action ? {body: JSON.stringify(action)} : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load the community.');
    return result;
  }, [user]);
  const reload = useCallback(async () => {
    setLoading(true);
    try { const [directory, own] = await Promise.all([api<{farmers:Profile[]}>(), api<Mine>('?resource=mine')]); setFarmers(directory.farmers); setMine(own); setError(''); }
    catch (failure) { setError((failure as Error).message); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void reload(); return () => { requestSequence.current++; }; }, [reload]);
  async function mutate(action: object) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await api('', action); await reload(); setSelected(null); setNotice('Your community sharing has been updated.'); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function view(uid: string) {
    const sequence = ++requestSequence.current;
    setLoading(true); setError('');
    try { const result = await api<{profile:Profile;cases:SharedCase[]}>(`?uid=${encodeURIComponent(uid)}`); if (sequence === requestSequence.current) setSelected(result); }
    catch (failure) { if (sequence === requestSequence.current) setError((failure as Error).message); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }
  async function loadMoreReports() {
    if (!mine || busy) return;
    setBusy(true);
    try {
      const result = await api<Mine>(`?resource=mine&cursor=${encodeURIComponent(mine.reports.at(-1)!.id)}`);
      setMine(current => current ? {...current, reports: [...current.reports, ...result.reports], hasMore: result.hasMore} : current);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  const filtered = farmers.filter(farmer => `${farmer.name} ${farmer.city}`.toLowerCase().includes(search.toLowerCase()));
  const candidate = mine?.reports.find(report => report.id === reportId);
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-3xl font-bold">Farmer community</h1><p className="mt-2 text-sm text-slate-500">Learn from other farmers’ shared crop experiences.</p></div><Button className="bg-emerald-700 hover:bg-emerald-800" disabled={!mine} onClick={() => { setName(mine?.profile?.name || ''); setCity(mine?.profile?.city || ''); setConsent(Boolean(mine?.profile)); setSettings(true); }}>My sharing settings</Button></div>
    <p className="flex gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"><ShieldCheck className="shrink-0" size={20}/>Only farmer-shared profiles and cases are visible. Contact details, exact location and private reports remain private.</p>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<Button size="sm" variant="outline" className="ml-3" onClick={() => void reload()}>Retry</Button></div>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {loading && <p role="status" className="text-sm text-slate-500">Loading community…</p>}
    {selected ? <><Button variant="outline" onClick={() => { requestSequence.current++; setSelected(null); }}><ArrowLeft size={16} className="mr-2"/>Back to farmers</Button><section className={card}><div className="flex items-center gap-3"><span className="rounded-full bg-emerald-100 p-3 text-emerald-800"><Users/></span><div><h2 className="text-xl font-semibold">{selected.profile.name}</h2><p className="text-sm text-slate-500">{selected.profile.city || 'City not shared'} · Limited profile</p></div></div></section><div className="grid gap-4 lg:grid-cols-2">{selected.cases.map(item => <article className={card} key={item.id}><p className="text-xs font-medium uppercase tracking-wide text-emerald-700">{item.crop} · Farmer-shared case</p><h3 className="mt-2 text-xl font-semibold">{item.disease}</h3><p className="mt-3 text-sm"><strong>Progress:</strong> {item.progress} <span className="text-xs text-slate-500">(reported by farmer)</span></p><p className="mt-3 whitespace-pre-line text-sm"><strong>Treatment used:</strong> {item.usedTreatment || 'Not shared by farmer'}</p><details className="mt-4 rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium">Saved care plan</summary>{item.carePlan.length ? item.carePlan.map((step,index) => <div key={index} className="mt-3 text-sm"><p className="font-medium">{step.title}</p><p className="mt-1 leading-6 text-slate-600">{step.description}</p></div>) : <p className="mt-2 text-sm text-slate-500">No care plan shared.</p>}</details><p className="mt-4 text-xs text-slate-400">Last shared update: {new Date(item.updatedAt).toLocaleDateString()}</p></article>)}</div>{!selected.cases.length && <p className={card}>This farmer has not shared any crop cases yet.</p>}</> : <><Input aria-label="Search community farmers" placeholder="Search farmer name or city" value={search} onChange={event => setSearch(event.target.value)} className="max-w-md"/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(farmer => <section className={card} key={farmer.uid}><span className="inline-flex rounded-xl bg-emerald-50 p-3 text-emerald-700"><Sprout/></span><h2 className="mt-3 text-lg font-semibold">{farmer.name}</h2><p className="mt-1 text-sm text-slate-500">{farmer.city || 'City not shared'}</p><Button variant="outline" className="mt-4 w-full border-emerald-200 text-emerald-800" onClick={() => void view(farmer.uid!)}>View shared profile</Button></section>)}</div>{!loading && !error && !filtered.length && <p className={card}>{search ? 'No matching shared profiles.' : 'No farmers have shared a profile yet. You can be the first from My sharing settings.'}</p>}</>}
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>My community sharing</DialogTitle><DialogDescription>Choose what other signed-in farmers can see. Sharing is optional and can be removed at any time.</DialogDescription></DialogHeader><fieldset disabled={busy} className="space-y-5">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="community-name">Public display name</Label><Input id="community-name" maxLength={80} value={name} onChange={event => setName(event.target.value)}/></div><div><Label htmlFor="community-city">City (optional)</Label><Input id="community-city" placeholder="City only, e.g. Lahore" maxLength={80} value={city} onChange={event => setCity(event.target.value)}/></div></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1"/>Show this display name and city to other signed-in farmers.</label><div className="flex flex-wrap gap-2"><Button disabled={!consent || !name.trim() || busy} onClick={() => void mutate({action:'profile.share',name,city})}>{mine?.profile ? 'Update shared profile' : 'Share limited profile'}</Button>{mine?.profile && <Button variant="outline" onClick={() => void mutate({action:'profile.hide'})}>Hide profile and all shared cases</Button>}</div>
      {mine?.profile && <section className="space-y-3 border-t pt-5"><h3 className="font-semibold">Share a crop experience</h3><Label htmlFor="community-report">Your completed report</Label><select id="community-report" value={reportId} onChange={event => { const id = event.target.value; setReportId(id); const old = mine.cases.find(item => item.id === id); setUsedTreatment(old?.usedTreatment || ''); setProgress(old?.progress || 'Not started'); }} className="w-full rounded-md border bg-white p-2 text-sm"><option value="">Select a report</option>{mine.reports.filter(report => report.status === 'Complete').map(report => <option key={report.id} value={report.id}>{report.crop} — {report.disease}</option>)}</select>{mine.hasMore && <Button variant="outline" size="sm" onClick={() => void loadMoreReports()}>Load older reports</Button>}{candidate && <p className="rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">This shares the crop, saved diagnosis and care plan from this report, plus the treatment and progress you enter below. Photos, private symptoms/notes and report history are excluded.</p>}<Label htmlFor="community-treatment">Treatment you actually used (optional)</Label><Textarea id="community-treatment" maxLength={500} placeholder="Describe your experience; do not include contact or private details." value={usedTreatment} onChange={event => setUsedTreatment(event.target.value)}/><Label htmlFor="community-progress">Your crop’s progress</Label><select id="community-progress" className="w-full rounded-md border bg-white p-2 text-sm" value={progress} onChange={event => setProgress(event.target.value)}>{['Not started','Treatment ongoing','Improved','Resolved'].map(value => <option key={value}>{value}</option>)}</select><Button disabled={!candidate || busy} onClick={() => void mutate({action:'case.share',reportId,usedTreatment,progress})}>Share / update selected case</Button><h3 className="pt-3 font-semibold">Currently shared cases</h3>{mine.cases.length ? mine.cases.map(item => <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border p-3"><p className="text-sm">{item.crop} — {item.disease}<span className="block text-xs text-slate-500">{item.progress}</span></p><Button size="sm" variant="outline" onClick={() => void mutate({action:'case.hide',reportId:item.id})}>Unshare</Button></div>) : <p className="text-sm text-slate-500">No cases shared.</p>}</section>}
    </fieldset></DialogContent></Dialog>
  </div>;
}
