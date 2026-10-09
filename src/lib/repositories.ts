import { getAuth } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getDocsFromServer, setDoc, updateDoc, query, orderBy, limit, where, serverTimestamp, getDocFromCache, addDoc, getCountFromServer, arrayUnion, writeBatch } from 'firebase/firestore';
import { getDb, getApp } from './firestore';
import type { UserProfile, DiagnosisReport, AdminLog, Supplier, ReportHistoryEntry } from './models';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const FIRESTORE_WRITE_TIMEOUT_MS = 8000;
const FIRESTORE_READ_TIMEOUT_MS = 8000;

async function readWithTimeout<T>(read: Promise<T>, operation: string): Promise<T | undefined> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            read,
            new Promise<undefined>(resolve => {
                timeoutId = setTimeout(() => {
                    console.warn(`${operation} timed out after ${FIRESTORE_READ_TIMEOUT_MS}ms`);
                    resolve(undefined);
                }, FIRESTORE_READ_TIMEOUT_MS);
            }),
        ]);
    } catch (error) {
        console.warn(`${operation} failed:`, error);
        return undefined;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

async function writeWithTimeout<T>(write: Promise<T>, operation: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            write,
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`${operation} could not be confirmed. Check your connection and refresh before retrying.`));
                }, FIRESTORE_WRITE_TIMEOUT_MS);
            }),
        ]);
    } catch (error) {
        console.warn(`${operation} failed:`, error);
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

// Profiles
export async function getProfile(uid: string): Promise<UserProfile | null> {
  const db = getDb();
  const ref = doc(db, 'profiles', uid);
  
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { uid: snap.id, ...snap.data() } as UserProfile;
  } catch (e: any) {
    console.warn('Failed to fetch profile from server, trying cache:', e);
    try {
      // Fallback to local cache if offline
      const cachedSnap = await getDocFromCache(ref);
      if (cachedSnap.exists()) {
        return { uid: cachedSnap.id, ...cachedSnap.data() } as UserProfile;
      }
    } catch (cacheError) {
      console.warn('Also failed to fetch from cache:', cacheError);
    }
    return null; // Fail gracefully
  }
}

export async function upsertProfile(profile: Partial<UserProfile> & { uid: string; phone: string }): Promise<void> {
  const db = getDb();
  const ref = doc(db, 'profiles', profile.uid);
  
  // Use ISO string instead of serverTimestamp() to prevent offline hanging
  const now = new Date().toISOString();
  
  // Use setDoc with merge: true which works seamlessly offline
  // instead of getDoc which throws when completely offline.
  await writeWithTimeout(setDoc(ref, { ...profile, updatedAt: now }, { merge: true }), 'Profile update');
}

// Reports
export async function createReport(uid: string, data: Omit<DiagnosisReport, 'id' | 'uid' | 'createdAt' | 'updatedAt'> & { status?: DiagnosisReport['status'] }): Promise<string> {
  const db = getDb();
  const reportsCollection = collection(db, 'users', uid, 'reports');
  const docRef = doc(reportsCollection); // Generate ID synchronously
  
  const now = new Date().toISOString();
  
  // Clean undefined from data to prevent Firestore errors
  const cleanData = { ...data };
  Object.keys(cleanData).forEach(key => {
    if (cleanData[key as keyof typeof cleanData] === undefined) {
      delete cleanData[key as keyof typeof cleanData];
    }
  });
  
  // Initial history entry
  const initialHistory: ReportHistoryEntry[] = [{
    changedAt: now,
    action: 'Report Created',
    newData: {
      ...(cleanData.disease !== undefined && { disease: cleanData.disease }),
      ...(cleanData.confidence !== undefined && { confidence: cleanData.confidence }),
      ...(cleanData.severity !== undefined && { severity: cleanData.severity }),
      status: cleanData.status ?? 'Processing',
      ...(cleanData.crop !== undefined && { crop: cleanData.crop }),
      ...(cleanData.description !== undefined && { description: cleanData.description }),
    },
  }];

        await writeWithTimeout(
            setDoc(docRef, { uid, ...cleanData, status: cleanData.status ?? 'Processing', createdAt: now, updatedAt: now, history: initialHistory } as any),
            'Report creation'
        );
    
  return docRef.id;
}

