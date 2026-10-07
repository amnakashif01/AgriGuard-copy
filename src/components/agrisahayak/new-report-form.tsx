
"use client";

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Image from 'next/image';
import { Upload, X, MapPin, Sparkles, Shield, Leaf, AlertTriangle } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { diagnoseCrop } from '@/lib/actions/diagnosis-actions';

import LoadingSpinner from './loading-spinner';
import DiagnosisCard from './diagnosis-card';
import { ProgressSteps } from "@/components/ui/progress-enhanced";
import { SkeletonForm } from "@/components/ui/skeleton-enhanced";
import { InteractiveButton, ScrollAnimation, TouchGesture } from "@/components/ui/interactive";
import { AccessibleFormField, AccessibleButton, LiveRegion } from "@/components/ui/accessibility";
import { useToast } from "@/hooks/use-toast";
import { sendDiagnosisComplete, sendTreatmentReminder } from "@/lib/notifications";
import TreatmentPlanCard from './treatment-plan-card';
import SuppliersCard from './suppliers-card';
import { useAuth } from '@/firebase';
import { useTranslation } from "react-i18next";
import { createReport, createLog, updateReport, getProfile, listFields } from '@/lib/repositories';
import { DiagnosisReport, UserProfile, Field } from '@/lib/models';
import { isPlanEligible } from '@/lib/report-utils';

type LoadingState = 'idle' | 'starting' | 'diagnosing' | 'planning' | 'done' | 'error';
type LoadingMessages = { [key in LoadingState]?: string };

const loadingMessages: LoadingMessages = {
    starting: "Creating report and uploading image...",
    diagnosing: 'Analyzing your crop with AI...',
    planning: 'Creating personalized treatment plan...',
};

function fileToDataUri(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function blobToDataUri(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Compress an image File using an offscreen canvas and return a Blob
async function compressImage(file: File, maxWidth = 1024, quality = 0.8): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
        try {
            const img = document.createElement('img') as HTMLImageElement;
            img.onload = () => {
                try {
                    const ratio = Math.min(1, maxWidth / img.width);
                    const width = Math.round(img.width * ratio);
                    const height = Math.round(img.height * ratio);
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('Canvas context not available');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob(
                        blob => {
                            if (!blob) return reject(new Error('Compression toBlob returned null'));
                            resolve(blob);
                        },
                        'image/jpeg',
                        quality
                    );
                } catch (err) {
                    reject(err);
                }
            };
            img.onerror = () => reject(new Error('Failed to load image for compression'));
            // Use object URL to avoid base64 memory usage
            const url = URL.createObjectURL(file);
            img.src = url;
            // revoke later
            img.addEventListener('load', () => URL.revokeObjectURL(url));
        } catch (err) {
            reject(err);
        }
    });
}

