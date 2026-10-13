'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, createUserWithEmailAndPassword, getAdditionalUserInfo, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, type UserCredential } from 'firebase/auth';
import { ArrowRight, Eye, EyeOff, Leaf, Loader2, MapPin, ShieldCheck, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { upsertProfile } from '@/lib/repositories';

type Mode = 'login' | 'signup' | 'reset';

// Public presentation account: ordinary user permissions, never administrator access.
const DEMO_ACCOUNT = { email: 'demo@agriguard.example', password: 'AgriGuardDemo!2026' };

function authMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Email or password is incorrect. Please try again.';
    case 'auth/email-already-in-use': return 'An account already uses this email. Sign in or reset your password.';
    case 'auth/invalid-email': return 'Please enter a valid email address.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements': return 'Choose a stronger password with uppercase and lowercase letters, a number and a symbol.';
    case 'auth/too-many-requests': return 'Too many attempts. Please wait a little before trying again.';
    case 'auth/network-request-failed': return 'Connection interrupted. Check your internet and try again.';
    case 'auth/popup-blocked': return 'Allow pop-ups for this site, then try Google sign-in again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'Google sign-in was cancelled. You can try again or use email.';
    case 'auth/account-exists-with-different-credential': return 'Use your existing sign-in method for this email.';
    case 'auth/operation-not-allowed': return 'This sign-in method is not enabled yet. Please contact the site administrator.';
    case 'auth/unauthorized-domain': return 'Google sign-in is not configured for this website yet. Please use email or contact the site administrator.';
    case 'auth/user-disabled': return 'This account is disabled. Please contact the site administrator.';
    default: return 'Unable to sign in right now. Please try again.';
  }
}