export async function updateReport(uid: string, reportId: string, data: Partial<DiagnosisReport>): Promise<void> {
    const db = getDb();
    const ref = doc(db, 'users', uid, 'reports', reportId);
    const now = new Date().toISOString();

    const existingSnap = await readWithTimeout(getDoc(ref), 'Report history snapshot');
    const existingData = existingSnap?.exists() ? existingSnap.data() as Partial<DiagnosisReport> : undefined;
    
    // Clean undefined from data to prevent Firestore errors
    const cleanData = { ...data };
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key as keyof typeof cleanData] === undefined) {
        delete cleanData[key as keyof typeof cleanData];
      }
    });

    // Build a history entry capturing what changed
    const historyEntry: ReportHistoryEntry = {
        changedAt: now,
        action: cleanData.status === 'Complete' ? 'Diagnosis Completed'
              : cleanData.status === 'Processing' ? 'Re-analysis Started'
              : cleanData.status === 'Error' ? 'Error Occurred'
              : 'Report Updated',
        ...(existingData && { previousData: {
            ...(cleanData.disease !== undefined && existingData.disease !== undefined && { disease: existingData.disease }),
            ...(cleanData.confidence !== undefined && existingData.confidence !== undefined && { confidence: existingData.confidence }),
            ...(cleanData.severity !== undefined && existingData.severity !== undefined && { severity: existingData.severity }),
            ...(cleanData.status !== undefined && existingData.status !== undefined && { status: existingData.status }),
            ...(cleanData.crop !== undefined && existingData.crop !== undefined && { crop: existingData.crop }),
            ...(cleanData.description !== undefined && existingData.description !== undefined && { description: existingData.description }),
        } }),
        newData: {
            ...(cleanData.disease !== undefined && { disease: cleanData.disease }),
            ...(cleanData.confidence !== undefined && { confidence: cleanData.confidence }),
            ...(cleanData.severity !== undefined && { severity: cleanData.severity }),
            ...(cleanData.status !== undefined && { status: cleanData.status }),
            ...(cleanData.crop !== undefined && { crop: cleanData.crop }),
            ...(cleanData.description !== undefined && { description: cleanData.description }),
        },
    };
    
    await writeWithTimeout(
        updateDoc(ref, { 
            ...cleanData, 
            updatedAt: now,
            // Append to history array (arrayUnion handles Firestore atomically)
            history: arrayUnion(historyEntry),
        }),
        'Report update'
    );
}

export async function deleteReport(uid: string, reportId: string): Promise<void> {
    const db = getDb();
    const ref = doc(db, 'users', uid, 'reports', reportId);
    const report = (await getDoc(ref)).data();
    if (report?.cropId && report?.plantId && report?.plantRecordId) {
        const { deletePlantRecord } = await import('./my-crops/delete-record');
        await deletePlantRecord(uid, report.cropId, report.plantId, reportId, db);
        return;
    }
    const batch = writeBatch(db);
    batch.delete(ref);
    batch.delete(doc(db, 'users', uid, 'notifications', `diagnosis_${reportId}`));
    await writeWithTimeout(batch.commit(), 'Report deletion');
}


export async function listRecentReports(uid: string, max: number = 10): Promise<DiagnosisReport[]> {
  // Retry helper for cold-start resilience (new browser, fresh connection)
  async function attemptFetch(): Promise<DiagnosisReport[]> {
    const db = getDb();
    const ref = collection(db, 'users', uid, 'reports');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(max));
    // Server-first fetch to ensure fresh data after login; fall back to cache if offline
    let snap;
    try {
      snap = await getDocsFromServer(q);
    } catch (serverErr) {
      console.warn('Server fetch failed for reports, using cache:', serverErr);
      snap = await getDocs(q);
    }
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as DiagnosisReport));
  }

  try {
    const reports = await attemptFetch();
    if (reports.length > 0) return reports;
    
    // If empty on first try, wait briefly and retry (handles cold-start on new browser)
    await new Promise(r => setTimeout(r, 1500));
    return await attemptFetch();
  } catch (error) {
    console.warn("Failed to fetch recent reports:", error);
    // Final retry after delay
    try {
      await new Promise(r => setTimeout(r, 2000));
      return await attemptFetch();
    } catch (retryError) {
      console.warn("Retry also failed:", retryError);
      return [];
    }
  }
}

