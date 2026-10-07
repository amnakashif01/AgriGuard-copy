
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/firebase";
import { DiagnosisReport, ReportHistoryEntry, UserProfile } from "@/lib/models";
import CropImageHighlights from "@/components/agrisahayak/crop-image-highlights";
import { ArrowLeft, Calendar, DollarSign, AlertTriangle, CheckCircle, Shield, ListChecks, FlaskConical, Clock, ShieldAlert, History, Cloud, Thermometer, Wind, RefreshCw, Trash2, Edit, ShieldPlus, Loader2, Leaf, TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { deleteField, getDoc, doc, collection, query, where, getDocs } from "firebase/firestore";
import { useFirebase } from "@/firebase";
import LoadingSpinner from "@/components/agrisahayak/loading-spinner";
import { useToast } from '@/hooks/use-toast';
import { instantDiagnosisFromImageAndSymptoms, localizeDiagnosisHighlights } from '@/ai/flows/instant-diagnosis-from-image-and-symptoms';
import { updateReport, createLog, deleteReport, getProfile } from '@/lib/repositories';
import { useParams, useRouter } from 'next/navigation';
import { generateProtectionPlan } from '@/ai/flows/generate-protection-plan';
import { translateReportContent } from '@/ai/flows/translate-report';
import { sendDiagnosisComplete } from '@/lib/notifications';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "react-i18next";
import { findPreviousReport, isPlanEligible } from "@/lib/report-utils";
import { mergeVisualHighlights } from "@/lib/report-utils";
import SuppliersCard from "@/components/agrisahayak/suppliers-card";

/** Safely parse any timestamp to a readable string */
function formatTs(ts: any): string {
    if (!ts) return '—';
    // Firestore Timestamp
    if (typeof ts?.toDate === 'function') return ts.toDate().toLocaleString();
    // ISO string
    if (typeof ts === 'string') {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) return d.toLocaleString();
    }
    if (typeof ts === 'number') return new Date(ts).toLocaleString();
    return '—';
}

