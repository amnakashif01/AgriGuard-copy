
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Activity, Users, FileCheck, Clock, RefreshCw, Shield, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { subscribeAdminActivity } from "@/lib/admin-activity";
import { AdminLog } from "@/lib/models";
import LoadingSpinner from "@/components/agrisahayak/loading-spinner";
import { useAuth } from "@/firebase";
import Link from "next/link";


export default function AdminPage() {
    const { user, isAdmin, isUserLoading, hasGlobalAdminAccess } = useAuth();
    const [logs, setLogs] = useState<AdminLog[]>([]);
    const [chartData, setChartData] = useState<{date: string, reports: number}[]>([]);
    const [adminStats, setAdminStats] = useState<{totalReportsToday: number, activeUsers: number, avgConfidence: string, avgResponseTime: string}>({
        totalReportsToday: 0, activeUsers: 0, avgConfidence: '—', avgResponseTime: '—'
    });
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isUserLoading) return;
        if (!user || !isAdmin) { setLoading(false); return; }
        setLoading(true);
        setError(null);
        setLogs([]);
        setChartData([]);
        setAdminStats({ totalReportsToday: 0, activeUsers: 0, avgConfidence: '—', avgResponseTime: '—' });
        return subscribeAdminActivity(user.uid, hasGlobalAdminAccess, snapshot => {
            setLogs(snapshot.logs);
            setChartData(snapshot.chartData);
            setAdminStats(snapshot.stats);
            setLoading(false);
        }, message => { setError(message); setLoading(false); });
    }, [user?.uid, isAdmin, isUserLoading, hasGlobalAdminAccess, refreshKey]);

    // ── ACCESS DENIED for non-admin users ──────────────────────────────────
    if (!isUserLoading && !isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
                <div className="p-6 bg-red-50 rounded-3xl border-2 border-red-100">
                    <Lock className="h-16 w-16 text-red-400 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-center text-red-700">Access Denied</h1>
                    <p className="text-red-500 text-center mt-2 max-w-sm">
                        You do not have permission to access the Admin Dashboard.
                        This area is restricted to administrators only.
                    </p>
                    <div className="mt-6 flex justify-center">
                        <Button asChild variant="outline" className="border-red-200 text-red-700 hover:bg-red-50">
                            <Link href="/dashboard">← Back to Dashboard</Link>
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const getStatusVariant = (status: 'success' | 'error' | 'info') => {
        switch(status) {
            case 'success': return 'default';
            case 'error': return 'destructive';
            case 'info': return 'secondary';
            default: return 'outline';
        }
    };

    /** Safely format a timestamp from Firestore Timestamp OR ISO string */
    const formatTimestamp = (ts: any): string => {
        if (!ts) return 'Unknown';
        if (typeof ts?.toDate === 'function') {
            return ts.toDate().toLocaleString();
        }
        if (typeof ts === 'string') {
            const parsed = new Date(ts);
            if (!isNaN(parsed.getTime())) {
                return parsed.toLocaleString();
            }
        }
        if (typeof ts === 'number') {
            return new Date(ts).toLocaleString();
        }
        return 'Unknown';
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow">
                        <Shield className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold font-headline">Admin Dashboard</h1>
                        <p className="text-sm text-muted-foreground">{hasGlobalAdminAccess ? 'Live project activity' : 'Live activity for this demo account'}</p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRefreshKey(key => key + 1)}
                    disabled={loading}
                    className="gap-2"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Refreshing...' : 'Refresh'}
                </Button>
            </div>

            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
            {!hasGlobalAdminAccess && <p className="text-sm text-muted-foreground">These figures show this account’s saved reports and activity. Project-wide data requires a verified administrator account.</p>}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                    title="Total Reports Today"
                    value={loading ? '...' : String(adminStats.totalReportsToday)}
                    icon={<FileCheck className="h-5 w-5 text-muted-foreground"/>}
                />
                <MetricCard
                    title={hasGlobalAdminAccess ? "Registered Users" : "Accounts in View"}
                    value={loading ? '...' : String(adminStats.activeUsers)}
                    icon={<Users className="h-5 w-5 text-muted-foreground"/>}
                />
                <MetricCard
                    title="Avg. Confidence Score"
                    value={loading ? '...' : adminStats.avgConfidence}
                    icon={<Activity className="h-5 w-5 text-muted-foreground"/>}
                />
                <MetricCard
                    title="Avg. Response Time"
                    value={loading ? '...' : adminStats.avgResponseTime}
                    icon={<Clock className="h-5 w-5 text-muted-foreground"/>}
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Reports Per Day</CardTitle>
                    <CardDescription>A chart showing the number of diagnosis reports created over the last week (real-time data).</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip contentStyle={{backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                                <Line type="monotone" dataKey="reports" stroke="hsl(var(--primary))" strokeWidth={2} activeDot={{ r: 8 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Agent Activity Logs</CardTitle>
                    <CardDescription>Live agent activity and saved report status.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center p-8">
                            <LoadingSpinner message="Loading logs..." />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex items-center justify-center p-12 text-muted-foreground bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                            <p>No agent activity found.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Agent</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Report ID</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Duration (ms)</TableHead>
                                    <TableHead>Timestamp</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.map(log => (
                                    <TableRow key={log.id}>
                                        <TableCell className="font-medium">{log.agentName}</TableCell>
                                        <TableCell>{log.action}</TableCell>
                                        <TableCell>{log.reportId || 'N/A'}</TableCell>
                                        <TableCell>
                                            <Badge variant={getStatusVariant(log.status)}>{log.status}</Badge>
                                        </TableCell>
                                        <TableCell>{log.duration ?? '-'}</TableCell>
                                        <TableCell>{formatTimestamp(log.timestamp)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function MetricCard({title, value, icon}: {title: string, value: string, icon: React.ReactNode}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                {icon}
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
            </CardContent>
        </Card>
    );
}
