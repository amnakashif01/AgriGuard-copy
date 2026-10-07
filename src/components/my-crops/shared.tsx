'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ArrowLeft, AlertCircle, Loader2, Sprout } from 'lucide-react';
import { getDb } from '@/lib/firestore';
import { useAuth } from '@/firebase';

export function useCropData<T extends { id: string }>(path: string | null, many = false, sort = 'createdAt', direction: 'asc' | 'desc' = 'asc') {
  const { user } = useAuth();
  const uid = user?.uid;
  const key = `${uid || ''}/${path}/${many}/${sort}/${direction}`;
  const [state, setState] = useState<{ key: string; data: T[]; error: string; loading: boolean }>({ key: '', data: [], error: '', loading: true });
  useEffect(() => {
    if (!uid || !path) return;
    const fullPath = `users/${uid}/${path}`;
    const fail = () => setState({ key, data: [], loading: false, error: 'Could not load your crops. Check your connection and refresh the page.' });
    if (many) return onSnapshot(query(collection(getDb(), fullPath), orderBy(sort, direction)), snapshot => {
      setState({ key, data: snapshot.docs.map(item => ({ ...item.data(), id: item.id } as T)), loading: false, error: '' });
    }, fail);
    return onSnapshot(doc(getDb(), fullPath), snapshot => {
      setState({ key, data: snapshot.exists() ? [{ ...snapshot.data(), id: snapshot.id } as T] : [], loading: false, error: '' });
    }, fail);
  }, [uid, key, path, many, sort, direction]);
  return state.key === key ? state : { data: [] as T[], loading: true, error: '' };
}

export function CropFrame({ title, eyebrow = 'YOUR FARM', subtitle, back, children }: { title: string; eyebrow?: string; subtitle?: string; back?: { href: string; label: string }; children: ReactNode }) {
  return <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-emerald-100/70 bg-[#f6f8f2] p-5 shadow-sm sm:p-8">
    {back && <Link href={back.href} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-emerald-800 hover:underline"><ArrowLeft className="h-4 w-4" />{back.label}</Link>}
    <header className="mb-8 flex items-start justify-between gap-4">
      <div className="min-w-0"><p className="mb-2 text-xs font-semibold tracking-[0.18em] text-emerald-700">{eyebrow}</p><h1 className="break-words font-headline text-3xl font-bold tracking-tight text-[#183d2b] sm:text-4xl">{title}</h1>{subtitle && <p className="mt-3 text-sm leading-6 text-slate-600">{subtitle}</p>}</div>
      <div className="shrink-0 rounded-2xl border border-emerald-100 bg-white p-3 text-emerald-700"><Sprout className="h-7 w-7" /></div>
    </header>
    {children}
  </section>;
}
export function LoadState({ loading, error, missing = false }: { loading: boolean; error: string; missing?: boolean }) {
  if (loading) return <div role="status" className="flex items-center justify-center gap-3 py-14 text-emerald-800"><Loader2 className="h-5 w-5 animate-spin" />Loading your farm…</div>;
  if (error || missing) return <ErrorNotice message={error || 'This item could not be found. Please return to My Crops.'} />;
  return null;
}
export function ErrorNotice({ message }: { message: string }) {
  return <div role="alert" className="my-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{message}</span></div>;
}
export function updatedLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Just added';
  if (date.toDateString() === new Date().toDateString()) return 'Updated today';
  return `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
export const greenButton = 'h-12 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800';
