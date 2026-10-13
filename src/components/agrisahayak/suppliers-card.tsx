"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, Phone, MessageCircle, Award, LocateFixed, Leaf, Store, Map, ArrowRight, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import LoadingSpinner from "./loading-spinner";
import ContactSupplierDialog from "./contact-supplier-dialog";
import type { Supplier, UserProfile } from "@/lib/models";
import { useAuth } from "@/firebase";
import { getProfile } from "@/lib/repositories";
import { nearbySuppliers, supplierLocationParams, validCoordinates, getCurrentSupplierLocation, DEFAULT_SUPPLIER_RADIUS_KM, type Coordinates } from "@/lib/supplier-location";

import { featuredSupplierForLocation, isCropProtectionSupplier, selectSupplierRecommendations } from "@/lib/supplier-recommendations";

export default function SuppliersCard({ searchQuery = '', filterType = 'all', searchControls }: { searchQuery?: string; filterType?: string; searchControls?: ReactNode }) {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [fartherSuppliers, setFartherSuppliers] = useState<Supplier[]>([]);
    const [cityFeature, setCityFeature] = useState<Supplier | null>(null);
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
        setSuppliers([]); setFartherSuppliers([]); setCityFeature(null);
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
            setSuppliers([]); setFartherSuppliers([]); setCityFeature(null);
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
        if (!params) { setLoading(false); setSuppliers([]); setFartherSuppliers([]); setCityFeature(null); setLocationLabel(''); return; }
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        setSuppliers([]); setFartherSuppliers([]); setCityFeature(null);
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
                setFartherSuppliers(nearbySuppliers(Array.isArray(data.fartherSuppliers) ? data.fartherSuppliers : [], data.location, 50).filter(s => s.distance! > radiusKm));
                setCityFeature(featuredSupplierForLocation(data.location, searchQuery.trim()));
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
    const visibleSuppliers = (filterType === 'all' ? [...suppliers] : suppliers.filter(supplier => supplier.type === filterType)).sort((a, b) => Number(isCropProtectionSupplier(b)) - Number(isCropProtectionSupplier(a)) || a.distance! - b.distance!);
    const eligibleFarther = filterType === 'all' || filterType === 'supplier' ? fartherSuppliers : [];
    const { picks: recommendations, expanded } = selectSupplierRecommendations(visibleSuppliers, eligibleFarther, radiusKm, profile?.crops || []);
    const featured = (filterType === 'all' || filterType === 'supplier') ? cityFeature || recommendations.find(s => s.website && s.featuredProducts?.length) : null;
    const otherRecommendations = recommendations.filter(s => s.id !== featured?.id).slice(0, featured ? 2 : 3);
    const busy = locating || (!profileLoaded && !currentLocation) || loading;
    return (
        <Card className="border-0 bg-transparent shadow-none">
            <CardHeader className="px-0 pt-0 pb-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    <Button asChild variant="outline" className="h-12 justify-between gap-3 rounded-xl border-slate-200 bg-white px-4 xl:max-w-64" title="Change your saved city">
                        <Link href="/profile"><MapPin className="h-5 w-5 shrink-0 text-slate-500" /><span className="truncate">{locating ? 'Locating...' : currentLocation ? 'Current location' : locationLabel || profile?.location || 'Choose your location'}</span><ChevronDown className="h-4 w-4 shrink-0" /></Link>
                    </Button>
                    <Button type="button" onClick={useMyLocation} disabled={locating} className="h-12 shrink-0 rounded-xl bg-emerald-800 px-5 text-white hover:bg-emerald-900"><LocateFixed className="me-2 h-5 w-5" />{locating ? 'Locating...' : 'Use My Location'}</Button>
                    <select aria-label="Search distance" value={radiusKm} onChange={event => setRadiusKm(Number(event.target.value))} className="h-12 shrink-0 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800">
                        <option value={10}>Within 10 km</option><option value={15}>Within 15 km</option><option value={20}>Within 20 km</option><option value={25}>Within 25 km</option><option value={50}>Within 50 km</option>
                    </select>
                    {searchControls && <div className="min-w-0 flex-1">{searchControls}</div>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-500">
                    <p>Approximate straight-line distances{currentLocation ? ` · Device accuracy about ${Math.max(1, Math.round(currentLocation.accuracy))} m` : ' · From your saved city centre'}</p>
                    {currentLocation && <button type="button" className="min-h-8 font-semibold text-emerald-800 underline underline-offset-2" onClick={() => { locationRequest.current += 1; setLocating(false); setCurrentLocation(null); setLocationLabel(''); setLocationError(null); }}>Use saved city</button>}
                </div>
            </CardHeader>
            <CardContent className="space-y-6 px-0 pb-0" aria-busy={busy}>
                {locationError && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{locationError}</p>}
                {!busy && warnings.map(warning => <p key={warning} role="status" className="text-sm text-amber-800">{warning}</p>)}
                {busy ? <div className="flex justify-center p-8"><LoadingSpinner message={locating ? 'Finding your current location...' : 'Finding nearby suppliers...'} variant="sparkle" /></div>
                : error ? <div role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-900"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => setRetry(value => value + 1)}>Try again</Button></div>
                : !hasLocation ? <div className="py-8 text-center"><p className="mb-4 text-slate-600">Use My Location above, or save your city to see suppliers near you.</p><Button asChild><Link href="/profile">Set my location</Link></Button></div>
                : <>
                    {featured && <section aria-labelledby="featured-shop-title" className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 p-3 sm:p-5">
                        <div className="mb-4 flex items-start gap-3"><Award className="mt-1 h-8 w-8 shrink-0 text-emerald-800" /><div><h2 id="featured-shop-title" className="text-xl font-bold tracking-tight text-slate-950">Featured crop-care shop in {featured.location.city}</h2><p className="mt-1 text-sm text-slate-500">Selected for your city{featured.distance! > radiusKm ? ` · Outside your selected ${radiusKm} km radius` : ''}.</p></div></div>
                        <FeaturedSupplierCard supplier={featured} outsideRadius={featured.distance! > radiusKm} />
                    </section>}
                    {otherRecommendations.length > 0 ? <section aria-labelledby="recommendations-title">
                        <h2 id="recommendations-title" className="mb-3 text-xl font-bold tracking-tight text-slate-950">{featured ? 'Other recommended suppliers' : expanded ? 'Recommended a little farther away' : 'Top picks near you'}</h2>
                        {expanded && <p className="mb-3 text-sm text-slate-500">No reviewed matches within {radiusKm} km. These options are outside your radius, within 50 km.</p>}
                        <div className="grid items-start gap-3 lg:grid-cols-2">{otherRecommendations.map(supplier => <RecommendedSupplierCard key={supplier.id} supplier={supplier} outsideRadius={expanded} />)}</div>
                    </section> : !featured && <p className="rounded-xl bg-emerald-50 p-5 text-sm text-slate-600">No reviewed matches available within 50 km for this search. Try another crop or product.</p>}
                    <p className="text-xs leading-5 text-slate-500">Ratings are dated Google Maps snapshots. Confirm stock and delivery with the shop.</p>
                    <div>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold tracking-tight text-slate-950">All nearby suppliers</h2><p className="mt-1 text-sm text-slate-500">Within your selected {radiusKm} km radius · {visibleSuppliers.length} found</p></div><span className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">Crop care first</span></div>
                        {visibleSuppliers.length ? <div className="grid gap-3">{visibleSuppliers.map((supplier, index) => <SupplierCard key={supplier.id} supplier={supplier} index={index} />)}</div> : <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500">No matching suppliers within {radiusKm} km.{expanded ? ' Recommended options farther away are shown above.' : ' Try another crop or product, or update your location.'}</div>}
                    </div>
                </>}
                {!busy && <p className="text-xs text-slate-500">Registered AgriGuard listings, reviewed public businesses and <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap contributors</a>{directoryUpdatedAt ? ` · Map directory updated ${directoryUpdatedAt}` : ''}. Contact the supplier to confirm stock and services.</p>}
            </CardContent>
        </Card>
    );
}

export const SupplierCard = ({ supplier }: { supplier: Supplier, index: number }) => {
    const { user } = useAuth();
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${supplier.location.coordinates.lat},${supplier.location.coordinates.lng}`;
    const phone = supplier.contact.phone?.split(/[;,]/)[0].replace(/[^+0-9]/g, '') || '';
    const whatsapp = supplier.contact.whatsapp?.replace(/[^0-9]/g, '') || '';
    return <article className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3"><span className="rounded-full bg-emerald-50 p-3"><Leaf className="h-6 w-6 text-emerald-800" /></span><div className="min-w-0"><h3 className="font-bold leading-6 text-slate-950">{supplier.name}</h3><p className="mt-1 flex items-start gap-1 text-xs leading-5 text-slate-500"><MapPin className="mt-1 h-3 w-3 shrink-0" />{supplier.location.address || supplier.location.city}</p><p className="mt-1 text-xs text-slate-400">{supplier.source === 'registered' ? 'Registered on AgriGuard' : 'Public business listing'}</p></div></div>
        <div className="flex flex-wrap gap-2 xl:max-w-48">{(supplier.products || []).slice(0, 2).map(product => <span key={product} className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-600">{product}</span>)}{supplier.products?.length > 2 && <span className="text-xs text-slate-500" title={supplier.products.slice(2).join(', ')}>+{supplier.products.length - 2} more</span>}</div>
        <div className="flex shrink-0 flex-wrap items-center gap-4 text-xs text-slate-500 xl:border-l xl:border-slate-100 xl:pl-4"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{supplier.distance != null ? `${supplier.distance.toFixed(1)} km away` : 'Distance unknown'}</span><span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{supplier.rating > 0 ? supplier.rating.toFixed(1) : 'No rating available'}</span></div>
        <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-64 xl:justify-end">
            {phone.replace(/\D/g, '').length >= 7 && <Button asChild size="sm" className="h-10 bg-emerald-800 hover:bg-emerald-900"><a href={`tel:${phone}`}><Phone className="me-1.5 h-4 w-4" />Call Now</a></Button>}
            {whatsapp.length >= 7 && <><Button asChild variant="outline" size="sm" className="h-10"><a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="me-1.5 h-4 w-4" />WhatsApp</a></Button><ContactSupplierDialog supplier={supplier} userId={user?.uid} defaultProducts={(supplier.products || []).slice(0, 1)} /></>}
            <Button asChild variant="outline" size="sm" className="h-10 border-slate-400"><a href={mapUrl} target="_blank" rel="noopener noreferrer"><Map className="me-1.5 h-4 w-4" />View on map</a></Button>
        </div>
    </article>;
};

export function FeaturedSupplierCard({ supplier, outsideRadius }: { supplier: Supplier; outsideRadius: boolean }) {
    const phone = supplier.contact.phone.replace(/[^+0-9]/g, '');
    const directions = `https://www.google.com/maps/dir/?api=1&destination=${supplier.location.coordinates.lat},${supplier.location.coordinates.lng}`;
    return <article className="grid overflow-hidden rounded-xl border border-emerald-100 bg-white p-4 sm:p-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-6">
        <div className="flex min-w-0 flex-col lg:border-r lg:border-slate-100 lg:pr-6">
            <Badge className="mb-5 w-fit bg-emerald-100 text-emerald-900 hover:bg-emerald-100">Crop protection pick</Badge>
            <div className="flex items-start gap-3"><span className="rounded-full bg-emerald-50 p-3"><Store className="h-7 w-7 text-emerald-800" /></span><div className="min-w-0"><h3 className="text-2xl font-bold text-slate-950">{supplier.name}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{supplier.location.address}, {supplier.location.city}</p>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-sm"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /><strong>{supplier.rating.toFixed(1)}</strong><span className="text-slate-500">· {supplier.reviewEvidence!.count.toLocaleString('en-US')} reviews</span></p>
                <p className={`mt-2 flex items-center gap-1 text-sm ${outsideRadius ? 'text-amber-800' : 'text-slate-500'}`}><MapPin className="h-4 w-4" />{supplier.distance!.toFixed(1)} km away{outsideRadius ? ' · Outside radius' : ''}</p>
                <a href={supplier.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 font-semibold text-emerald-800 underline underline-offset-4">{supplier.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')}<ArrowRight className="h-4 w-4" /></a>
                <p className="mt-3 text-sm leading-6 text-slate-500">Pesticides, fungicides &amp; plant protection.</p>
            </div></div>
            <div className="mt-6 flex flex-wrap gap-2 lg:mt-auto lg:pt-6">
                <Button asChild className="h-11 bg-emerald-800 hover:bg-emerald-900"><a href={supplier.website} target="_blank" rel="noopener noreferrer">Visit website <ArrowRight className="ms-2 h-4 w-4" /></a></Button>
                {phone.length >= 7 && <Button asChild variant="outline" className="h-11"><a href={`tel:${phone}`}><Phone className="me-2 h-4 w-4" />Call shop</a></Button>}
                <Button asChild variant="outline" className="h-11"><a href={directions} target="_blank" rel="noopener noreferrer"><Map className="me-2 h-4 w-4" />Directions</a></Button>
            </div>
            <a href={supplier.reviewEvidence!.url} target="_blank" rel="noopener noreferrer" className="mt-3 text-xs text-emerald-800 underline underline-offset-2">Google Maps reviews · Checked {supplier.reviewEvidence!.checkedAt}</a>
        </div>
        <section className="mt-6 min-w-0 lg:mt-0" aria-label={`Crop-care products from ${supplier.name}`}>
            <h4 className="mb-3 font-semibold text-slate-900">Explore crop-care products</h4>
            <div className="grid grid-cols-2 gap-3">{supplier.featuredProducts?.slice(0, 2).map(product => <a key={product.url} href={product.url} target="_blank" rel="noopener noreferrer" className="group min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-700">
                <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg bg-slate-50 p-3 sm:h-52 xl:h-60"><img src={product.image} alt={product.name} width={300} height={240} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain" /></div>
                <p className="mt-3 min-h-10 text-sm font-semibold leading-5 text-slate-950">{product.name}</p>
                <span className="mt-2 flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-2 text-sm font-semibold text-white group-hover:bg-emerald-900">View &amp; order <ArrowRight className="h-4 w-4" /></span>
            </a>)}</div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Photos from shop website. Orders open on their website; confirm price, stock and crop suitability with the seller.</p>
        </section>
    </article>;
}

export function RecommendedSupplierCard({ supplier, outsideRadius = false }: { supplier: Supplier; outsideRadius?: boolean }) {
    const evidence = supplier.reviewEvidence!;
    const phone = supplier.contact.phone.replace(/[^+0-9]/g, '');
    const directions = `https://www.google.com/maps/dir/?api=1&destination=${supplier.location.coordinates.lat},${supplier.location.coordinates.lng}`;
    return <article className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3"><span className="rounded-full bg-emerald-50 p-3"><Store className="h-6 w-6 text-emerald-800" /></span><div className="min-w-0"><h3 className="font-bold leading-6 text-slate-950">{supplier.name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{supplier.location.address}, {supplier.location.city}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /><strong className="text-slate-900">{supplier.rating.toFixed(1)}</strong>· {evidence.count.toLocaleString('en-US')} reviews <span className={outsideRadius ? 'text-amber-800' : ''}>· {supplier.distance!.toFixed(1)} km away{outsideRadius ? ' · Outside radius' : ''}</span></p>
            <p className="mt-2 text-xs text-slate-500">{supplier.products.slice(0, 2).join(' · ')}</p>
        </div></div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-32 sm:flex-col">
            {phone.length >= 7 && <Button asChild variant="outline" size="sm"><a href={`tel:${phone}`}>Call shop</a></Button>}
            <Button asChild variant="outline" size="sm"><a href={directions} target="_blank" rel="noopener noreferrer">Directions</a></Button>
            {supplier.website && <Button asChild variant="outline" size="sm"><a href={supplier.website} target="_blank" rel="noopener noreferrer">Website <ArrowRight className="ms-1 h-3 w-3" /></a></Button>}
            <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center justify-center text-xs font-semibold text-emerald-800 underline underline-offset-2">Read reviews</a>
        </div>
    </article>;
}