export async function getTotalReportsCount(uid: string): Promise<number> {
  try {
    const db = getDb();
    const ref = collection(db, 'users', uid, 'reports');
    const snap = await getCountFromServer(ref);
    return snap.data().count;
  } catch (error) {
    console.warn("Failed to get total reports count:", error);
    return 0;
  }
}

// Fields
export async function createField(uid: string, data: Omit<import('./models').Field, 'id' | 'uid' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const db = getDb();
    const fieldsRef = collection(db, 'users', uid, 'fields');
    const docRef = doc(fieldsRef);
    const now = new Date().toISOString();
    
    await writeWithTimeout(
        setDoc(docRef, { ...data, uid, createdAt: now, updatedAt: now } as any),
        'Field creation'
    );
    return docRef.id;
}

export async function listFields(uid: string): Promise<import('./models').Field[]> {
    const db = getDb();
    const ref = collection(db, 'users', uid, 'fields');
    const q = query(ref, orderBy('createdAt', 'desc'));
    
    try {
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    } catch (e) {
        console.warn("Failed to fetch fields:", e);
        return [];
    }
}

export async function getField(uid: string, fieldId: string): Promise<import('./models').Field | null> {
    const db = getDb();
    const ref = doc(db, 'users', uid, 'fields', fieldId);
    
    try {
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() } as import('./models').Field;
    } catch (e) {
        console.warn("Failed to get field:", e);
        return null;
    }
}

export async function getDashboardStats(uid: string): Promise<{total: number, completed: number, highSeverity: number, thisMonth: number}> {
  async function attemptFetch(): Promise<{total: number, completed: number, highSeverity: number, thisMonth: number}> {
    const db = getDb();
    const ref = collection(db, 'users', uid, 'reports');
    
    // Server-first fetch to ensure fresh data after login; fall back to cache if offline
    let snap;
    try {
      snap = await getDocsFromServer(ref);
    } catch (serverErr) {
      console.warn('Server fetch failed for stats, using cache:', serverErr);
      snap = await getDocs(ref);
    }
    const reports = snap.docs.map(d => d.data());

    const now = new Date();
    const monthAgoIso = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();

    let completed = 0;
    let highSeverity = 0;
    let thisMonth = 0;

    reports.forEach(report => {
      if (report.status === 'Complete') completed++;
      if (report.severity === 'High') highSeverity++;
      if (report.createdAt && report.createdAt >= monthAgoIso) thisMonth++;
    });

    return {
      total: reports.length,
      completed,
      highSeverity,
      thisMonth
    };
  }

  try {
    const stats = await attemptFetch();
    if (stats.total > 0) return stats;
    
    // If empty on first try, wait briefly and retry (handles cold-start on new browser)
    await new Promise(r => setTimeout(r, 1500));
    return await attemptFetch();
  } catch (error) {
    console.warn("Failed to get stats:", error);
    // Final retry after delay
    try {
      await new Promise(r => setTimeout(r, 2000));
      return await attemptFetch();
    } catch (retryError) {
      console.warn("Retry also failed:", retryError);
      return { total: 0, completed: 0, highSeverity: 0, thisMonth: 0 };
    }
  }
}

export async function uploadReportImage(uid: string, reportId: string, file: File): Promise<string> {
    try {
        console.log("Initializing Firebase Storage...");
        const app = getApp();
        console.log("Firebase app initialized:", app.name);
        
        const storage = getStorage(app);
        console.log("Storage instance created");
        
        const path = `reports/${uid}/${reportId}/${file.name}`;
        console.log("Upload path:", path);
        
        const fileRef = storageRef(storage, path);
        console.log("File reference created");
        
        console.log("Starting file upload...");
        
        // Add timeout to prevent infinite hanging
        const uploadPromise = uploadBytes(fileRef, file);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Upload timeout after 30 seconds')), 30000)
        );
        
        const snapshot = await Promise.race([uploadPromise, timeoutPromise]) as any;
        console.log("Upload completed:", snapshot.metadata.name);
        
        console.log("Getting download URL...");
        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log("Download URL obtained:", downloadURL);
        
        return downloadURL;
    } catch (error: unknown) {
        // Normalize error to avoid accessing properties on non-object errors
        const err = error as any;
        const message = typeof err?.message === 'string' ? err.message : String(err ?? 'Unknown error');
        const code = err?.code;
        const stack = err?.stack;

        console.warn('Upload error details:', { message, code, stack, raw: err });
        
        // Provide more specific error messages
        if (message.includes('timeout')) {
            throw new Error('Image upload timed out. Please check your internet connection and try again.');
        } else if (code === 'storage/unauthorized') {
            throw new Error('Upload failed: Unauthorized. Please check Firebase Storage rules.');
        } else if (code === 'storage/object-not-found') {
            throw new Error('Upload failed: Storage bucket not found. Please check Firebase configuration.');
        } else {
            throw new Error(`Image upload failed: ${message}`);
        }
    }
}