export default function LoginPage() {
  const { user, isUserLoading, auth } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<'email' | 'google' | 'demo' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const authenticating = useRef(false);

  useEffect(() => {
    if (!isUserLoading && user && !authenticating.current) router.replace('/dashboard');
  }, [user, isUserLoading, router]);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmation('');
    setVisible(false);
  }

  async function completeSignIn(result: UserCredential) {
    // Existing profiles (including location and crops) must never be overwritten on login.
    if (getAdditionalUserInfo(result)?.isNewUser) {
      try {
        await upsertProfile({ uid: result.user.uid, phone: '', ...(result.user.displayName ? { name: result.user.displayName } : {}), createdAt: new Date().toISOString() });
      } catch {
        toast({ title: 'Signed in', description: 'Your profile could not be saved yet. You can complete it from Profile.' });
      }
    }
    router.replace('/dashboard');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authenticating.current) return;
    setError('');
    setNotice('');
    if (mode === 'signup' && password !== confirmation) {
      setError('Your passwords do not match. Please check them.');
      return;
    }
    authenticating.current = true;
    setBusy('email');
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice('If an account exists for this email, you will receive a password reset link. Check your inbox and spam folder.');
      } else {
        const result = mode === 'signup'
          ? await createUserWithEmailAndPassword(auth, email.trim(), password)
          : await signInWithEmailAndPassword(auth, email.trim(), password);
        await completeSignIn(result);
      }
    } catch (failure) {
      if (mode === 'reset' && (failure as { code?: string })?.code === 'auth/user-not-found') {
        setNotice('If an account exists for this email, you will receive a password reset link. Check your inbox and spam folder.');
      } else setError(authMessage(failure));
    } finally {
      authenticating.current = false;
      setBusy(null);
    }
  }

  async function googleSignIn() {
    if (authenticating.current) return;
    authenticating.current = true;
    setBusy('google');
    setError('');
    setNotice('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await completeSignIn(await signInWithPopup(auth, provider));
    } catch (failure) {
      setError(authMessage(failure));
    } finally {
      authenticating.current = false;
      setBusy(null);
    }
  }

  async function demoSignIn() {
    if (authenticating.current) return;
    authenticating.current = true;
    setBusy('demo');
    setError('');
    setNotice('');
    try {
      await completeSignIn(await signInWithEmailAndPassword(auth, DEMO_ACCOUNT.email, DEMO_ACCOUNT.password));
    } catch (failure) {
      setError(authMessage(failure));
    } finally {
      authenticating.current = false;
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f8f4] text-slate-900 lg:grid lg:grid-cols-2">
      <section className="relative overflow-hidden bg-emerald-950 px-7 py-8 text-white sm:px-12 lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:p-16">
        <div aria-hidden="true" className="absolute -right-32 top-32 h-96 w-96 rounded-full border-[60px] border-emerald-800/30" />
        <div className="relative flex items-center gap-3 text-2xl font-bold tracking-tight"><span className="rounded-2xl bg-emerald-400/15 p-3"><Leaf className="h-7 w-7 text-emerald-300" /></span>AgriGuard</div>
        <div className="relative max-w-lg py-8 lg:py-20">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Your farming companion</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">Healthier crops.<br /><span className="text-emerald-300">Better tomorrow.</span></h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-emerald-100/80">Care for your crops, keep track of your farm, and find agricultural supplies near you.</p>
          <div className="mt-10 hidden space-y-5 sm:block">
            <div className="flex items-center gap-3 text-sm text-emerald-50"><Sprout className="h-5 w-5 text-emerald-300" /> Crop health insights and care plans</div>
            <div className="flex items-center gap-3 text-sm text-emerald-50"><MapPin className="h-5 w-5 text-emerald-300" /> Agricultural suppliers near your location</div>
          </div>
        </div>
        <p className="relative hidden text-sm text-emerald-200/70 lg:block">Built for growers. Rooted in Pakistan.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-10 sm:px-12 lg:py-16" aria-label="Account access">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <p className="mb-2 text-sm font-semibold text-emerald-700">LET’S GET GROWING</p>
            <h2 className="text-3xl font-bold tracking-tight">{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">{mode === 'signup' ? 'Start your journey to healthier crops.' : mode === 'reset' ? 'Enter your email and we’ll send you a reset link.' : 'Sign in to your farm, reports and crop care plans.'}</p>
          </div>
          <fieldset disabled={Boolean(busy) || isUserLoading} className="min-w-0 space-y-6" aria-busy={Boolean(busy)}>
            {mode !== 'reset' && <>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/60 p-1">
                <button type="button" aria-pressed={mode === 'login'} onClick={() => switchMode('login')} className={`rounded-lg py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${mode === 'login' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Sign in</button>
                <button type="button" aria-pressed={mode === 'signup'} onClick={() => switchMode('signup')} className={`rounded-lg py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${mode === 'signup' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Create account</button>
              </div>
              <Button type="button" variant="outline" onClick={googleSignIn} className="h-12 w-full gap-3 rounded-xl border-slate-300 bg-white text-slate-700">
                {busy === 'google' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.13H3.05v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.51l2.88-2.88A9.61 9.61 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.35 2.59A5.99 5.99 0 0 1 12 5.95Z"/></svg>}
                {busy === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
              </Button>
              <div className="flex items-center gap-4 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or continue with email<span className="h-px flex-1 bg-slate-200" /></div>
            </>}
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2"><Label htmlFor="email">Email address</Label><Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} className="h-12 rounded-xl border-slate-300 bg-white" /></div>
              {mode !== 'reset' && <div className="space-y-2">
                <div className="flex items-center justify-between"><Label htmlFor="password">Password</Label>{mode === 'login' && <button type="button" onClick={() => switchMode('reset')} className="text-xs font-semibold text-emerald-700 hover:underline">Forgot password?</button>}</div>
                <div className="relative"><Input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} className="h-12 rounded-xl border-slate-300 bg-white pr-12" aria-describedby={mode === 'signup' ? 'password-hint' : undefined} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500">{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                {mode === 'signup' && <p id="password-hint" className="text-xs text-slate-500">Use at least 8 characters. A mix of letters, numbers and symbols is best.</p>}
              </div>}
              {mode === 'signup' && <div className="space-y-2"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" name="confirm-password" type={visible ? 'text' : 'password'} autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="h-12 rounded-xl border-slate-300 bg-white" /></div>}
              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
              <Button type="submit" className="h-12 w-full gap-2 rounded-xl bg-emerald-700 font-semibold text-white hover:bg-emerald-800">{busy === 'email' ? <><Loader2 className="h-4 w-4 animate-spin" />Please wait…</> : <>{mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}<ArrowRight className="h-4 w-4" /></>}</Button>
              {mode === 'reset' && <button type="button" onClick={() => switchMode('login')} className="w-full text-sm font-semibold text-emerald-700 hover:underline">Back to sign in</button>}
            </form>
            {mode === 'login' && <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="mb-3"><p className="text-sm font-semibold text-emerald-900">Explore AgriGuard</p><p className="mt-1 text-xs leading-5 text-emerald-800/80">Try the app with a shared demo account.</p></div>
              <Button type="button" variant="outline" onClick={demoSignIn} className="h-11 w-full gap-2 rounded-lg border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100">{busy === 'demo' ? <><Loader2 className="h-4 w-4 animate-spin" />Opening demo…</> : <>Try demo account<ArrowRight className="h-4 w-4" /></>}</Button>
            </div>}
          </fieldset>
          <p className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-700" />Secure sign-in. Your farm, in one place.</p>
        </div>
      </section>
    </main>
  );
}
