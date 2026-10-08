"use client";

import { useEffect, useState } from "react";
import { useAuth, useFirebase } from "@/firebase";
import { getDoc, doc, collection, query, where, getDocs } from "firebase/firestore";
import { DiagnosisReport } from "@/lib/models";
import { findTrackedPreviousReport, needsHighlightReview, isTrackedPlantReport } from "@/lib/report-utils";
import { reviewReportHighlights } from "@/lib/report-highlight-review";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import CropImageHighlights from "@/components/agrisahayak/crop-image-highlights";
import { ArrowLeft, ArrowRight, ShieldAlert, CheckCircle, Shield, Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export default function CompareReportPage() {
    const { user } = useAuth();
    const { db } = useFirebase();
    const params = useParams();
    const router = useRouter();
    const currentId = params.id as string;

    const [currentReport, setCurrentReport] = useState<DiagnosisReport | null>(null);
    const [previousReport, setPreviousReport] = useState<DiagnosisReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [highlightReviewStatus, setHighlightReviewStatus] = useState<Record<string, 'reviewing' | 'failed'>>({});

    useEffect(() => {
        if (!user || !db || !currentId) return;
        let cancelled = false;

        const loadComparison = async () => {
            try {
                // Get current report
                const currRef = doc(db, 'users', user.uid, 'reports', currentId);
                const currSnap = await getDoc(currRef);
                
                if (!currSnap.exists()) {
                    return;
                }
                
                const currData = { id: currSnap.id, ...currSnap.data() } as DiagnosisReport;
                if (cancelled) return;
                setCurrentReport(currData);
                setPreviousReport(null);
                if (!isTrackedPlantReport(currData)) {
                    router.replace(`/report/${currentId}`);
                    return;
                }
                if (currData.status !== 'Complete') return;

                // Find previous report for the same crop (and field if we have it)
                const reportsRef = collection(db, 'users', user.uid, 'reports');
                let q;
                if (currData.fieldId) {
                    q = query(reportsRef, where('fieldId', '==', currData.fieldId));
                } else if (currData.crop) {
                    q = query(reportsRef, where('crop', '==', currData.crop));
                } else {
                    // Cannot find previous if no crop or field
                    setLoading(false);
                    return;
                }

                const querySnapshot = await getDocs(q);
                const candidates = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as DiagnosisReport));
                const previous = findTrackedPreviousReport(candidates, currData);
                if (cancelled) return;
                setPreviousReport(previous);

                for (const candidate of [currData, previous].filter((item): item is DiagnosisReport => Boolean(item))) {
                    if (!needsHighlightReview(candidate)) continue;
                    setHighlightReviewStatus(status => ({ ...status, [candidate.id]: 'reviewing' }));
                    void (async () => {
                        try {
                            const refreshed = await reviewReportHighlights(user.uid, candidate);
                            if (cancelled) return;
                            if (refreshed && candidate.id === currData.id) setCurrentReport(refreshed);
                            if (refreshed && candidate.id === previous?.id) setPreviousReport(refreshed);
                            setHighlightReviewStatus(status => {
                                const next = { ...status };
                                delete next[candidate.id];
                                return next;
                            });
                        } catch (localizationError) {
                            console.warn(`Could not review saved image highlights for ${candidate.id}:`, localizationError);
                            setHighlightReviewStatus(status => ({ ...status, [candidate.id]: 'failed' }));
                        }
                    })();
                }
            } catch (err) {
                console.error("Failed to load comparison", err);
            } finally {
                setLoading(false);
            }
        };

        loadComparison();
        return () => { cancelled = true; };
    }, [user, db, currentId, router]);

    if (loading || (currentReport && !isTrackedPlantReport(currentReport))) {
        return <div className="p-12 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
    }

    if (!currentReport) {
        return <div className="p-12 text-center text-red-500">Report not found.</div>;
    }

    const getHealthBadge = (report: DiagnosisReport) => {
        const isHealthy = report.disease?.toLowerCase().includes("healthy") || report.severity === "None";
        if (isHealthy) return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-4 h-4 mr-1"/> Healthy</Badge>;
        if (report.severity === "High") return <Badge variant="destructive" className="bg-red-500"><ShieldAlert className="w-4 h-4 mr-1"/> At Risk</Badge>;
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800"><Shield className="w-4 h-4 mr-1"/> Diseased</Badge>;
    };

    const getTrendIcon = () => {
        if (!previousReport) return null;
        const severityScores = { "None": 0, "Low": 1, "Medium": 2, "High": 3 };
        const currScore = severityScores[currentReport.severity || "None"] || 0;
        const prevScore = severityScores[previousReport.severity || "None"] || 0;

        if (currScore < prevScore) return <div className="flex items-center text-green-600 bg-green-50 px-3 py-1 rounded-full"><TrendingDown className="w-4 h-4 mr-2" /> Improving</div>;
        if (currScore > prevScore) return <div className="flex items-center text-red-600 bg-red-50 px-3 py-1 rounded-full"><TrendingUp className="w-4 h-4 mr-2" /> Worsening</div>;
        return <div className="flex items-center text-gray-600 bg-gray-50 px-3 py-1 rounded-full"><Minus className="w-4 h-4 mr-2" /> Unchanged</div>;
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-12">
            <div className="flex items-center gap-4">
                <Button asChild variant="ghost" size="sm">
                    <Link href={`/report/${currentId}`}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Report
                    </Link>
                </Button>
                <h1 className="text-3xl font-bold font-headline">Crop Monitor Comparison</h1>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h2 className="text-xl font-semibold">Trend Analysis for {currentReport.crop || "Crop"}</h2>
                    <p className="text-gray-500">Tracking long-term health changes</p>
                </div>
                {getTrendIcon()}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* PREVIOUS REPORT */}
                <Card className="border-2 border-gray-100 opacity-80">
                    <CardHeader className="bg-gray-50 pb-4">
                        <Badge variant="outline" className="w-fit mb-2">Previous Report</Badge>
                        {previousReport ? (
                            <>
                                <CardTitle className="text-xl">{previousReport.disease}</CardTitle>
                                <div className="flex items-center text-sm text-gray-500 mt-2">
                                    <Calendar className="w-4 h-4 mr-2"/>
                                    {new Date(previousReport.createdAt).toLocaleDateString()}
                                </div>
                            </>
                        ) : (
                            <CardTitle className="text-xl text-gray-400">No Previous Data</CardTitle>
                        )}
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        {previousReport ? (
                            <>
                                {(previousReport.imageUrl || previousReport.imageThumb) && (
                                    <div className="relative w-full rounded-lg overflow-hidden">
                                        <CropImageHighlights
                                            src={(previousReport.imageUrl || previousReport.imageThumb) as string}
                                            alt="Previous crop image"
                                            highlights={previousReport.visualHighlights || []}
                                            showReviewingState={highlightReviewStatus[previousReport.id] === 'reviewing'}
                                            showReviewFailedState={highlightReviewStatus[previousReport.id] === 'failed'}
                                            showEmptyState={previousReport.visualHighlightsReviewed === true && previousReport.severity !== 'None' && !/healthy|not a crop|not a plant/i.test(previousReport.disease || '')}
                                            className="overflow-hidden rounded-lg"
                                        />
                                    </div>
                                )}
                                <div>
                                    <h4 className="font-semibold mb-2 text-gray-500 text-sm uppercase">Health Status</h4>
                                    {getHealthBadge(previousReport)}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <h4 className="font-semibold mb-1 text-gray-500 text-sm uppercase">Severity</h4>
                                        <p className="font-medium">{previousReport.severity}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold mb-1 text-gray-500 text-sm uppercase">Confidence</h4>
                                        <p className="font-medium">{previousReport.confidence}%</p>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-semibold mb-1 text-gray-500 text-sm uppercase">Previous Treatment</h4>
                                    <p className="text-sm line-clamp-3">
                                        {previousReport.plan?.steps?.map(s => s.title).join(", ") || "No treatment recommended."}
                                    </p>
                                </div>
                                <Button asChild variant="outline" className="w-full">
                                    <Link href={`/report/${previousReport.id}`}>View Old Report</Link>
                                </Button>
                            </>
                        ) : (
                            <p className="text-gray-400 text-center py-12">
                                This is your first report for this crop/field. Future reports will be compared against this one.
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* CURRENT REPORT */}
                <Card className="border-2 border-primary/20 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 pointer-events-none" />
                    <CardHeader className="bg-primary/5 pb-4">
                        <Badge className="w-fit mb-2 bg-primary text-white">Current Report</Badge>
                        <CardTitle className="text-xl">{currentReport.disease}</CardTitle>
                        <div className="flex items-center text-sm text-gray-700 mt-2 font-medium">
                            <Calendar className="w-4 h-4 mr-2 text-primary"/>
                            {new Date(currentReport.createdAt).toLocaleDateString()}
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        {(currentReport.imageUrl || currentReport.imageThumb) && (
                            <div className="relative w-full rounded-lg overflow-hidden border border-gray-200">
                                <CropImageHighlights
                                    src={(currentReport.imageUrl || currentReport.imageThumb) as string}
                                    alt="Current crop image"
                                    highlights={currentReport.visualHighlights || []}
                                    showReviewingState={highlightReviewStatus[currentReport.id] === 'reviewing'}
                                    showReviewFailedState={highlightReviewStatus[currentReport.id] === 'failed'}
                                    showEmptyState={currentReport.visualHighlightsReviewed === true && currentReport.severity !== 'None' && !/healthy|not a crop|not a plant/i.test(currentReport.disease || '')}
                                    className="overflow-hidden rounded-lg"
                                />
                            </div>
                        )}
                        <div>
                            <h4 className="font-semibold mb-2 text-gray-500 text-sm uppercase">Health Status</h4>
                            {getHealthBadge(currentReport)}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="font-semibold mb-1 text-gray-500 text-sm uppercase">Severity</h4>
                                <p className="font-medium text-lg">{currentReport.severity}</p>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-1 text-gray-500 text-sm uppercase">Confidence</h4>
                                <p className="font-medium text-lg">{currentReport.confidence}%</p>
                            </div>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-1 text-gray-500 text-sm uppercase">Current Treatment</h4>
                            <p className="text-sm">
                                {currentReport.plan?.steps?.map(s => s.title).join(", ") || "No treatment recommended."}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
