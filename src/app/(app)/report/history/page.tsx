"use client";

import { isTrackedPlantReport } from "@/lib/report-utils";

import { useEffect, useState } from "react";
import { useAuth } from "@/firebase";
import { listRecentReports } from "@/lib/repositories";
import { DiagnosisReport } from "@/lib/models";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import Image from "next/image";
import { Calendar, Search, ArrowRight, ShieldAlert, CheckCircle, Shield } from "lucide-react";

export default function ReportHistoryPage() {
    const { user } = useAuth();
    const [reports, setReports] = useState<DiagnosisReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("All");
    const [sortOrder, setSortOrder] = useState("Newest");

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        listRecentReports(user.uid, 100).then(data => {
            setReports(data);
            setLoading(false);
        }).catch(err => {
            console.error("Failed to load history", err);
            setLoading(false);
        });
    }, [user]);

    const getSeverityVariant = (severity?: string) => {
        if (!severity) return 'default';
        if (severity === 'High') return 'destructive';
        if (severity === 'Medium') return 'secondary';
        if (severity === 'None') return 'outline';
        return 'default';
    };

    const getHealthBadge = (report: DiagnosisReport) => {
        const isHealthy = report.disease?.toLowerCase().includes("healthy") || report.severity === "None";
        if (isHealthy) {
            return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1"/> Healthy</Badge>;
        }
        if (report.severity === "High") {
            return <Badge variant="destructive" className="bg-red-500"><ShieldAlert className="w-3 h-3 mr-1"/> At Risk</Badge>;
        }
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800"><Shield className="w-3 h-3 mr-1"/> Diseased</Badge>;
    };

    const filteredReports = reports.filter(report => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const matchesDisease = report.disease?.toLowerCase().includes(term);
            const matchesCrop = report.crop?.toLowerCase().includes(term);
            if (!matchesDisease && !matchesCrop) return false;
        }
        
        if (filterStatus !== "All") {
            const isHealthy = report.disease?.toLowerCase().includes("healthy") || report.severity === "None";
            if (filterStatus === "Healthy" && !isHealthy) return false;
            if (filterStatus === "At Risk" && report.severity !== "High") return false;
            if (filterStatus === "Diseased" && (isHealthy || report.severity === "High")) return false;
        }
        return true;
    }).sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === "Newest" ? dateB - dateA : dateA - dateB;
    });

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-12">
            <div className="flex justify-between items-end flex-wrap gap-4">
                <div>
                    <h1 className="text-4xl font-bold font-headline">Report History</h1>
                    <p className="text-gray-500 mt-2">View and filter your past crop diagnosis reports.</p>
                </div>
                <Button asChild>
                    <Link href="/report/new">New Diagnosis</Link>
                </Button>
            </div>

            <Card className="border-0 shadow-md">
                <CardContent className="p-4 flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                        <Input 
                            placeholder="Search by crop or disease..." 
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Health Status</SelectItem>
                            <SelectItem value="Healthy">Healthy</SelectItem>
                            <SelectItem value="At Risk">At Risk (High)</SelectItem>
                            <SelectItem value="Diseased">Diseased (Low/Med)</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={sortOrder} onValueChange={setSortOrder}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Newest">Newest First</SelectItem>
                            <SelectItem value="Oldest">Oldest First</SelectItem>
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {loading ? (
                <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : filteredReports.length === 0 ? (
                <Card className="text-center p-12 text-gray-500">
                    <p>No reports found matching your criteria.</p>
                </Card>
            ) : (
                <div className="relative border-l-2 border-gray-100 ml-4 pl-6 space-y-8">
                    {filteredReports.map(report => (
                        <div key={report.id} className="relative">
                            <div className="absolute -left-[35px] top-4 w-4 h-4 rounded-full bg-white border-4 border-primary" />
                            <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                                <div className="flex flex-col sm:flex-row">
                                    <div className="sm:w-48 bg-gray-100 relative min-h-[120px]">
                                        {report.imageThumb && (
                                            <Image 
                                                src={report.imageThumb} 
                                                alt="Crop" 
                                                fill 
                                                className="object-cover"
                                                unoptimized
                                            />
                                        )}
                                    </div>
                                    <div className="p-5 flex-1 flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                                                <div>
                                                    <h3 className="font-bold text-xl">{report.disease}</h3>
                                                    <p className="text-sm text-gray-500 font-medium">{report.crop || "Unknown Crop"}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    {getHealthBadge(report)}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
                                                <div>
                                                    <span className="text-gray-400 block mb-1">Confidence</span>
                                                    <span className="font-semibold">{report.confidence}%</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-400 block mb-1">Severity</span>
                                                    <Badge variant={getSeverityVariant(report.severity)} className="text-xs">{report.severity}</Badge>
                                                </div>
                                                <div>
                                                    <span className="text-gray-400 block mb-1">Date</span>
                                                    <span className="flex items-center gap-1 text-gray-700">
                                                        <Calendar className="w-3 h-3"/> 
                                                        {new Date(report.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-4 pt-4 border-t flex justify-between items-center">
                                            <span className="text-xs text-gray-400 font-mono">ID: {report.id.substring(0,8)}...</span>
                                            <div className="flex gap-2">
                                                {isTrackedPlantReport(report) && <Button asChild size="sm" variant="outline">
                                                    <Link href={`/report/${report.id}/compare`}>Compare</Link>
                                                </Button>}
                                                <Button asChild size="sm">
                                                    <Link href={`/report/${report.id}`}>
                                                        View Full Details <ArrowRight className="w-4 h-4 ml-2" />
                                                    </Link>
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