// Agent Logs
export async function createLog(logData: Omit<AdminLog, 'id' | 'timestamp'>): Promise<string> {
    const db = getDb();
    const logsCollection = collection(db, 'logs');
    const docRef = doc(logsCollection);
    const now = new Date().toISOString();
    
    const uid = getAuth(getApp()).currentUser?.uid;
    const entry = { ...logData, timestamp: now, ...(uid ? { userId: uid } : {}) };
    // Keep project logs for verified administrators and an owner-readable activity feed.
    if (uid) {
        setDoc(doc(db, 'users', uid, 'logs', docRef.id), entry)
            .catch(error => console.error('Could not save account activity:', error));
    }
    setDoc(docRef, entry).catch(error => console.warn('Could not save project activity:', error));

    return docRef.id;
}

export async function listLogs(max: number = 50): Promise<AdminLog[]> {
    const db = getDb();
    const ref = collection(db, 'logs');
    const q = query(ref, orderBy('timestamp', 'desc'), limit(max));
    // Server-first fetch for accurate admin logs
    let snap;
    try {
      snap = await readWithTimeout(getDocsFromServer(q), 'List logs (server)');
    } catch (serverErr) {
      console.warn('Server fetch failed for logs, using cache:', serverErr);
      snap = await readWithTimeout(getDocs(q), 'List logs (cache)');
    }
    if (!snap) return [];
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as AdminLog));
}

export async function getDailyReportCounts(): Promise<{ date: string; reports: number }[]> {
    const db = getDb();
    const ref = collection(db, 'logs');
    
    // Get date 6 days ago (to cover exactly 7 days including today)
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
    sixDaysAgo.setHours(0, 0, 0, 0);
    
    const q = query(
        ref, 
        where('action', '==', 'diagnosis_completed'),
        where('timestamp', '>=', sixDaysAgo.toISOString()),
        orderBy('timestamp', 'asc')
    );
    
    // Use server-first fetch for fresh real-time data
    let snap;
    try {
        snap = await readWithTimeout(getDocsFromServer(q), 'List daily logs (server)');
    } catch (serverErr) {
        console.warn('Server fetch failed for daily counts, using cache:', serverErr);
        snap = await readWithTimeout(getDocs(q), 'List daily logs (cache)');
    }
    
    // Initialize last 7 days with 0
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const resultMap = new Map<string, number>();
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayName = days[d.getDay()];
        resultMap.set(dayName, 0);
    }
    
    if (snap && !snap.empty) {
        snap.docs.forEach(d => {
            const data = d.data();
            const dateStr = typeof data.timestamp === 'string' ? data.timestamp : data.timestamp?.toDate?.()?.toISOString();
            if (dateStr) {
                const dateObj = new Date(dateStr);
                const dayName = days[dateObj.getDay()];
                if (resultMap.has(dayName)) {
                    resultMap.set(dayName, resultMap.get(dayName)! + 1);
                }
            }
        });
    }
    
    return Array.from(resultMap.entries()).map(([date, reports]) => ({ date, reports }));
}

