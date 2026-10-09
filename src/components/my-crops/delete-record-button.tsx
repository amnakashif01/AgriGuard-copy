'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export function DeleteRecordButton({ label, disabled, onDelete }: { label: string; disabled?: boolean; onDelete: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    if (deleting) return;
    setDeleting(true); setError('');
    try { await onDelete(); setOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete this report. Please try again.'); }
    finally { setDeleting(false); }
  }
  return <AlertDialog open={open} onOpenChange={value => { if (!deleting) { setOpen(value); setError(''); } }}>
    <AlertDialogTrigger asChild><Button type="button" variant="outline" size="sm" disabled={disabled || deleting} className="h-10 shrink-0 border-red-200 text-red-700 hover:bg-red-50" aria-label={`Delete ${label}`}><Trash2 className="mr-2 h-4 w-4" />Delete report</Button></AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Delete this report?</AlertDialogTitle><AlertDialogDescription>{label} and its saved analysis will be permanently deleted. Your crop, plant and other reports will remain. Comparisons will update using the remaining reports.</AlertDialogDescription></AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={event => { event.preventDefault(); void confirm(); }} className="bg-red-700 hover:bg-red-800">{deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{deleting ? 'Deleting…' : 'Delete report'}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