export default function ReportDetailPage() {
    const { user } = useAuth();
    const { db } = useFirebase();
    const [rawReport, setRawReport] = useState<DiagnosisReport | null>(null);
    const [translating, setTranslating] = useState(false);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const params = useParams();
    const router = useRouter();
    const reportId = params.id as string;
    const { t } = useTranslation();

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editSymptoms, setEditSymptoms] = useState("");
    const [generatingPlan, setGeneratingPlan] = useState(false);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [previousReport, setPreviousReport] = useState<DiagnosisReport | null>(null);
    const [highlightReviewStatus, setHighlightReviewStatus] = useState<Record<string, 'reviewing' | 'failed'>>({});
    const highlightReviewInFlightRef = useRef(new Set<string>());

    const report = useMemo(() => {
        if (!rawReport || !profile?.language) return rawReport;
        const targetLang = profile.language;
        if (targetLang !== 'english' && rawReport.translations?.[targetLang]) {
            const t = rawReport.translations[targetLang];
            return {
                ...rawReport,
                disease: t.disease,
                description: t.description,
                affectedParts: t.affectedParts,
                plan: t.plan || rawReport.plan,
                protectionPlan: t.protectionPlan || rawReport.protectionPlan
            } as DiagnosisReport;
        }
        return rawReport;
    }, [rawReport, profile?.language]);

    useEffect(() => {
        if (user) {
            getProfile(user.uid).then(setProfile);
        }
    }, [user]);

    useEffect(() => {
        if (!rawReport || !profile?.language || !user) return;
        const targetLang = profile.language;
        if (targetLang !== 'english' && !rawReport.translations?.[targetLang] && !translating) {
            setTranslating(true);
            let cancel = false;
            translateReportContent({
                disease: rawReport.disease,
                description: rawReport.description,
                affectedParts: rawReport.affectedParts || [],
                plan: rawReport.plan,
                protectionPlan: rawReport.protectionPlan,
                targetLanguage: targetLang
            }).then(translated => {
                if (!cancel) {
                    const newTranslations = { ...(rawReport.translations || {}), [targetLang]: translated };
                    updateReport(user.uid, rawReport.id, { translations: newTranslations } as any).then(() => {
                        setRawReport(prev => prev ? { ...prev, translations: newTranslations } as any : null);
                        setTranslating(false);
                    });
                }
            }).catch(err => {
                console.error("Translation error", err);
                if (!cancel) setTranslating(false);
            });
            return () => { cancel = true; };
        }
    }, [rawReport?.id, rawReport?.translations, profile?.language, user]);

    useEffect(() => {
        if (!user || !reportId || !db) return;

        let cancel = false;
        const fetchReport = async () => {
            try {
                const reportRef = doc(db, 'users', user.uid, 'reports', reportId);
                const reportSnap = await getDoc(reportRef);

                if (!cancel) {
                    if (reportSnap.exists()) {
                        setRawReport({ id: reportSnap.id, ...reportSnap.data() } as DiagnosisReport);
                    } else {
                        setRawReport(null);
                    }
                    setLoading(false);
                }
            } catch (error) {
                console.error('Error fetching report:', error);
                if (!cancel) setLoading(false);
            }
        };

        fetchReport();
        return () => { cancel = true; };
    }, [user, reportId, db]);

    useEffect(() => {
        if (!user || !db || !rawReport) return;

        if (rawReport.status !== 'Complete') {
            setPreviousReport(null);
            return;
        }
        
        let cancel = false;
        const loadComparison = async () => {
            try {
                const reportsRef = collection(db, 'users', user.uid, 'reports');
                let q;
                if (rawReport.fieldId) {
                    q = query(reportsRef, where('fieldId', '==', rawReport.fieldId));
                } else if (rawReport.crop) {
                    q = query(reportsRef, where('crop', '==', rawReport.crop));
                } else {
                    return;
                }

                const querySnapshot = await getDocs(q);
                const candidates = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as DiagnosisReport));
                const prev = findPreviousReport(candidates, rawReport);
                
                if (!cancel) {
                    setPreviousReport(prev || null);
                }
            } catch (err) {
                console.error("Failed to load comparison", err);
            }
        };

        loadComparison();
        return () => { cancel = true; };
    }, [user, db, rawReport?.id, rawReport?.fieldId, rawReport?.crop, rawReport?.createdAt, rawReport?.status]);

    // Helper: fetch image URL and convert to data URI
    async function urlToDataUri(url: string) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch image');
        const blob = await res.blob();
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    useEffect(() => {
        if (!user) return;
        const candidates = [rawReport, previousReport].filter((candidate): candidate is DiagnosisReport =>
            Boolean(candidate && candidate.status === 'Complete'
                && candidate.visualHighlightsReviewed !== true
                && !candidate.visualHighlights?.length
                && !highlightReviewInFlightRef.current.has(candidate.id)
                && candidate.severity !== 'None'
                && !/healthy|not a crop|not a plant/i.test(candidate.disease || '')
                && (candidate.imageUrl || candidate.imageThumb))
        );
        if (candidates.length === 0) return;

        candidates.forEach(candidate => highlightReviewInFlightRef.current.add(candidate.id));
        setHighlightReviewStatus(current => ({
            ...current,
            ...Object.fromEntries(candidates.map(candidate => [candidate.id, 'reviewing'])),
        }));
        const reviewSavedImages = async () => {
            const reviewed = await Promise.all(candidates.map(async candidate => {
                try {
                    const src = (candidate.imageUrl || candidate.imageThumb) as string;
                    const photoDataUri = src.startsWith('data:') ? src : await urlToDataUri(src);
                    const localized = await localizeDiagnosisHighlights({
                        photoDataUri,
                        crop: candidate.crop || 'Unknown Crop',
                        disease: candidate.disease || 'Unknown Disease',
                        description: candidate.description || '',
                    });
                    const visualHighlights = mergeVisualHighlights(candidate.visualHighlights || [], localized);
                    await updateReport(user.uid, candidate.id, {
                        visualHighlights,
                        visualHighlightsReviewed: true,
                    } as any);
                    return { report: { ...candidate, visualHighlights, visualHighlightsReviewed: true }, failed: false };
                } catch (error) {
                    console.warn(`Could not review saved report image highlights for ${candidate.id}:`, error);
                    return { report: null, id: candidate.id, failed: true };
                }
            }));
            setHighlightReviewStatus(current => {
                const next = { ...current };
                for (const result of reviewed) {
                    const reportId = result.report?.id || ('id' in result ? result.id : undefined);
                    if (!reportId) continue;
                    if (result.failed) next[reportId] = 'failed';
                    else delete next[reportId];
                }
                return next;
            });
            for (const result of reviewed) {
                const refreshed = result.report;
                if (!refreshed) continue;
                if (refreshed.id === rawReport?.id) setRawReport(current => current?.id === refreshed.id ? refreshed : current);
                if (refreshed.id === previousReport?.id) setPreviousReport(refreshed);
            }
            candidates.forEach(candidate => highlightReviewInFlightRef.current.delete(candidate.id));
        };

        void reviewSavedImages();
    }, [user, rawReport?.id, rawReport?.status, rawReport?.visualHighlightsReviewed, previousReport?.id, previousReport?.visualHighlightsReviewed]);

    const handleRetryDiagnosis = async () => {
        if (!user || !report) return;
        setLoading(true);
        try {
            await createLog({ agentName: 'diagnosticAgent', action: 'retry_started', reportId: report.id, status: 'info' });
            const src = report.imageUrl || report.imageThumb;
            if (!src) throw new Error('No image available for diagnosis');

            const photoDataUri = src.startsWith('data:') ? src : await urlToDataUri(src);

            const diagnosis = await instantDiagnosisFromImageAndSymptoms({ 
                photoDataUri, 
                symptoms: report.symptoms || '',
                language: profile?.language || 'english'
            });
            await updateReport(user.uid, report.id, {
                crop: diagnosis.crop,
                disease: diagnosis.disease,
                confidence: diagnosis.confidence,
                affectedParts: diagnosis.affectedParts,
                severity: diagnosis.severity,
                description: diagnosis.description,
                visualHighlights: diagnosis.visualHighlights,
                visualHighlightsReviewed: true,
                expertReviewRequired: diagnosis.expertReviewRequired,
                plan: isPlanEligible({ ...diagnosis, status: 'Complete', imageUrl: src }) && diagnosis.plan ? diagnosis.plan : deleteField(),
                protectionPlan: isPlanEligible({ ...diagnosis, status: 'Complete', imageUrl: src }) && diagnosis.protectionPlan ? diagnosis.protectionPlan : deleteField(),
                status: 'Complete'
            } as any);

            await createLog({ agentName: 'diagnosticAgent', action: 'retry_completed', reportId: report.id, status: 'success', payload: diagnosis });
            sendDiagnosisComplete(user.uid, report.id, diagnosis.crop, diagnosis.disease, diagnosis.severity, diagnosis.confidence).catch(console.warn);

            // Re-fetch report from Firestore to get updated history
            if (db && user) {
                const reportRef = doc(db, 'users', user.uid, 'reports', report.id);
                const snap = await getDoc(reportRef);
                if (snap.exists()) {
                    setRawReport({ id: snap.id, ...snap.data() } as DiagnosisReport);
                }
            }
            toast({ title: 'Retry Successful', description: 'Diagnosis updated with latest history.', className: 'bg-green-100 text-green-800' });
        } catch (err: any) {
            console.error('Retry failed:', err);
            await createLog({ agentName: 'diagnosticAgent', action: 'retry_failed', reportId: report?.id, status: 'error', payload: { error: err?.message || String(err) } });
            toast({ title: 'Retry Failed', description: 'Could not complete diagnosis. Try again later.', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteReport = async () => {
        if (!user || !reportId) return;
        setLoading(true);
        try {
            await deleteReport(user.uid, reportId);
            toast({ title: 'Report Deleted', description: 'Your report has been successfully deleted.' });
            router.push('/dashboard');
        } catch (error: any) {
            console.error('Failed to delete report:', error);
            toast({ title: 'Error', description: 'Failed to delete report.', variant: 'destructive' });
            setLoading(false);
        }
    };

    const handleEditReport = async () => {
        if (!user || !report) return;
        setIsEditDialogOpen(false);
        setLoading(true);
        try {
            await createLog({ agentName: 'diagnosticAgent', action: 'edit_started', reportId: report.id, status: 'info' });
            const src = report.imageUrl || report.imageThumb;
            if (!src) throw new Error('No image available for diagnosis');
            const photoDataUri = src.startsWith('data:') ? src : await urlToDataUri(src);
            
            const diagnosis = await instantDiagnosisFromImageAndSymptoms({ 
                photoDataUri, 
                symptoms: editSymptoms,
                language: profile?.language || 'english'
            });
            
            await updateReport(user.uid, report.id, {
                crop: diagnosis.crop,
                disease: diagnosis.disease,
                confidence: diagnosis.confidence,
                affectedParts: diagnosis.affectedParts,
                severity: diagnosis.severity,
                description: diagnosis.description,
                visualHighlights: diagnosis.visualHighlights,
                visualHighlightsReviewed: true,
                expertReviewRequired: diagnosis.expertReviewRequired,
                symptoms: editSymptoms,
                status: 'Complete',
                plan: isPlanEligible({ ...diagnosis, status: 'Complete', imageUrl: src }) && diagnosis.plan ? diagnosis.plan : deleteField(),
                protectionPlan: isPlanEligible({ ...diagnosis, status: 'Complete', imageUrl: src }) && diagnosis.protectionPlan ? diagnosis.protectionPlan : deleteField()
            } as any);

            await createLog({ agentName: 'diagnosticAgent', action: 'edit_completed', reportId: report.id, status: 'success', payload: diagnosis });
            sendDiagnosisComplete(user.uid, report.id, diagnosis.crop, diagnosis.disease, diagnosis.severity, diagnosis.confidence).catch(console.warn);
            
            await handleRefresh();
            toast({ title: 'Report Updated', description: 'Your report has been updated successfully.', className: 'bg-green-100 text-green-800' });
        } catch (err: any) {
            console.error('Edit failed:', err);
            toast({ title: 'Error', description: 'Could not update the report.', variant: 'destructive' });
            setLoading(false);
        }
    };

    const handleGenerateProtectionPlan = async () => {
        if (!user || !report) return;
        setGeneratingPlan(true);
        try {
            if (!isPlanEligible(report)) {
                toast({ title: 'Plan Unavailable', description: 'A completed report with an uploaded image, identified crop, and identified disease is required.', variant: 'destructive' });
                return;
            }
            const plan = await generateProtectionPlan({
                crop: report.crop || 'Unknown Crop',
                disease: report.disease || 'Unknown Disease',
            });
            await updateReport(user.uid, report.id, {
                protectionPlan: plan as any,
            });
            await handleRefresh();
            toast({ title: 'Protection Plan Generated', description: '1-month protection plan has been created.', className: 'bg-green-100 text-green-800' });
        } catch (error: any) {
            console.error('Failed to generate protection plan:', error);
            toast({ title: 'Error', description: 'Failed to generate protection plan.', variant: 'destructive' });
        } finally {
            setGeneratingPlan(false);
        }
    };

    // Reload the report from Firestore to get latest history
    const handleRefresh = async () => {
        if (!user || !db || !reportId) return;
        setLoading(true);
        try {
            const reportRef = doc(db, 'users', user.uid, 'reports', reportId);
            const snap = await getDoc(reportRef);
            if (snap.exists()) {
                setRawReport({ id: snap.id, ...snap.data() } as DiagnosisReport);
            }
        } catch (e) {
            console.error('Refresh failed:', e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/dashboard">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Dashboard
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold font-headline">Loading Report...</h1>
                </div>
                <Card className="text-center p-12">
                    <LoadingSpinner message="Loading report details..." />
                </Card>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/dashboard">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Dashboard
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold font-headline">Report Not Found</h1>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Report Not Found</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>The report you are looking for does not exist or you don&apos;t have permission to view it.</p>
                        <Button asChild className="mt-4"><Link href="/dashboard">Back to Dashboard</Link></Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const getSeverityVariant = (severity: 'None' | 'Low' | 'Medium' | 'High') => {
        switch (severity) {
            case 'None': return 'outline';
            case 'High': return 'destructive';
            case 'Medium': return 'secondary';
            case 'Low': return 'default';
        }
    };

    const getConfidenceColor = (score: number) => {
        if (score >= 80) return 'text-green-600';
        if (score >= 60) return 'text-yellow-600';
        return 'text-red-600';
    };

    // Sort history oldest → newest
    const sortedHistory: ReportHistoryEntry[] = [...(report.history || [])].sort(
        (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime()
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/dashboard">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            {t('report.back')}
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold font-headline">{t('report.title')}</h1>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                    <Button variant="outline" size="sm" onClick={() => { setEditSymptoms(report.symptoms || ''); setIsEditDialogOpen(true); }} className="gap-2">
                        <Edit className="h-4 w-4" />
                        {t('report.edit')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        {t('report.refresh')}
                    </Button>
                    {report.fieldId && (
                        <Button asChild variant="default" size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                            <Link href={`/report/new?fieldId=${report.fieldId}`}>
                                <Calendar className="h-4 w-4" />
                                Follow-up
                            </Link>
                        </Button>
                    )}
                    <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)} className="gap-2">
                        <Trash2 className="h-4 w-4" />
                        {t('report.delete')}
                    </Button>
                </div>
            </div>

            {/* Report Header */}
            <Card className="border-0 shadow-md bg-gradient-to-r from-emerald-50 to-teal-50">
                <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <CardTitle className="text-2xl">{report.disease}</CardTitle>
                            <CardDescription className="mt-1">
                                {report.crop && <span className="font-medium">{report.crop}</span>}
                                {report.crop && ' • '}
                                <span>{formatTs(report.createdAt)}</span>
                            </CardDescription>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {report.severity && <Badge variant={getSeverityVariant(report.severity)}>{report.severity} {t('report.severity')}</Badge>}
                            <Badge variant="outline">{report.status}</Badge>
                            {(report.status === 'Pending' || report.status === 'Processing') && (
                                <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={handleRetryDiagnosis} disabled={loading}>
                                    {t('report.retry')}
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Direct Inline Comparison / Trend Analysis */}
            {previousReport && (
                <Card>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="h-5 w-5 text-indigo-600" />
                                Crop condition comparison
                            </CardTitle>
                            <CardDescription>Previous check compared with this report</CardDescription>
                        </div>
                        {(() => {
                            const severityScores = { None: 0, Low: 1, Medium: 2, High: 3 };
                            const currentScore = severityScores[report.severity || 'None'] || 0;
                            const previousScore = severityScores[previousReport.severity || 'None'] || 0;
                            if (currentScore < previousScore) return <Badge className="bg-green-100 text-green-800"><TrendingDown className="mr-1 h-4 w-4" />Improving</Badge>;
                            if (currentScore > previousScore) return <Badge className="bg-red-100 text-red-800"><TrendingUp className="mr-1 h-4 w-4" />Worsening</Badge>;
                            if (report.disease !== previousReport.disease) return <Badge variant="secondary">Condition changed</Badge>;
                            return <Badge variant="outline"><Minus className="mr-1 h-4 w-4" />Severity unchanged</Badge>;
                        })()}
                    </CardHeader>
                    <CardContent className="grid gap-6 md:grid-cols-2">
                        {[{ label: 'Previous', item: previousReport }, { label: 'Current', item: report }].map(({ label, item }) => (
                            <section key={label} className="min-w-0 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="font-semibold">{label}</h3>
                                    <span className="text-sm text-muted-foreground">{formatTs(item.createdAt)}</span>
                                </div>
                                {(item.imageUrl || item.imageThumb) && (
                                    <CropImageHighlights
                                        src={(item.imageUrl || item.imageThumb) as string}
                                        alt={`${label} crop image`}
                                        highlights={item.visualHighlights || (item.visualHighlight ? [item.visualHighlight] : [])}
                                        showReviewingState={highlightReviewStatus[item.id] === 'reviewing'}
                                        showReviewFailedState={highlightReviewStatus[item.id] === 'failed'}
                                        showEmptyState={item.visualHighlightsReviewed === true && item.severity !== 'None' && !/healthy|not a crop|not a plant/i.test(item.disease || '')}
                                        className="overflow-hidden rounded-lg border bg-muted"
                                    />
                                )}
                                <div className="space-y-1 text-sm">
                                    <p><span className="font-medium">Diagnosis:</span> {item.disease || 'Not available'}</p>
                                    <p><span className="font-medium">Severity:</span> {item.severity || 'Not available'}</p>
                                    <p><span className="font-medium">Confidence:</span> {item.confidence ?? 'Not available'}{item.confidence !== undefined ? '%' : ''}</p>
                                    <p className="text-muted-foreground">{item.description || 'No description available.'}</p>
                                </div>
                            </section>
                        ))}
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                    {(report.imageUrl || report.imageThumb) && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Shield className="h-5 w-5" />
                                    {t('report.crop_image')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="relative">
                                    <div className="relative inline-block w-full">
                                        <CropImageHighlights
                                            src={(report.imageUrl || report.imageThumb) as string}
                                            alt="Crop diagnosis with detected affected areas highlighted"
                                            highlights={report.visualHighlights || (report.visualHighlight ? [report.visualHighlight] : [])}
                                            showReviewingState={highlightReviewStatus[report.id] === 'reviewing'}
                                            showReviewFailedState={highlightReviewStatus[report.id] === 'failed'}
                                            showEmptyState={report.visualHighlightsReviewed === true && report.severity !== 'None' && !/healthy|not a crop|not a plant/i.test(report.disease || '')}
                                        />
                                        {/* List out all reasonings below the image */}
                                        {(report.visualHighlights || (report.visualHighlight ? [report.visualHighlight] : [])).length > 0 && (
                                            <div className="mt-3 space-y-2">
                                                {(report.visualHighlights || (report.visualHighlight ? [report.visualHighlight] : [])).map((highlight, idx) => (
                                                    highlight.reasoning && (
                                                        <div key={idx} className="text-sm text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-100 flex items-start gap-2 shadow-sm">
                                                            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                                            <p className="font-medium">
                                                                <span className="font-bold text-amber-900 mr-2">Target {idx + 1}:</span>
                                                                {highlight.reasoning}
                                                            </p>
                                                        </div>
                                                    )
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5" />
                                {t('report.diagnosis_details')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {report.expertReviewRequired && (
                                <div className="bg-amber-100/50 border border-amber-200 text-amber-800 p-4 rounded-lg flex items-start gap-3 shadow-sm mb-4">
                                    <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <h4 className="font-semibold">AI Prediction - Verification Recommended</h4>
                                        <p className="text-sm">This result is AI-generated and should be verified by a qualified agricultural expert before applying treatment.</p>
                                    </div>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">{t('report.confidence_score')}</p>
                                    <p className={`text-2xl font-bold ${getConfidenceColor(report.confidence)}`}>
                                        {report.confidence}%
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5"><Leaf className="h-4 w-4 text-emerald-600"/> {t('report.affected_parts')}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {(report.affectedParts || []).map((part, index) => (
                                            <Badge key={index} variant="secondary" className="text-sm px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200 shadow-sm transition-colors">
                                                {part}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            {report.symptoms && (
                                <>
                                    <Separator />
                                    <div>
                                        <p className="text-sm text-muted-foreground mb-1">{t('report.symptoms_reported')}</p>
                                        <p className="text-sm leading-relaxed italic text-gray-600">&ldquo;{report.symptoms}&rdquo;</p>
                                    </div>
                                </>
                            )}
                            <Separator />
                            <div>
                                <p className="text-sm text-muted-foreground mb-2">{t('report.description')}</p>
                                <p className="text-sm leading-relaxed">{report.description}</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Weather at time of report */}
                    {report.weather && (
                        <Card className="border-blue-100 bg-blue-50/50">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-blue-700">
                                    <Cloud className="h-5 w-5" />
                                    {t('report.weather')}
                                </CardTitle>
                                {report.weather.fetchedAt && (
                                    <CardDescription>{t('report.recorded')} {formatTs(report.weather.fetchedAt)}</CardDescription>
                                )}
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    {report.weather.location && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Wind className="h-4 w-4 text-blue-500" />
                                            <div>
                                                <p className="text-muted-foreground text-xs">{t('report.location')}</p>
                                                <p className="font-medium">{report.weather.location}</p>
                                            </div>
                                        </div>
                                    )}
                                    {report.weather.temperature && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Thermometer className="h-4 w-4 text-orange-500" />
                                            <div>
                                                <p className="text-muted-foreground text-xs">{t('report.temperature')}</p>
                                                <p className="font-medium">{report.weather.temperature}</p>
                                            </div>
                                        </div>
                                    )}
                                    {report.weather.condition && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Cloud className="h-4 w-4 text-blue-500" />
                                            <div>
                                                <p className="text-muted-foreground text-xs">{t('report.condition')}</p>
                                                <p className="font-medium">{report.weather.condition}</p>
                                            </div>
                                        </div>
                                    )}
                                    {report.weather.humidity && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Thermometer className="h-4 w-4 text-cyan-500" />
                                            <div>
                                                <p className="text-muted-foreground text-xs">{t('report.humidity')}</p>
                                                <p className="font-medium">{report.weather.humidity}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {report.weather.alerts && report.weather.alerts.length > 0 && (
                                    <div className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                                        <p className="text-xs font-semibold text-amber-700 mb-1">{t('report.weather_alerts')}</p>
                                        {report.weather.alerts.map((alert, i) => (
                                            <p key={i} className="text-xs text-amber-600">• {alert}</p>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {isPlanEligible(report) && report.plan && (
                        <>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <CheckCircle className="h-5 w-5" />
                                        {t('report.treatment_summary')}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex items-center gap-2">
                                            <DollarSign className="h-4 w-4 text-green-600" />
                                            <div>
                                                <p className="text-sm text-muted-foreground">{t('report.total_cost')}</p>
                                                <p className="font-bold text-lg">PKR {(report.plan.totalCost || 0).toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-blue-600" />
                                            <div>
                                                <p className="text-sm text-muted-foreground">{t('report.timeline')}</p>
                                                <p className="font-medium">{report.plan.timeline}</p>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {report.plan.steps && report.plan.steps.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <ListChecks className="h-5 w-5" />
                                            {t('report.treatment_steps')}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <Accordion type="single" collapsible className="w-full" defaultValue="step-1">
                                            {report.plan.steps.map((step, index) => (
                                                <AccordionItem value={`step-${step.stepNumber || index + 1}`} key={step.stepNumber || index + 1}>
                                                    <AccordionTrigger className="font-semibold text-lg">
                                                        <div className="flex items-center gap-3">
                                                            <div className="bg-primary/10 text-primary p-2 rounded-full">
                                                                <ListChecks className="h-5 w-5"/>
                                                            </div>
                                                            <span>{t('report.step')} {step.stepNumber || index + 1}: {step.title || t('report.follow_instructions')}</span>
                                                        </div>
                                                    </AccordionTrigger>
                                                    <AccordionContent className="pl-8 space-y-4 border-l-2 ml-4 border-primary/20">
                                                        <p className="text-muted-foreground">{step.description}</p>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                                            <div className="flex items-start gap-2">
                                                                <FlaskConical className="text-primary h-4 w-4 mt-1 flex-shrink-0"/>
                                                                <div>
                                                                    <p className="text-muted-foreground">Materials</p>
                                                                    <p className="font-medium">{(step.materials || []).join(', ') || 'None'}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-start gap-2">
                                                                <DollarSign className="text-green-500 h-4 w-4 mt-1 flex-shrink-0"/>
                                                                <div>
                                                                    <p className="text-muted-foreground">Est. Cost</p>
                                                                    <p className="font-medium">PKR {(step.cost || 0).toLocaleString()}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-start gap-2">
                                                                <Clock className="text-blue-500 h-4 w-4 mt-1 flex-shrink-0"/>
                                                                <div>
                                                                    <p className="text-muted-foreground">Timing</p>
                                                                    <p className="font-medium">{step.timing}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {step.safetyNotes && (
                                                            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                                                                <ShieldAlert className="h-5 w-5 mt-0.5 flex-shrink-0"/>
                                                                <div>
                                                                    <h4 className="font-semibold">Safety Note</h4>
                                                                    <p className="text-sm">{step.safetyNotes}</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </AccordionContent>
                                                </AccordionItem>
                                            ))}
                                        </Accordion>
                                    </CardContent>
                                </Card>
                            )}

                            {report.plan.preventionTips && report.plan.preventionTips.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Shield className="h-5 w-5" />
                                            {t('report.prevention_tips')}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                                            {(report.plan.preventionTips || []).map((tip, index) => (
                                                <li key={index} className="text-sm">{tip}</li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}

                    {/* 1-Month Protection Plan */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ShieldPlus className="h-5 w-5 text-indigo-600" />
                                {t('report.protection_plan')}
                            </CardTitle>
                            <CardDescription>
                                {t('report.protection_desc')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isPlanEligible(report) && report.protectionPlan ? (
                                <div className="space-y-4">
                                    <p className="text-sm font-medium">{t('report.duration')} {report.protectionPlan.duration}</p>
                                    <Accordion type="single" collapsible className="w-full">
                                        {(report.protectionPlan.phases || []).map((phase, phaseIdx) => (
                                            <AccordionItem value={`phase-${phase.week || phaseIdx}`} key={phase.week || phaseIdx}>
                                                <AccordionTrigger className="text-left font-semibold">
                                                    {t('report.week')} {phase.week}: {phase.title}
                                                </AccordionTrigger>
                                                <AccordionContent>
                                                    <ul className="list-disc list-inside space-y-1 mt-2 text-sm text-gray-700">
                                                        {(phase.tasks || []).map((task, i) => (
                                                            <li key={i}>{task}</li>
                                                        ))}
                                                    </ul>
                                                </AccordionContent>
                                            </AccordionItem>
                                        ))}
                                    </Accordion>
                                    {report.protectionPlan.recommendations?.length > 0 && (
                                        <div className="mt-4 pt-4 border-t">
                                            <h4 className="font-semibold text-sm mb-2">{t('report.general_rec')}</h4>
                                            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                                {(report.protectionPlan.recommendations || []).map((rec, i) => (
                                                    <li key={i}>{rec}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-6">
                                    <p className="text-muted-foreground mb-4">
                                        {isPlanEligible(report)
                                            ? t('report.generate_plan_desc')
                                            : 'A protection plan requires a completed report, an uploaded crop image, and an identified crop and disease.'}
                                    </p>
                                    <Button onClick={handleGenerateProtectionPlan} disabled={generatingPlan || !isPlanEligible(report)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                        {generatingPlan && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {t('report.generate_plan')}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Report Information */}
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('report.report_info')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('report.report_id')}</span>
                                <span className="font-mono text-sm">{report.id}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('report.created')}</span>
                                <span>{formatTs(report.createdAt)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('report.last_updated')}</span>
                                <span>{formatTs(report.updatedAt)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── REPORT HISTORY TIMELINE ── */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <History className="h-5 w-5 text-emerald-600" />
                                {t('report.history')}
                            </CardTitle>
                            <CardDescription>
                                {t('report.history_desc')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {sortedHistory.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    {t('report.no_history')}
                                </p>
                            ) : (
                                <div className="relative">
                                    {/* Timeline line */}
                                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-emerald-100" />
                                    <div className="space-y-4">
                                        {sortedHistory.map((entry, idx) => (
                                            <div key={idx} className="relative pl-10">
                                                {/* Timeline dot */}
                                                <div className={`absolute left-2.5 top-1.5 w-3 h-3 rounded-full border-2 border-white shadow-sm ${
                                                    entry.action.includes('Created') ? 'bg-emerald-500' :
                                                    entry.action.includes('Completed') ? 'bg-blue-500' :
                                                    entry.action.includes('Error') ? 'bg-red-500' :
                                                    'bg-amber-500'
                                                }`} />
                                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <span className="font-semibold text-sm text-gray-800">{entry.action}</span>
                                                        <span className="text-xs text-gray-400 whitespace-nowrap">{formatTs(entry.changedAt)}</span>
                                                    </div>
                                                    {entry.previousData && Object.keys(entry.previousData).length > 0 && (
                                                        <div className="mt-2 border-b border-gray-200 pb-2">
                                                            <p className="mb-1 text-xs font-semibold text-gray-500">Previous values</p>
                                                            <div className="grid grid-cols-2 gap-1">
                                                                {entry.previousData.disease !== undefined && <p className="text-xs"><span className="text-muted-foreground">Disease: </span>{entry.previousData.disease}</p>}
                                                                {entry.previousData.crop !== undefined && <p className="text-xs"><span className="text-muted-foreground">Crop: </span>{entry.previousData.crop}</p>}
                                                                {entry.previousData.severity !== undefined && <p className="text-xs"><span className="text-muted-foreground">Severity: </span>{entry.previousData.severity}</p>}
                                                                {entry.previousData.confidence !== undefined && <p className="text-xs"><span className="text-muted-foreground">Confidence: </span>{entry.previousData.confidence}%</p>}
                                                                {entry.previousData.status !== undefined && <p className="text-xs"><span className="text-muted-foreground">Status: </span>{entry.previousData.status}</p>}
                                                                {entry.previousData.description !== undefined && <p className="col-span-2 text-xs"><span className="text-muted-foreground">Description: </span>{entry.previousData.description}</p>}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {entry.newData && Object.keys(entry.newData).length > 0 && (
                                                        <div className="mt-2 grid grid-cols-2 gap-1">
                                                            {entry.newData.disease && (
                                                                <div className="text-xs">
                                                                    <span className="text-muted-foreground">Disease: </span>
                                                                    <span className="font-medium">{entry.newData.disease}</span>
                                                                </div>
                                                            )}
                                                            {entry.newData.confidence !== undefined && (
                                                                <div className="text-xs">
                                                                    <span className="text-muted-foreground">Confidence: </span>
                                                                    <span className="font-medium">{entry.newData.confidence}%</span>
                                                                </div>
                                                            )}
                                                            {entry.newData.severity && (
                                                                <div className="text-xs">
                                                                    <span className="text-muted-foreground">Severity: </span>
                                                                    <span className="font-medium">{entry.newData.severity}</span>
                                                                </div>
                                                            )}
                                                            {entry.newData.status && (
                                                                <div className="text-xs">
                                                                    <span className="text-muted-foreground">Status: </span>
                                                                    <span className="font-medium">{entry.newData.status}</span>
                                                                </div>
                                                            )}
                                                            {entry.newData.crop && (
                                                                <div className="text-xs">
                                                                    <span className="text-muted-foreground">Crop: </span>
                                                                    <span className="font-medium">{entry.newData.crop}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
            {isPlanEligible(report) && (
                <section aria-label="Marketplace suppliers for this diagnosis">
                    <SuppliersCard />
                </section>
            )}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('report.edit_title')}</DialogTitle>
                        <DialogDescription>
                            {t('report.edit_desc')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <label className="text-sm font-medium mb-2 block">{t('report.symptoms_label')}</label>
                        <Textarea 
                            value={editSymptoms}
                            onChange={(e) => setEditSymptoms(e.target.value)}
                            placeholder={t('report.symptoms_placeholder')}
                            rows={4}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={loading}>{t('report.cancel')}</Button>
                        <Button onClick={handleEditReport} disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('report.update_analyze')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('report.delete_title')}</DialogTitle>
                        <DialogDescription>
                            {t('report.delete_desc')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={loading}>{t('report.cancel')}</Button>
                        <Button variant="destructive" onClick={handleDeleteReport} disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('report.delete_confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