// Admin dashboard real-time stats
export async function getAdminDashboardStats(): Promise<{totalReportsToday: number, activeUsers: number, avgConfidence: string, avgResponseTime: string}> {
    try {
        const db = getDb();
        const logsRef = collection(db, 'logs');
        
        // Get today's start
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        // Get all logs from today
        const todayQ = query(
            logsRef,
            where('timestamp', '>=', todayStart.toISOString())
        );
        
        let todaySnap;
        try {
            todaySnap = await getDocsFromServer(todayQ);
        } catch {
            todaySnap = await getDocs(todayQ);
        }
        
        // Count reports created today (based on diagnosis_completed)
        let totalReportsToday = 0;
        todaySnap.docs.forEach(d => {
            const data = d.data();
            if (data.action === 'diagnosis_completed') {
                totalReportsToday++;
            }
        });
        
        // Calculate avg confidence and response time from recent logs
        let totalConfidence = 0;
        let confidenceCount = 0;
        let totalDuration = 0;
        let durationCount = 0;
        
        // Get recent logs for stats (broader query)
        const recentQ = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
        let recentSnap;
        try {
            recentSnap = await getDocsFromServer(recentQ);
        } catch {
            recentSnap = await getDocs(recentQ);
        }
        
        recentSnap.docs.forEach(d => {
            const data = d.data();
            if (data.payload?.confidence) {
                totalConfidence += Number(data.payload.confidence);
                confidenceCount++;
            }
            if (data.duration !== undefined && data.duration !== null) {
                totalDuration += Number(data.duration);
                durationCount++;
            }
        });
        
        const avgConfidence = confidenceCount > 0 ? `${Math.round(totalConfidence / confidenceCount)}%` : '—';
        const avgResponseTime = durationCount > 0 ? `${(totalDuration / durationCount / 1000).toFixed(1)}s` : '—';
        
        // Count unique users from profiles collection
        const profilesRef = collection(db, 'profiles');
        let activeUsers = 0;
        try {
            const profilesSnap = await getCountFromServer(profilesRef);
            activeUsers = profilesSnap.data().count;
        } catch {
            // Fallback if getCountFromServer fails
            try {
                const snap = await getDocs(profilesRef);
                activeUsers = snap.size;
            } catch {
                activeUsers = 0;
            }
        }
        
        return { totalReportsToday, activeUsers, avgConfidence, avgResponseTime };
    } catch (error) {
        console.warn('Failed to get admin stats:', error);
        return { totalReportsToday: 0, activeUsers: 0, avgConfidence: '—', avgResponseTime: '—' };
    }
}

// Suppliers - Enhanced with full Firestore integration
export async function seedSuppliers(suppliers: Omit<Supplier, 'id'>[]): Promise<void> {
    const db = getDb();
    const ref = collection(db, 'suppliers');
    const existing = await getDocs(ref);
    if (existing.empty) {
        console.log("Seeding suppliers...");
        for (const supplier of suppliers) {
            await addDoc(ref, {
                ...supplier,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        console.log("Seeding complete.");
    }
}

export async function listSuppliers(): Promise<Supplier[]> {
    const db = getDb();
    const ref = collection(db, 'suppliers');
    const q = query(ref);
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Supplier));
}

export async function getSupplierById(supplierId: string): Promise<Supplier | null> {
    const db = getDb();
    const ref = doc(db, 'suppliers', supplierId);
    const snap = await getDoc(ref);
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Supplier) : null;
}

