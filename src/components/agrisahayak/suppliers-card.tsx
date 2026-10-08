"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, Phone, MessageCircle, Clock, Truck, Award, Users } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import LoadingSpinner from "./loading-spinner";
import ContactSupplierDialog from "./contact-supplier-dialog";
import type { Supplier, UserProfile } from "@/lib/models";
import { useAuth } from "@/firebase";
import { getProfile } from "@/lib/repositories";
import { nearbySuppliers, supplierLocationParams, validCoordinates, DEFAULT_SUPPLIER_RADIUS_KM } from "@/lib/supplier-location";

export default function SuppliersCard({ searchQuery = '', filterType = 'all' }: { searchQuery?: string; filterType?: string }) {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [radiusKm, setRadiusKm] = useState(DEFAULT_SUPPLIER_RADIUS_KM);
    const [locationLabel, setLocationLabel] = useState('');
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        let cancelled = false;
        let request = 0;
        const loadProfile = async () => {
            const current = ++request;
            setProfileLoaded(false);
            setSuppliers([]);
            setError(null);
            try {
                const value = user ? await getProfile(user.uid) : null;
                if (!cancelled && current === request) setProfile(value);
            } catch {
                if (!cancelled && current === request) {
                    setProfile(null);
                    setError('Unable to load your saved location. Please try again.');
                }
            } finally {
                if (!cancelled && current === request) setProfileLoaded(true);
            }
        };
        void loadProfile();
        window.addEventListener('profileUpdated', loadProfile);
        return () => { cancelled = true; window.removeEventListener('profileUpdated', loadProfile); };
    }, [user, retry]);

    useEffect(() => {
        if (!profileLoaded) return;
        const params = supplierLocationParams(profile);
        if (!params) { setLoading(false); return; }
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        setSuppliers([]);
        setLocationLabel('');
        params.set('radius', String(radiusKm * 1000));
        params.set('query', searchQuery.trim());
        const search = async () => {
            try {
                const response = await fetch(`/api/suppliers/real?${params}`, { signal: controller.signal });
                const data = await response.json();
                if (!response.ok || !data.success || !Array.isArray(data.suppliers) || !validCoordinates(data.location)) {
                    throw new Error(data.error || 'Nearby suppliers are temporarily unavailable. Please try again.');
                }
                if (controller.signal.aborted) return;
                setSuppliers(nearbySuppliers(data.suppliers, data.location, radiusKm));
                setLocationLabel(data.location.city || profile?.location || 'Saved location');
            } catch (cause) {
                if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to find nearby suppliers.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        void search();
        return () => controller.abort();
    }, [profileLoaded, profile, radiusKm, searchQuery]);

    const hasLocation = !!supplierLocationParams(profile);
    const visibleSuppliers = filterType === 'all' ? suppliers : suppliers.filter(supplier => supplier.type === filterType);
    const busy = !profileLoaded || loading;
    return (
        <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-blue-50/30">
            <CardHeader className="pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <span className="p-2 bg-blue-50 rounded-xl"><Truck className="h-6 w-6 text-blue-600" /></span>
                            Nearby Suppliers
                        </CardTitle>
                        <CardDescription className="mt-3 flex items-start gap-2 text-base">
                            <MapPin className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                            <span>{!profileLoaded ? 'Loading your saved location...' : locationLabel || profile?.location || (hasLocation ? 'Saved location' : 'Add your city in Profile')}</span>
                        </CardDescription>
                        <p className="mt-2 text-sm text-slate-500">Within {radiusKm} km · Nearest first · Approximate straight-line distances</p>
                        <Link href="/profile" className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-emerald-700 underline underline-offset-2">Change location</Link>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-slate-600">Distance
                            <select aria-label="Search distance" value={radiusKm} onChange={event => setRadiusKm(Number(event.target.value))} className="ms-2 min-h-11 rounded-lg border border-emerald-200 bg-white px-3 text-base">
                                <option value={10}>10 km</option><option value={25}>25 km</option><option value={50}>50 km</option>
                            </select>
                        </label>
                        {!busy && !error && <Badge variant="secondary" className="px-3 py-1 text-sm"><Users className="me-1 h-4 w-4" />{visibleSuppliers.length} found</Badge>}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6" aria-busy={busy}>
                {busy ? <div className="flex justify-center p-8"><LoadingSpinner message="Finding suppliers near your saved location..." variant="sparkle" /></div>
                : error ? <div role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-900"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => setRetry(value => value + 1)}>Try again</Button></div>
                : !hasLocation ? <div className="py-8 text-center"><p className="mb-4 text-slate-600">Save your city to see suppliers near you.</p><Button asChild><Link href="/profile">Set my location</Link></Button></div>
                : visibleSuppliers.length ? <div className="grid gap-4">{visibleSuppliers.map((supplier, index) => <SupplierCard key={supplier.id} supplier={supplier} index={index} />)}</div>
                : <div className="py-10 text-center"><Truck className="mx-auto mb-4 h-10 w-10 text-slate-400" /><p className="text-lg text-slate-600">No matching suppliers within {radiusKm} km.</p><p className="mt-2 text-sm text-slate-500">{radiusKm < 50 ? 'Choose a larger distance above, change the search, or update your location.' : 'Try another product or type, or check your saved location.'}</p></div>}
            </CardContent>
        </Card>
    );
}

const SupplierCard = ({ supplier, index }: { supplier: Supplier, index: number }) => {
    const { user } = useAuth();

    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${supplier.location.coordinates.lat},${supplier.location.coordinates.lng}`)}`;
    const phone = supplier.contact.phone?.split(/[;,]/)[0].replace(/[^+0-9]/g, '') || '';
    const whatsapp = supplier.contact.whatsapp?.replace(/[^0-9]/g, '') || '';
    const canCall = phone.replace(/\D/g, '').length >= 7;

    const getRatingColor = (rating: number) => {
        if (rating >= 4.5) return "text-green-600 bg-green-100";
        if (rating >= 4.0) return "text-blue-600 bg-blue-100";
        if (rating >= 3.5) return "text-yellow-600 bg-yellow-100";
        return "text-gray-600 bg-gray-100";
    };

    const getDistanceColor = (distance: number | undefined) => {
        if (!distance) return "text-gray-600 bg-gray-100";
        if (distance <= 5) return "text-green-600 bg-green-100";
        if (distance <= 15) return "text-blue-600 bg-blue-100";
        return "text-orange-600 bg-orange-100";
    };

    const getSupplierTypeLabel = (type: string) => {
        const typeMap: Record<string, string> = {
            'supplier': 'Supplier',
            'buyer': 'Buyer',
            'logistics': 'Logistics'
        };
        return typeMap[type] || 'Supplier';
    };

    const getRatingLabel = (rating: number) => {
        if (rating >= 4.5) return 'Excellent';
        if (rating >= 4.0) return 'Good';
        if (rating >= 3.5) return 'Fair';
        if (rating <= 0) return 'No rating';
        return 'Poor';
    };

    return (
        <div className="group border rounded-xl p-6 bg-white/80 backdrop-blur-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-300 border-gray-200">
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Supplier Info */}
                <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="font-bold text-xl text-gray-900 group-hover:text-blue-600 transition-colors">
                                {supplier.name}
                            </h3>
                            <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-emerald-700 underline underline-offset-2">{supplier.location.address || supplier.location.city} · View on map</a>
                            <div className="flex flex-wrap items-center gap-4 mt-2">
                                <div className="flex items-center gap-1">
                                    <MapPin className="h-4 w-4 text-gray-500" />
                                    <span className="text-sm text-gray-600">
                                        {supplier.distance != null ? `${supplier.distance.toFixed(1)} km away` : 'Distance unknown'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                                    <span className="text-sm font-medium">
                                        {supplier.rating && supplier.rating > 0 ? supplier.rating.toFixed(1) : 'No rating'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                            <Badge className={`px-2 py-1 text-xs ${getRatingColor(supplier.rating || 0)}`}>
                                <Award className="h-3 w-3 mr-1" />
                                {getRatingLabel(supplier.rating || 0)}
                            </Badge>
                            <Badge variant="secondary" className="px-2 py-1 text-xs">
                                {getSupplierTypeLabel(supplier.type)}
                            </Badge>
                        </div>
                    </div>

                    {/* Products */}
                    <div>
                        <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Available Products
                        </h4>
                            <div className="flex flex-wrap gap-2">
                                {(supplier.products || []).map((product, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                        {product}
                                    </Badge>
                                ))}
                            </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3 lg:w-48">
                        {canCall && <Button
                            variant="default"
                            size="sm"
                            asChild
                            className="flex-1 group-hover:bg-green-600 transition-colors"
                        >
                            <a href={`tel:${phone}`}>
                                <Phone className="mr-2 h-4 w-4" />
                                Call Now
                            </a>
                        </Button>}
                        {whatsapp.length >= 7 && <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="flex-1 group-hover:border-green-500 group-hover:text-green-600 transition-colors"
                        >
                            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                                <MessageCircle className="mr-2 h-4 w-4" />
                                WhatsApp
                            </a>
                        </Button>}
                        {whatsapp.length >= 7 && <ContactSupplierDialog
                            supplier={supplier}
                            userId={user?.uid}
                            defaultProducts={(supplier.products || []).slice(0, 1)}
                        />}
                        <Button asChild variant="outline" size="sm"><a href={mapUrl} target="_blank" rel="noopener noreferrer"><MapPin className="me-2 h-4 w-4" />View on map</a></Button>
                </div>
            </div>
        </div>
    );
}
