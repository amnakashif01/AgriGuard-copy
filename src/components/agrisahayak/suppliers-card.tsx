"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, Phone, MessageCircle, Clock, Truck, Award, Users, LocateFixed, Leaf, Store } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import LoadingSpinner from "./loading-spinner";
import ContactSupplierDialog from "./contact-supplier-dialog";
import type { Supplier, UserProfile } from "@/lib/models";
import { useAuth } from "@/firebase";
import { getProfile } from "@/lib/repositories";
import { nearbySuppliers, supplierLocationParams, validCoordinates, getCurrentSupplierLocation, DEFAULT_SUPPLIER_RADIUS_KM, type Coordinates } from "@/lib/supplier-location";

import { recommendSuppliers } from "@/lib/supplier-recommendations";

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
    const [currentLocation, setCurrentLocation] = useState<(Coordinates & { accuracy: number }) | null>(null);
    const [locating, setLocating] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [directoryUpdatedAt, setDirectoryUpdatedAt] = useState<string | null>(null);
    const locationRequest = useRef(0);

    useEffect(() => {
        setCurrentLocation(null);
        setLocationError(null);
        setLocating(false);
        return () => { locationRequest.current += 1; };
    }, [user?.uid]);

    const useMyLocation = async () => {
        const request = ++locationRequest.current;
        setLocating(true);
        setLocationError(null);
        setSuppliers([]);
        try {
            const point = await getCurrentSupplierLocation(navigator.geolocation);
            if (request !== locationRequest.current) return;
            setLocationLabel('');
            setCurrentLocation(point);
        } catch (cause) {
            if (request === locationRequest.current) setLocationError(cause instanceof Error ? cause.message : 'Unable to find your location.');
        } finally {
            if (request === locationRequest.current) setLocating(false);
        }
    };

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
        if (locating || (!profileLoaded && !currentLocation)) return;
        const params = supplierLocationParams(profile, currentLocation);
        if (!params) { setLoading(false); setSuppliers([]); setLocationLabel(''); return; }
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        setSuppliers([]);
        setLocationLabel('');
        setWarnings([]);
        setDirectoryUpdatedAt(null);
        params.set('radius', String(radiusKm * 1000));
        params.set('query', searchQuery.trim());
        const search = async () => {
            try {
                const idToken = user ? await user.getIdToken() : undefined;
                if (controller.signal.aborted) return;
                const response = await fetch(`/api/suppliers/real?${params}`, {
                    signal: controller.signal,
                    headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
                });
                const data = await response.json();
                if (!response.ok || !data.success || !Array.isArray(data.suppliers) || !validCoordinates(data.location)) {
                    throw new Error(data.error || 'Nearby suppliers are temporarily unavailable. Please try again.');
                }
                if (controller.signal.aborted) return;
                setSuppliers(nearbySuppliers(data.suppliers, data.location, radiusKm));
                setLocationLabel(data.location.city || 'Saved location');
                setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
                setDirectoryUpdatedAt(typeof data.directoryUpdatedAt === 'string' ? data.directoryUpdatedAt : null);
            } catch (cause) {
                if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to find nearby suppliers.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        void search();
        return () => controller.abort();
    }, [profileLoaded, profile, radiusKm, searchQuery, currentLocation, locating, retry, user]);

    const hasLocation = !!supplierLocationParams(profile, currentLocation);
    const visibleSuppliers = filterType === 'all' ? suppliers : suppliers.filter(supplier => supplier.type === filterType);
    const recommendations = recommendSuppliers(visibleSuppliers, radiusKm, profile?.crops || []);
    const busy = locating || (!profileLoaded && !currentLocation) || loading;
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
                            <span>{locating ? 'Finding your current location...' : currentLocation ? locationLabel || 'Current location' : !profileLoaded ? 'Loading your saved location...' : locationLabel || profile?.location || (hasLocation ? 'Saved location' : 'Choose your location')}</span>
                        </CardDescription>
                        <p className="mt-2 text-sm text-slate-500">Within {radiusKm} km of your location · Nearest first</p>
                        <p className="mt-1 text-xs text-slate-500">Approximate straight-line distances{currentLocation ? ` · Device accuracy about ${Math.max(1, Math.round(currentLocation.accuracy))} m` : ' · From your saved city centre'}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <Button type="button" onClick={useMyLocation} disabled={locating} className="min-h-11"><LocateFixed className="me-2 h-4 w-4" />{locating ? 'Locating...' : 'Use My Location'}</Button>
                            {currentLocation && <Button type="button" variant="outline" className="min-h-11" onClick={() => { locationRequest.current += 1; setLocating(false); setCurrentLocation(null); setLocationLabel(''); setLocationError(null); }}>Use saved city</Button>}
                            <Link href="/profile" className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700 underline underline-offset-2">Change saved city</Link>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">Your browser will ask permission. Your profile location stays unchanged.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-slate-600">Distance
                            <select aria-label="Search distance" value={radiusKm} onChange={event => setRadiusKm(Number(event.target.value))} className="ms-2 min-h-11 rounded-lg border border-emerald-200 bg-white px-3 text-base">
                                <option value={10}>10 km</option><option value={15}>15 km</option><option value={20}>20 km</option><option value={25}>25 km</option><option value={50}>50 km</option>
                            </select>
                        </label>
                        {!busy && !error && <Badge variant="secondary" className="px-3 py-1 text-sm"><Users className="me-1 h-4 w-4" />{visibleSuppliers.length} found</Badge>}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6" aria-busy={busy}>
                {locationError && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{locationError}</p>}
                {!busy && warnings.map(warning => <p key={warning} role="status" className="text-sm text-amber-800">{warning}</p>)}
                {busy ? <div className="flex justify-center p-8"><LoadingSpinner message={locating ? 'Finding your current location...' : 'Finding nearby suppliers...'} variant="sparkle" /></div>
                : error ? <div role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-900"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => setRetry(value => value + 1)}>Try again</Button></div>
                : !hasLocation ? <div className="py-8 text-center"><p className="mb-4 text-slate-600">Use My Location above, or save your city to see suppliers near you.</p><Button asChild><Link href="/profile">Set my location</Link></Button></div>
                : visibleSuppliers.length ? <>
                    <section aria-labelledby="recommendations-title" className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 sm:p-6">
                        <div className="mb-5 flex items-start justify-between gap-3">
                            <div><h2 id="recommendations-title" className="flex items-center gap-2 text-xl font-bold text-emerald-950"><Award className="h-6 w-6 text-emerald-700" />Top picks near you</h2>
                            <p className="mt-2 text-sm text-slate-600">A shortlist from matching nearby listings, balancing customer ratings, review count and distance.</p></div>
                            {recommendations.length > 0 && <Badge className="shrink-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{recommendations.length} recommended</Badge>}
                        </div>
                        {recommendations.length ? <div className="grid gap-4 xl:grid-cols-3">{recommendations.map((supplier, index) => <RecommendedSupplierCard key={supplier.id} supplier={supplier} first={index === 0} />)}</div>
                        : <p className="text-sm text-slate-600">No reviewed matches in this search yet. Explore the nearby suppliers below or adjust your search.</p>}
                        <p className="mt-4 text-xs leading-5 text-slate-500">Ratings are dated Google Maps snapshots, not live scores. Recommendations cover our reviewed listings, not every shop. Confirm stock, price and delivery with the supplier.</p>
                    </section>
                    <div><h2 className="mb-4 text-xl font-bold text-slate-900">All nearby suppliers <span className="text-sm font-normal text-slate-500">· Nearest first</span></h2><div className="grid gap-4">{visibleSuppliers.map((supplier, index) => <SupplierCard key={supplier.id} supplier={supplier} index={index} />)}</div></div>
                </>
                : <div className="py-10 text-center"><Truck className="mx-auto mb-4 h-10 w-10 text-slate-400" /><p className="text-lg text-slate-600">No matching suppliers within {radiusKm} km of your location.</p><p className="mt-2 text-sm text-slate-500">{radiusKm < 50 ? 'Choose a larger distance above, change the search, or update your location.' : 'Try another crop or product, or check your selected location.'}</p></div>}
                {!busy && <p className="text-xs text-slate-500">Registered AgriGuard listings, reviewed public businesses and <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap contributors</a>{directoryUpdatedAt ? ` · Map directory updated ${directoryUpdatedAt}` : ''}. Contact the supplier to confirm stock and services.</p>}
            </CardContent>
        </Card>
    );
}

