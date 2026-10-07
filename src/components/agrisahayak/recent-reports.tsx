
"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { DiagnosisReport } from "@/lib/models";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Clock, AlertCircle, CheckCircle, Loader2, RefreshCw, Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/firebase";
import { getProfile, listRecentReports, updateReport, createLog } from "@/lib/repositories";
import { instantDiagnosisFromImageAndSymptoms } from "@/ai/flows/instant-diagnosis-from-image-and-symptoms";

import LoadingSpinner from "./loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { deleteField } from "firebase/firestore";
import { isPlanEligible } from "@/lib/report-utils";
import { sendDiagnosisComplete } from "@/lib/notifications";

/** Safely format a date from Firestore Timestamp OR ISO string */
function formatDate(d: any): string {
    if (!d) return 'Unknown';
    // Firestore Timestamp object
    if (typeof d?.toDate === 'function') {
        return d.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    // ISO string or any string parseable by Date
    if (typeof d === 'string') {
        const parsed = new Date(d);
        if (!isNaN(parsed.getTime())) {
            return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        }
    }
    // Number timestamp
    if (typeof d === 'number') {
        return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    return 'Unknown';
}

interface RecentReportsProps {
    reports: DiagnosisReport[];
    setReports: React.Dispatch<React.SetStateAction<DiagnosisReport[]>>;
    loading: boolean;
}

export default function RecentReports({ reports, setReports, loading }: RecentReportsProps) {
    const { user } = useAuth();
    const [retryingReports, setRetryingReports] = useState<Set<string>>(new Set());
    const [visibleCount, setVisibleCount] = useState(5); // Track visible reports for step-pagination
    const [profile, setProfile] = useState<any>(null);
    const { toast } = useToast();

    useEffect(() => {
        if (user) {
            getProfile(user.uid).then(setProfile);
        }
    }, [user]);

    // Show reports based on visibleCount
    const displayedReports = reports.slice(0, visibleCount);

    const getStatusVariant = (status: DiagnosisReport['status']) => {
        switch (status) {
            case 'Complete': return 'default';
            case 'Processing': return 'secondary';
            case 'Error': return 'destructive';
            case 'Pending': return 'outline';
            default: return 'outline';
        }
    };

    const getStatusIcon = (status: DiagnosisReport['status']) => {
        switch (status) {
            case 'Complete': return <CheckCircle className="h-4 w-4" />;
            case 'Processing': return <Loader2 className="h-4 w-4 animate-spin" />;
            case 'Error': return <AlertCircle className="h-4 w-4" />;
            case 'Pending': return <Clock className="h-4 w-4" />;
            default: return <Clock className="h-4 w-4" />;
        }
    };

    const getDiagnosisDisplay = (report: DiagnosisReport) => {
        if (report.status === 'Complete' && report.disease) {
            return report.disease;
        } else if (report.status === 'Processing') {
            return (
                <div className="flex items-center gap-2 text-blue-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing...</span>
                </div>
            );
        } else if (report.status === 'Error') {
            return (
                <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    <span>Failed</span>
                </div>
            );
        } else if (report.status === 'Pending') {
            return (
                <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="h-4 w-4" />
                    <span>Queued</span>
                </div>
            );
        }
        return (
            <div className="flex items-center gap-2 text-gray-500">
                <Clock className="h-4 w-4" />
                <span>Pending</span>
            </div>
        );
    };

    const getCropDisplay = (report: DiagnosisReport) => {
        if (report.crop && report.crop !== 'Unknown' && report.crop !== 'Crop to be identified') {
            return (
                <div className="flex items-center gap-2">
                    <span className="font-medium">{report.crop}</span>
                    {report.status === 'Complete' && (
                        <Badge variant="default" className="text-xs bg-green-100 text-green-700">
                            Identified
                        </Badge>
                    )}
                </div>
            );
        }
        return (
            <div className="flex items-center gap-2">
                <span className="text-gray-500 italic">
                    {report.status === 'Processing' ? 'Identifying crop...' : 'Crop not identified'}
                </span>
                {report.status === 'Processing' && (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                )}
                {report.status === 'Complete' && (
                    <Badge variant="outline" className="text-xs">
                        Auto-detect
                    </Badge>
                )}
            </div>
        );
    };

    const handleRetryDiagnosis = async (report: DiagnosisReport) => {
        if (!user || !report.imageUrl && !report.imageThumb) {
            toast({
                title: "Cannot Retry",
                description: "No image available for diagnosis retry.",
                variant: "destructive"
            });
            return;
        }

        setRetryingReports(prev => new Set(prev).add(report.id));

        try {
            // Update report status to Processing
            await updateReport(user.uid, report.id, { status: 'Processing' });
            
            // Get image data
            const imageSrc = report.imageUrl || report.imageThumb;
            if (!imageSrc) throw new Error('No image available');

            let photoDataUri: string;
            if (imageSrc.startsWith('data:')) {
                photoDataUri = imageSrc;
            } else {
                // Convert URL to data URI
                const response = await fetch(imageSrc);
                const blob = await response.blob();
                photoDataUri = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            }

            // Create a 30-second timeout promise
            const timeoutPromise = new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error("Diagnosis request timed out after 30 seconds. Please try again.")), 30000)
            );

            // Run AI diagnosis with timeout
            const diagnosis = await Promise.race([
                instantDiagnosisFromImageAndSymptoms({
                    photoDataUri,
                    symptoms: report.symptoms || '',
                    language: profile?.language || 'english'
                }),
                timeoutPromise
            ]);

            const isNotCrop = diagnosis.disease?.toLowerCase().includes('not a crop');
            const planEligible = isPlanEligible({
                ...diagnosis,
                status: 'Complete',
                imageUrl: imageSrc,
            });
            
            // Update report with new diagnosis
            await updateReport(user.uid, report.id, {
                crop: diagnosis.crop,
                disease: diagnosis.disease,
                confidence: diagnosis.confidence,
                affectedParts: diagnosis.affectedParts,
                severity: diagnosis.severity,
                description: diagnosis.description,
                visualHighlights: diagnosis.visualHighlights,
                visualHighlightsReviewed: false,
                visualHighlightsReviewVersion: 0,
                expertReviewRequired: diagnosis.expertReviewRequired,
                plan: deleteField(),
                protectionPlan: deleteField(),
                status: isNotCrop ? 'Complete' : 'Processing'
            } as any);

            let plan: any = null;

            if (!isNotCrop) {
                // Use the plan already included in the diagnosis response
                plan = diagnosis.plan || null;

                // Complete the report
                await updateReport(user.uid, report.id, {
                    plan: planEligible && plan ? plan : deleteField(),
                    protectionPlan: planEligible && diagnosis.protectionPlan ? diagnosis.protectionPlan : deleteField(),
                    status: 'Complete'
                } as any);
            }

            sendDiagnosisComplete(
                user.uid,
                report.id,
                diagnosis.crop,
                diagnosis.disease,
                diagnosis.severity,
                diagnosis.confidence
            ).catch(console.warn);

            // Log the retry
            await createLog({
                agentName: 'diagnosticAgent',
                action: 'retry_completed',
                reportId: report.id,
                status: 'success',
                payload: diagnosis
            });

            // Update local state
            setReports(prev => prev.map(r => 
                r.id === report.id 
                    ? {
                        ...r,
                        ...diagnosis,
                        plan: planEligible ? plan : null,
                        protectionPlan: planEligible ? diagnosis.protectionPlan : undefined,
                        status: 'Complete' as const,
                    }
                    : r
            ));

            toast({
                title: "Diagnosis Retry Successful!",
                description: `AI has successfully analyzed your ${diagnosis.crop} crop.`,
                className: "bg-green-100 text-green-800"
            });

        } catch (error: any) {
            console.error('Retry diagnosis failed:', error);
            
            await updateReport(user.uid, report.id, { status: 'Error' });
            await createLog({
                agentName: 'diagnosticAgent',
                action: 'retry_failed',
                reportId: report.id,
                status: 'error',
                payload: { error: error.message }
            });

            toast({
                title: "Retry Failed",
                description: "Could not complete diagnosis retry. Please try again later.",
                variant: "destructive"
            });
        } finally {
            setRetryingReports(prev => {
                const newSet = new Set(prev);
                newSet.delete(report.id);
                return newSet;
            });
        }
    };

    return (
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-emerald-50 border-b border-primary/10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <CheckCircle className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl text-gray-900">Recent Reports</CardTitle>
                            <CardDescription className="text-base">Your latest crop diagnosis reports and their status</CardDescription>
                        </div>
                    </div>
                    {reports.length > 0 && (
                        <div className="text-right">
                            <p className="text-sm text-gray-600">
                                {reports.filter(r => r.status === 'Complete').length} completed
                            </p>
                            <p className="text-xs text-gray-500">
                                {reports.filter(r => r.status === 'Processing').length} processing
                                {reports.filter(r => r.status === 'Error' || r.status === 'Pending').length > 0 && (
                                    <span className="text-amber-600 ms-2">
                                        • {reports.filter(r => r.status === 'Error' || r.status === 'Pending').length} can retry
                                    </span>
                                )}
                            </p>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                     <div className="flex items-center justify-center p-8">
                        <LoadingSpinner message="Loading recent reports..." />
                    </div>
                ) : reports.length > 0 ? (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[80px]">Image</TableHead>
                                    <TableHead>Crop</TableHead>
                                    <TableHead className="hidden md:table-cell">Diagnosis</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {displayedReports.map((report) => (
                                <TableRow key={report.id} className="hover:bg-gray-50/50">
                                    <TableCell>
                                        <div className="relative">
                                            <img
                                                src={report.imageUrl || report.imageThumb || "https://picsum.photos/seed/placeholder/100/100"}
                                                alt={report.crop || "Crop image"}
                                                width={60}
                                                height={60}
                                                className="rounded-lg object-cover border border-gray-200"
                                                data-ai-hint="crop plant"
                                            />
                                            {report.status === 'Processing' && (
                                                <div className="absolute inset-0 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {getCropDisplay(report)}
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell">
                                        {getDiagnosisDisplay(report)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge 
                                            variant={getStatusVariant(report.status)} 
                                            className="flex items-center gap-1 w-fit"
                                        >
                                            {getStatusIcon(report.status)}
                                            {report.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell text-sm text-gray-600 font-medium">
                                        {formatDate(report.createdAt)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center gap-2">
                                            {/* Retry Button for Failed/Incomplete Reports */}
                                            {(report.status === 'Error' || report.status === 'Pending') && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleRetryDiagnosis(report)}
                                                    disabled={retryingReports.has(report.id)}
                                                    className="hover:bg-primary/10 hover:text-primary hover:border-primary"
                                                >
                                                    {retryingReports.has(report.id) ? (
                                                        <>
                                                            <Loader2 className="h-3 w-3 animate-spin me-1" />
                                                            Retrying...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <RefreshCw className="h-3 w-3 me-1" />
                                                            Retry AI
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                            
                                            {/* View Button */}
                                            <Button 
                                                asChild 
                                                variant="ghost" 
                                                size="sm" 
                                                className={cn(
                                                    report.status === 'Complete' && "hover:bg-green-50 hover:text-green-700",
                                                    report.status === 'Processing' && "hover:bg-blue-50 hover:text-blue-700",
                                                    report.status === 'Error' && "hover:bg-red-50 hover:text-red-700"
                                                )}
                                            >
                                                <Link href={`/report/${report.id}`}>
                                                    {report.status === 'Complete' && (
                                                        <>
                                                            <CheckCircle className="h-3 w-3 me-1" />
                                                            View Results
                                                        </>
                                                    )}
                                                    {report.status === 'Processing' && (
                                                        <>
                                                            <Loader2 className="h-3 w-3 animate-spin me-1" />
                                                            View Progress
                                                        </>
                                                    )}
                                                    {report.status === 'Error' && (
                                                        <>
                                                            <AlertCircle className="h-3 w-3 me-1" />
                                                            View Details
                                                        </>
                                                    )}
                                                    {report.status === 'Pending' && (
                                                        <>
                                                            <Clock className="h-3 w-3 me-1" />
                                                            View Details
                                                        </>
                                                    )}
                                                </Link>
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    
                    {/* View All / Show Less Button */}
                    {reports.length > 5 && visibleCount < reports.length && (
                        <div className="mt-4 text-center">
                            <Button
                                variant="outline"
                                onClick={() => setVisibleCount(prev => prev + 5)}
                                className="w-full md:w-auto"
                            >
                                Load More
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ms-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </Button>
                        </div>
                    )}
                    {reports.length > 5 && visibleCount >= reports.length && (
                        <div className="mt-4 text-center">
                            <Button
                                variant="outline"
                                onClick={() => setVisibleCount(5)}
                                className="w-full md:w-auto"
                            >
                                Show Less
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ms-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                            </Button>
                        </div>
                    )}
                    </>
                ) : (
                    <div className="text-center py-16">
                        <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                            <CheckCircle className="h-12 w-12 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Reports Yet</h3>
                        <p className="text-gray-600 mb-6 max-w-md mx-auto">
                            Start by uploading a photo of your crop to get your first AI-powered diagnosis.
                        </p>
                        <Button asChild size="lg" className="bg-primary hover:bg-primary/90">
                            <Link href="/report/new">
                                <CheckCircle className="me-2 h-5 w-5" />
                                Create Your First Diagnosis
                            </Link>
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