export async function createSupplier(supplier: Omit<Supplier, 'id'>): Promise<string> {
    const db = getDb();
    const ref = collection(db, 'suppliers');
    const docRef = await addDoc(ref, {
        ...supplier,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return docRef.id;
}

export async function updateSupplier(supplierId: string, data: Partial<Supplier>): Promise<void> {
    const db = getDb();
    const ref = doc(db, 'suppliers', supplierId);
    await updateDoc(ref, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

export async function searchSuppliersByLocation(
    lat: number,
    lng: number,
    radiusKm: number = 50,
    filters?: {
        type?: string[];
        products?: string[];
        minRating?: number;
        maxDistance?: number;
    }
): Promise<Supplier[]> {
    const db = getDb();
    const ref = collection(db, 'suppliers');
    
    // Start with basic query
    let q = query(ref);
    
    // Apply filters if provided
    if (filters?.type && filters.type.length > 0) {
        q = query(ref, where('type', 'in', filters.type));
    }
    
    if (filters?.minRating) {
        q = query(ref, where('rating', '>=', filters.minRating));
    }
    
    const snap = await getDocs(q);
    const suppliers = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Supplier));
    
    // Calculate distances and filter by radius
    const suppliersWithDistance = suppliers
        .map(supplier => {
            const distance = calculateHaversineDistance(
                lat,
                lng,
                supplier.location.coordinates.lat,
                supplier.location.coordinates.lng
            );
            return { ...supplier, distance };
        })
        .filter(s => s.distance <= (filters?.maxDistance || radiusKm))
        .sort((a, b) => a.distance - b.distance);
    
    // Apply product filter if provided
    if (filters?.products && filters.products.length > 0) {
        return suppliersWithDistance.filter(supplier =>
            filters.products!.some(product =>
                supplier.products.some(p =>
                    p.toLowerCase().includes(product.toLowerCase())
                )
            )
        );
    }
    
    return suppliersWithDistance;
}

// Haversine distance calculation
function calculateHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371; // Earth's radius in kilometers
    
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Marketplace helpers with real Firestore integration
export async function findSuppliersNearby(lat: number, lon: number, radiusKm: number = 50, maxResults: number = 20): Promise<Supplier[]> {
    return searchSuppliersByLocation(lat, lon, radiusKm, { maxDistance: radiusKm });
}

export async function createMarketplaceListing(listing: { 
    sellerId: string; 
    title: string; 
    description?: string; 
    price: number; 
    location?: string; 
    contact?: string; 
    tags?: string[]; 
    createdAt?: any 
}): Promise<string> {
    const db = getDb();
    const ref = collection(db, 'marketplace');
    const now = serverTimestamp();
    const docRef = await addDoc(ref, { 
        ...listing, 
        createdAt: listing.createdAt ?? now, 
        updatedAt: now,
        status: 'active' 
    } as any);
    return docRef.id;
}

export async function getMarketplaceListings(filters?: {
    sellerId?: string;
    tags?: string[];
    minPrice?: number;
    maxPrice?: number;
}): Promise<any[]> {
    const db = getDb();
    const ref = collection(db, 'marketplace');
    let q = query(ref, where('status', '==', 'active'), orderBy('createdAt', 'desc'));
    
    if (filters?.sellerId) {
        q = query(ref, where('sellerId', '==', filters.sellerId), where('status', '==', 'active'));
    }
    
    const snap = await getDocs(q);
    let listings = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    
    // Apply client-side filters
    if (filters?.minPrice) {
        listings = listings.filter(l => l.price && l.price >= filters.minPrice!);
    }
    if (filters?.maxPrice) {
        listings = listings.filter(l => l.price && l.price <= filters.maxPrice!);
    }
    
    return listings;
}

// Contact/Communication functions
export async function createSupplierContact(contactData: {
    userId: string;
    supplierId: string;
    message: string;
    contactMethod: 'phone' | 'whatsapp' | 'email';
}): Promise<string> {
    const db = getDb();
    const ref = collection(db, 'supplier_contacts');
    const docRef = doc(ref);
    const now = new Date().toISOString();
    
    await writeWithTimeout(setDoc(docRef, {
        ...contactData,
        status: 'pending',
        createdAt: now,
        updatedAt: now
    }), 'Contact supplier');
    
    return docRef.id;
}

export async function getSupplierContactHistory(userId: string, supplierId?: string): Promise<any[]> {
    const db = getDb();
    const ref = collection(db, 'supplier_contacts');
    
    let q = supplierId 
        ? query(ref, where('userId', '==', userId), where('supplierId', '==', supplierId), orderBy('createdAt', 'desc'))
        : query(ref, where('userId', '==', userId), orderBy('createdAt', 'desc'));
    
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updateSupplierRating(supplierId: string, userId: string, rating: number, review?: string): Promise<void> {
    const db = getDb();
    
    // Add rating to ratings collection
    const ratingsRef = collection(db, 'supplier_ratings');
    await addDoc(ratingsRef, {
        supplierId,
        userId,
        rating,
        review,
        createdAt: serverTimestamp()
    });
    
    // Calculate new average rating
    const allRatingsSnap = await getDocs(query(ratingsRef, where('supplierId', '==', supplierId)));
    const ratings = allRatingsSnap.docs.map(d => d.data().rating);
    const averageRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    
    // Update supplier's rating
    await updateSupplier(supplierId, { rating: Math.round(averageRating * 10) / 10 });
}


// Coordinator / Agent decision logging helper
export async function createAgentDecisionLog(agentName: AdminLog['agentName'], action: string, reportId?: string, payload?: Record<string, any>, status: AdminLog['status'] = 'info', duration?: number): Promise<string> {
    const db = getDb();
    const ref = collection(db, 'agent_decisions');
    const now = serverTimestamp();
    const docRef = await addDoc(ref, { agentName, action, reportId: reportId ?? null, payload: payload ?? {}, status, duration: duration ?? null, timestamp: now } as any);
    return docRef.id;
}