// Create a small thumbnail data URI (safe for Firestore) -- keep under ~200KB
async function createThumbnailDataUri(file: File, maxWidth = 480, quality = 0.65): Promise<string> {
    const blob = await compressImage(file, maxWidth, quality);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export default function NewReportForm() {
    const { user, isUserLoading } = useAuth();
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [symptoms, setSymptoms] = useState('');
    const [selectedCrop, setSelectedCrop] = useState<string>('');
    const [selectedField, setSelectedField] = useState<string>('');
    const [fields, setFields] = useState<Field[]>([]);
    const [loadingState, setLoadingState] = useState<LoadingState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);

    const [report, setReport] = useState<DiagnosisReport | null>(null);
    const { toast } = useToast();
    const { t } = useTranslation();
    const searchParams = useSearchParams();
    const router = useRouter();

    useEffect(() => {
        const fieldIdParam = searchParams.get('fieldId');
        if (fieldIdParam) setSelectedField(fieldIdParam);
    }, [searchParams]);

    // Added state for simulated progress
    const [simulatedProgress, setSimulatedProgress] = useState(0);

    // Simulate progress while starting
    useEffect(() => {
        if (loadingState === 'starting') {
            setSimulatedProgress(0);
            const interval = setInterval(() => {
                setSimulatedProgress(prev => {
                    // Slowly approach 33% but don't quite reach it until done
                    const increment = (33 - prev) * 0.1;
                    return Math.min(33, prev + Math.max(0.5, increment));
                });
            }, 500);
            return () => clearInterval(interval);
        } else if (loadingState === 'diagnosing') {
            setSimulatedProgress(66);
        } else if (loadingState === 'planning') {
            setSimulatedProgress(95);
        }
    }, [loadingState]);
    
    // Track which report ID has had diagnosis/planning initiated to prevent duplicate generation
    const diagnosisInitiatedForReportIdRef = useRef<string | null>(null);
    const planningInitiatedForReportIdRef = useRef<string | null>(null);
    
    // Track if async operations are in progress
    const diagnosisInProgressRef = useRef(false);
    const planningInProgressRef = useRef(false);

    useEffect(() => {
        if (user) {
            getProfile(user.uid).then(setProfile);
            listFields(user.uid).then(setFields);
        } else {
            setProfile(null);
            setFields([]);
        }
    }, [user]);



    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                toast({ title: "Image too large", description: "Please upload an image under 10MB.", variant: "destructive" });
                return;
            }
            if (!['image/png', 'image/jpeg'].includes(file.type)) {
                toast({ title: "Invalid file type", description: "Please upload a PNG or JPG image.", variant: "destructive" });
                return;
            }
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const removeImage = () => {
        setImageFile(null);
        if (imagePreview) {
            URL.revokeObjectURL(imagePreview);
            setImagePreview(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loadingState !== 'idle') return;
        if (!imageFile || !user) {
            toast({ title: "Missing prerequisites", description: "Please upload an image and ensure you are logged in.", variant: "destructive" });
            return;
        }

        setLoadingState('starting');
        setError(null);
        // Reset all refs for new diagnosis (new report will get new ID)
        diagnosisInitiatedForReportIdRef.current = null;
        planningInitiatedForReportIdRef.current = null;
        diagnosisInProgressRef.current = false;
        planningInProgressRef.current = false;
        const startTime = Date.now();
        let reportId = '';

        try {
            // Phase 1: Parallel preparation — report, thumbnail, and analysis image at once
            console.log("Starting optimized report creation...");
            const [newReportId, imageThumb, analysisBlob] = await Promise.all([
                createReport(user.uid, {
                    crop: selectedCrop && selectedCrop !== 'Auto' ? selectedCrop : (profile?.crops?.[0] || 'Crop to be identified'),
                    symptoms,
                    status: 'Processing',
                    ...(selectedField !== 'none' && selectedField ? { fieldId: selectedField } : {}),
                } as any),
                createThumbnailDataUri(imageFile, 480, 0.65),
                compressImage(imageFile, 1024, 0.8),
            ]);
            reportId = newReportId;
            console.log("Phase 1 complete — Report ID:", reportId);

            // Fire-and-forget: persist thumbnail and log (non-blocking)
            await updateReport(user.uid, reportId, { imageThumb } as any);
            createLog({ agentName: 'ingestAgent', action: 'report_created', reportId, status: 'success' });

            // Set report state for the loading UI
            setReport({ id: reportId, imageUrl: imageThumb, imageThumb, symptoms } as any);

            // Phase 2: AI Diagnosis (direct call, no useEffect state machine)
            setLoadingState('diagnosing');
            console.log("Phase 2 — Starting AI diagnosis...");

            const photoDataUri = await blobToDataUri(analysisBlob);
            const cropToAnalyze = selectedCrop && selectedCrop !== 'Auto' ? selectedCrop : (profile?.crops?.[0] || 'Unknown Crop');

            createLog({ agentName: 'diagnosticAgent', action: 'diagnosis_started', reportId, status: 'info' });

            const diagnosisResult = await diagnoseCrop({
                photoDataUri,
                symptoms,
                crop: cropToAnalyze,
                language: profile?.language || 'english'
            });
            if (!diagnosisResult.ok) throw new Error(diagnosisResult.error);
            const diagnosis = diagnosisResult.diagnosis;

            console.log(`✅ Diagnosis completed: ${diagnosis.disease}, confidence: ${diagnosis.confidence}%`);

            // Phase 3: Single Firestore write with all diagnosis data + completion status
            const isNotCrop = diagnosis.disease?.toLowerCase().includes('not a crop');
            const diagnosedCrop = diagnosis.crop !== 'Unknown Crop' ? diagnosis.crop : cropToAnalyze;
            const planEligible = isPlanEligible({
                crop: diagnosedCrop,
                disease: diagnosis.disease,
                status: 'Complete',
                imageThumb,
            });

            await updateReport(user.uid, reportId, {
                crop: diagnosedCrop,
                disease: diagnosis.disease,
                confidence: diagnosis.confidence,
                affectedParts: diagnosis.affectedParts,
                severity: diagnosis.severity,
                description: diagnosis.description,
                ...(planEligible && diagnosis.plan ? { plan: diagnosis.plan } : {}),
                ...(planEligible && diagnosis.protectionPlan ? { protectionPlan: diagnosis.protectionPlan } : {}),
                visualHighlights: diagnosis.visualHighlights,
                visualHighlightsReviewed: false,
                visualHighlightsReviewVersion: 0,
                expertReviewRequired: diagnosis.expertReviewRequired,
                status: 'Complete',
            } as any);

            // Fire-and-forget: notifications and logging (non-blocking)
            sendDiagnosisComplete(
                user.uid,
                reportId,
                diagnosedCrop,
                diagnosis.disease,
                diagnosis.severity,
                diagnosis.confidence
            ).catch(console.warn);
            if (!isNotCrop && diagnosis.plan && profile?.notificationPreferences?.treatmentReminders !== false && diagnosis.plan.steps?.[0]?.title) {
                sendTreatmentReminder(user.uid, diagnosis.plan.steps[0].title, new Date()).catch(console.warn);
            }
            createLog({ agentName: 'diagnosticAgent', action: 'diagnosis_completed', reportId, status: 'success', duration: Date.now() - startTime, payload: diagnosis });

            // Update local state and finish
            setReport(prev => prev ? {
                ...prev,
                ...diagnosis,
                ...(planEligible ? {} : { plan: undefined, protectionPlan: undefined }),
                status: 'Complete',
            } : null);

            if (isNotCrop) {
                toast({ title: "Analysis Complete", description: "The image does not appear to be a plant. No treatment plan generated.", className: "bg-blue-100 text-blue-800" });
            } else {
                toast({ title: "Analysis Complete!", description: "Your complete report is now available.", className: "bg-green-100 text-green-800" });
            }

            window.dispatchEvent(new Event('reportCreated'));
            // Redirect to the actual report page which has the full UI including Trend Analysis!
            router.push(`/report/${reportId}`);

        } catch (error: any) {
            console.error("Report generation error:", error);
            const actualError = error?.message || 'Report generation failed. Please try again.';

            if (reportId) {
                updateReport(user.uid, reportId, { status: 'Pending' } as any).catch(e => console.warn('Failed to mark report Pending:', e));
                createLog({ agentName: 'diagnosticAgent', action: 'diagnosis_failed', reportId, status: 'error', duration: Date.now() - startTime, payload: { error: error?.message || String(error) } });
            }

            setError(`${actualError}${reportId ? ' Check Report History before retrying.' : ''}`);
            setLoadingState('idle');
        }
    };
    
    const resetForm = () => {
        removeImage();
        setSymptoms('');
        setSelectedCrop('');
        setReport(null);
        setError(null);
        setLoadingState('idle');
        setSimulatedProgress(0);
        // Reset all tracking refs to allow fresh report creation
        diagnosisInitiatedForReportIdRef.current = null;
        planningInitiatedForReportIdRef.current = null;
        diagnosisInProgressRef.current = false;
        planningInProgressRef.current = false;
    }

    if (loadingState === 'done' && report && imagePreview) {
        const isNotCrop = report.disease?.toLowerCase().includes('not a crop');
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold font-headline">Diagnosis Report</h1>
                    <Button onClick={resetForm}>Create New Report</Button>
                </div>
                {isNotCrop ? (
                    <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm overflow-hidden">
                        <div className="p-8 md:p-12 text-center flex flex-col items-center justify-center space-y-6 bg-gradient-to-br from-amber-50 to-orange-50/30">
                            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mb-2 shadow-inner">
                                <AlertTriangle className="h-10 w-10 text-amber-500" />
                            </div>
                            <div className="space-y-2 max-w-md">
                                <h2 className="text-2xl font-bold text-gray-900">Not a Plant</h2>
                                <p className="text-gray-600 text-lg">
                                    The image you uploaded doesn't appear to be a crop or plant. 
                                </p>
                                <p className="text-gray-500">
                                    Our AI can only diagnose diseases and provide treatment plans for agricultural crops. Please upload a clear photo of the affected plant.
                                </p>
                            </div>
                            <div className="mt-8 relative rounded-2xl overflow-hidden shadow-md border-4 border-white inline-block">
                                <Image 
                                    src={imagePreview} 
                                    alt="Uploaded image" 
                                    width={250} 
                                    height={200} 
                                    className="object-cover h-48 w-auto max-w-[250px]" 
                                />
                            </div>
                        </div>
                    </Card>
                ) : (
                    <>
                        <DiagnosisCard diagnosis={report as any} imageUrl={imagePreview} />
                        {report.plan && <TreatmentPlanCard plan={report.plan as any} protectionPlan={report.protectionPlan as any} />}
                        <SuppliersCard />
                    </>
                )}
            </div>
        );
    }

    if (['starting', 'diagnosing', 'planning'].includes(loadingState)) {
        const steps = ['Upload Image', 'AI Analysis', 'Treatment Plan'];
        const descriptions = ['Image secured', 'Identifying issues', 'Generating plan'];
        const currentStepIndex = loadingState === 'starting' ? 0 : loadingState === 'diagnosing' ? 1 : 2;
        const progress = Math.round(loadingState === 'starting' ? simulatedProgress : loadingState === 'diagnosing' ? 66 : 95);

        return (
            <div className="w-full max-w-6xl mx-auto">
                <div className="mb-8 md:mb-12 text-center md:text-left flex flex-col items-center md:items-start">
                    <Badge variant="outline" className="mb-4 bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 text-sm font-medium">
                        <Sparkles className="w-4 h-4 mr-2" />
                        AI Crop Diagnosis
                    </Badge>
                    <h1 className="text-3xl md:text-5xl font-extrabold font-headline text-gray-900 tracking-tight mb-3">
                        Processing Your Diagnosis
                    </h1>
                    <p className="text-base md:text-lg text-gray-600 max-w-2xl leading-relaxed">
                        Our advanced AI is analyzing your crop image and symptoms to prepare a personalized, actionable treatment plan.
                    </p>
                </div>

                <Card className="shadow-2xl border-0 overflow-hidden bg-white rounded-[24px]">
                    <div className="flex flex-col lg:flex-row">
                        {/* Left Side: Processing State & Animation */}
                        <div className="lg:w-3/5 p-8 md:p-12 bg-gradient-to-br from-emerald-50/50 via-white to-green-50/30 relative flex flex-col justify-center">
                            {/* Decorative background blob */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-100 rounded-full blur-[80px] opacity-40 pointer-events-none -translate-y-1/2 translate-x-1/3" />
                            
                            <div className="w-full max-w-md mx-auto mb-12 relative z-10">
                                <ProgressSteps 
                                    steps={steps} 
                                    descriptions={descriptions}
                                    currentStep={currentStepIndex + 1}
                                />
                            </div>

                            <div className="relative z-10 flex flex-col items-center">
                                <LoadingSpinner 
                                    message={loadingMessages[loadingState as LoadingState]}
                                    className="mb-6"
                                    size="lg"
                                    variant="agricultural"
                                    showProgress={true}
                                    progress={progress}
                                />
                                
                                <div className="mt-8 flex items-center justify-center p-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-emerald-100 shadow-sm w-full max-w-md mx-auto">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-emerald-100 rounded-full animate-pulse">
                                            <Shield className="h-5 w-5 text-emerald-600" />
                                        </div>
                                        <div className="text-sm">
                                            <p className="text-emerald-900 font-semibold">Secure AI Processing</p>
                                            <p className="text-emerald-700/80">Please do not close this window. Takes ~30-60s.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Upload Summary */}
                        <div className="lg:w-2/5 p-8 md:p-12 bg-gray-50/80 border-t lg:border-t-0 lg:border-l border-gray-100 flex flex-col">
                            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                                <Leaf className="w-5 h-5 mr-2 text-primary" />
                                Analysis Details
                            </h3>
                            
                            {imagePreview && (
                                <div className="mb-8">
                                    <p className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">Crop Image</p>
                                    <div className="relative group rounded-2xl overflow-hidden shadow-md border border-gray-200 bg-white">
                                        <div className="aspect-[4/3] w-full relative">
                                            <Image 
                                                src={imagePreview} 
                                                alt="Crop to be diagnosed" 
                                                fill
                                                style={{ objectFit: 'cover' }}
                                                className="transition-transform duration-700 group-hover:scale-105" 
                                            />
                                            {/* Scanning line overlay */}
                                            <div className="absolute inset-0 z-10 overflow-hidden opacity-50 mix-blend-overlay">
                                                <div className="h-1 bg-emerald-400 w-full absolute shadow-[0_0_8px_2px_rgba(52,211,153,0.5)] animate-[scan_2.5s_ease-in-out_infinite]" />
                                            </div>
                                        </div>
                                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                                            <div className="flex items-center text-white/90 text-sm">
                                                <div className="w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse" />
                                                Analyzing pixel data...
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {symptoms && (
                                <div className="flex-grow">
                                    <p className="text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider">Reported Symptoms</p>
                                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-l-2xl" />
                                        <p className="text-gray-700 leading-relaxed text-sm italic">
                                            "{symptoms}"
                                        </p>
                                    </div>
                                </div>
                            )}
                            
                            {report?.id && (
                                <div className="mt-8 pt-6 border-t border-gray-200">
                                    <p className="text-xs text-gray-400 font-mono text-center">
                                        Report ID: {report.id}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <TouchGesture
            onSwipeLeft={() => console.log('Swipe left')}
            onSwipeRight={() => console.log('Swipe right')}
            className="max-w-4xl mx-auto"
        >
            <ScrollAnimation animation="fadeIn" delay={100}>
                <div className="mb-12">
                    <h1 className="text-4xl font-bold font-headline text-gray-900 mb-6">{t('new_report.title')}</h1>
                    <p className="text-lg text-gray-600 leading-relaxed">{t('new_report.subtitle')}</p>
                </div>
            </ScrollAnimation>

            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <CardHeader className="pb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <Upload className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-2xl">{t('new_report.form_title')}</CardTitle>
                                <CardDescription className="text-base">{t('new_report.form_subtitle')}</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        {/* Step 1: Image Upload */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
                                <Label className="text-lg font-semibold">{t('new_report.step1')}</Label>
                            </div>
                            
                            {imagePreview ? (
                                <div className="relative group">
                                    <div className="relative w-full max-w-md mx-auto">
                                        <Image 
                                            src={imagePreview} 
                                            alt="Crop preview" 
                                            width={400} 
                                            height={300} 
                                            className="rounded-xl border-2 border-gray-200 shadow-lg object-cover w-full h-64" 
                                        />
                                        <Button 
                                            variant="destructive" 
                                            size="icon" 
                                            className="absolute -top-3 -right-3 h-8 w-8 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" 
                                            onClick={removeImage}
                                        >
                                        <X className="h-4 w-4" />
                                    </Button>
                                    </div>
                                    <p className="text-center text-sm text-gray-500 mt-2">Click the X to remove and upload a different image</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <label htmlFor="image-upload" className="relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gradient-to-br from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 transition-all duration-200 group">
                                        <div className="flex flex-col items-center justify-center pt-8 pb-8">
                                            <div className="p-4 bg-primary/10 rounded-full mb-4 group-hover:scale-110 transition-transform duration-200">
                                                <Upload className="w-8 h-8 text-primary" />
                                            </div>
                                            <p className="mb-2 text-lg font-semibold text-gray-700">
                                                <span className="text-primary">Click to upload</span> or drag and drop
                                            </p>
                                            <p className="text-sm text-gray-500">PNG, JPG (MAX. 10MB)</p>
                                            <p className="text-xs text-gray-400 mt-2">For best results, ensure good lighting and clear focus</p>
                                        </div>
                                    </label>
                                    <Input 
                                        id="image-upload" 
                                        type="file" 
                                        className="hidden" 
                                        accept="image/png, image/jpeg" 
                                        onChange={handleImageChange} 
                                    />
                                </div>
                            )}
                        </div>

                        {/* Step 2: Details & Symptoms */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
                                <Label className="text-lg font-semibold">{t('new_report.step2')}</Label>
                            </div>
                            
                            <div className="space-y-4 ml-11">
                                <div className="space-y-2">
                                    <Label htmlFor="crop" className="text-sm font-medium text-gray-700">{t('new_report.crop_type')}</Label>
                                    <Select value={selectedCrop} onValueChange={setSelectedCrop}>
                                        <SelectTrigger id="crop" className="bg-white border-gray-200">
                                            <SelectValue placeholder={t('new_report.auto_detect')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Auto">{t('new_report.auto_detect')}</SelectItem>
                                            <SelectItem value="Wheat">Wheat</SelectItem>
                                            <SelectItem value="Cotton">Cotton</SelectItem>
                                            <SelectItem value="Rice">Rice</SelectItem>
                                            <SelectItem value="Sugarcane">Sugarcane</SelectItem>
                                            <SelectItem value="Maize">Maize (Corn)</SelectItem>
                                            <SelectItem value="Apple">Apple</SelectItem>
                                            <SelectItem value="Mango">Mango</SelectItem>
                                            <SelectItem value="Citrus">Citrus (Kinnow)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-gray-500">
                                        Selecting the specific crop helps the AI provide a more accurate diagnosis, especially for close-up leaf photos.
                                    </p>
                                </div>
                                
                                {fields.length > 0 && (
                                    <div className="space-y-2">
                                        <Label htmlFor="field" className="text-sm font-medium text-gray-700">Link to Field/Plot (Optional)</Label>
                                        <Select value={selectedField} onValueChange={setSelectedField}>
                                            <SelectTrigger id="field" className="bg-white border-gray-200">
                                                <SelectValue placeholder="Select a field for long-term monitoring" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">None (One-time report)</SelectItem>
                                                {fields.map(f => (
                                                    <SelectItem key={f.id} value={f.id}>{f.name} ({f.cropType})</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-gray-500">
                                            Link this report to a field to track disease progression over time.
                                        </p>
                                    </div>
                                )}
                                
                                <div className="space-y-2">
                                    <Label htmlFor="symptoms" className="text-sm font-medium text-gray-700">{t('new_report.symptoms_desc')}</Label>
                                    <Textarea
                                        id="symptoms"
                                        placeholder={t('new_report.symptoms_placeholder')}
                                        value={symptoms}
                                        onChange={(e) => setSymptoms(e.target.value)}
                                    rows={5}
                                maxLength={500}
                                    className="text-base border-2 border-gray-200 focus:border-primary transition-colors rounded-xl resize-none"
                                />
                                <div className="flex justify-between items-center text-sm">
                                    <p className="text-gray-500">Include details about affected areas, timing, and any other observations</p>
                                    <span className={`font-medium ${symptoms.length > 450 ? 'text-red-500' : 'text-gray-400'}`}>
                                        {symptoms.length} / 500
                                    </span>
                                </div>
                            </div>
                        </div>
                        </div>

                        {/* Step 3: Location */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
                                <Label className="text-lg font-semibold">{t('new_report.step3')}</Label>
                        </div>

                            <div className="flex items-center p-4 rounded-xl border-2 border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
                                <MapPin className="h-6 w-6 text-primary mr-4" />
                                <div>
                                    <p className="font-medium text-gray-900">{profile?.location || "Faisalabad, Punjab"}</p>
                                    <p className="text-sm text-gray-600">Auto-detected from your profile</p>
                                </div>
                            </div>
                        </div>

                        {/* Error Display */}
                         {error && (
                            <div className="p-4 bg-red-50 border-2 border-red-200 text-red-800 text-sm rounded-xl">
                                <div className="flex items-start gap-3">
                                    <div className="p-1 bg-red-100 rounded-full">
                                        <X className="h-4 w-4" />
                                    </div>
                                    <div>
                                <p className="font-bold">An Error Occurred</p>
                                        <p className="mt-1">{error}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Submit Button */}
                        <div className="pt-6">
                            <Button 
                                type="submit" 
                                size="lg" 
                                className="w-full bg-primary hover:bg-primary/90 text-lg py-6 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed" 
                                disabled={!imageFile || isUserLoading || loadingState !== 'idle'}
                            >
                                {loadingState === 'idle' ? (
                                    <>
                                        <Upload className="mr-2 h-5 w-5" />
                                        {t('new_report.submit')}
                                    </>
                                ) : (
                                    <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                        Processing...
                                    </>
                                )}
                        </Button>
                            
                            {!imageFile && (
                                <p className="text-center text-sm text-gray-500 mt-3">
                                    Please upload an image to continue
                                </p>
                            )}
                        </div>
                    </CardContent>
                </form>
            </Card>
        </TouchGesture>
    );
}