export const SupplierCard = ({ supplier, index }: { supplier: Supplier, index: number }) => {
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
                            {supplier.source && <p className="mt-1 text-xs text-slate-500">{supplier.source === 'registered' ? 'Registered on AgriGuard' : supplier.source === 'public-review' ? 'Public business listing · Not registered on AgriGuard' : 'Public map listing'}</p>}
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
                                        {supplier.rating && supplier.rating > 0 ? supplier.rating.toFixed(1) : 'No rating'}{supplier.reviewEvidence ? ` (${supplier.reviewEvidence.count.toLocaleString('en-US')} reviews)` : ''}
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
                <div className="flex shrink-0 flex-col gap-3 self-start w-full lg:w-48 [&>a]:h-10 [&>a]:flex-none [&>button]:h-10 [&>button]:flex-none">
                        {canCall && <Button
                            variant="default"
                            size="sm"
                            asChild
                            className="h-10 flex-none group-hover:bg-green-600 transition-colors"
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
                            className="h-10 flex-none group-hover:border-green-500 group-hover:text-green-600 transition-colors"
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

function RecommendedSupplierCard({ supplier, first }: { supplier: Supplier; first: boolean }) {
    const evidence = supplier.reviewEvidence!;
    const directions = `https://www.google.com/maps/dir/?api=1&destination=${supplier.location.coordinates.lat},${supplier.location.coordinates.lng}`;
    const phone = supplier.contact.phone.replace(/[^+0-9]/g, '');
    return <article className={`flex min-w-0 flex-col rounded-xl border bg-white p-5 shadow-sm ${first ? 'border-emerald-500' : 'border-emerald-100'}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{first ? 'Top match' : 'Recommended nearby'}</span><span className="flex items-center gap-1 text-xs text-slate-600"><MapPin className="h-3 w-3" />{supplier.distance!.toFixed(1)} km away</span></div>
        <div className="flex items-start gap-3"><span className="rounded-full bg-slate-50 p-3"><Store className="h-5 w-5 text-emerald-700" /></span><div className="min-w-0"><h3 className="text-lg font-bold leading-6 text-slate-900">{supplier.name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{supplier.location.address}</p></div></div>
        <p className="mt-4 flex items-center gap-2 text-sm"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /><strong>{supplier.rating.toFixed(1)}</strong><span className="text-slate-500">({evidence.count.toLocaleString('en-US')} reviews)</span></p>
        <p className="mt-1 text-xs text-slate-500">Google Maps · Checked {evidence.checkedAt}</p>
        <div className="mt-4 flex flex-wrap gap-2">{supplier.products.slice(0, 2).map(product => <span key={product} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{product}</span>)}</div>
        <div className="my-4 flex-1 rounded-lg bg-emerald-50 p-3"><h4 className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><Leaf className="h-4 w-4" />Why this pick</h4><p className="mt-2 text-sm leading-6 text-slate-600">{evidence.summary}</p></div>
        <div className="flex flex-wrap gap-2">{phone.length >= 7 && <Button asChild className="min-h-11 flex-1 bg-emerald-700 hover:bg-emerald-800"><a href={`tel:${phone}`}><Phone className="me-2 h-4 w-4" />Call shop</a></Button>}<Button asChild variant="outline" className="min-h-11 flex-1 border-emerald-700 text-emerald-800"><a href={directions} target="_blank" rel="noopener noreferrer"><MapPin className="me-2 h-4 w-4" />Directions</a></Button></div>
        <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-8 items-center text-sm font-semibold text-emerald-800 underline underline-offset-2">Read reviews →</a>
    </article>;
}
