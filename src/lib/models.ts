// Firestore data models and converters

export type UserProfile = {
  uid: string;
  phone: string;
  name?: string;
  location?: string;
  lat?: number;
  lon?: number;
  language?: 'english' | 'urdu';
  crops?: string[];
  notificationPreferences?: {
    weatherAlerts?: boolean;
    priceUpdates?: boolean;
    treatmentReminders?: boolean;
  };
  createdAt: any; // Firestore serverTimestamp or ISO string
  updatedAt: any; // Firestore serverTimestamp or ISO string
};

export type TreatmentStep = {
  stepNumber: number;
  title: string;
  description: string;
  materials: string[];
  cost: number;
  timing: string;
  safetyNotes: string;
};

export type ProtectionPlanPhase = {
  week: number;
  title: string;
  tasks: string[];
};

export type ProtectionPlan = {
  duration: string;
  phases: ProtectionPlanPhase[];
  recommendations: string[];
};

/** A single history entry recording what changed in a report and when */
export type ReportHistoryEntry = {
  /** When this change was made (ISO string) */
  changedAt: string;
  /** Short summary of what was changed */
  action: string;
  /** Previous snapshot of key fields before the change */
  previousData?: {
    disease?: string;
    confidence?: number;
    severity?: string;
    status?: string;
    crop?: string;
    description?: string;
  };
  /** New values that were set */
  newData?: {
    disease?: string;
    confidence?: number;
    severity?: string;
    status?: string;
    crop?: string;
    description?: string;
  };
};

export type DiagnosisReport = {
  inference?: {
    provider: 'agrichat'; model: string; revision: string;
    baseModel: string; baseRevision: string; quantization: 'nf4' | 'none';
    confidenceType: 'model-estimate';
  };
  id: string;
  uid: string;
  crop?: string;
  imageThumb?: string;
  symptoms?: string;
  imageUrl?: string; // storage url or data url persisted elsewhere
  disease: string;
  confidence: number; // 0-100
  affectedParts: string[];
  severity: 'None' | 'Low' | 'Medium' | 'High';
  description: string;
  plan?: {
    steps: TreatmentStep[];
    totalCost: number;
    timeline: string;
    preventionTips: string[];
  };
  protectionPlan?: ProtectionPlan;
  /** Weather conditions at time of report creation (if available) */
  weather?: {
    location?: string;
    temperature?: string;
    condition?: string;
    humidity?: string;
    alerts?: string[];
    fetchedAt?: string;
  };
  /** Dynamic translations generated via AI */
  translations?: Record<string, {
    disease: string;
    description: string;
    affectedParts: string[];
    plan?: any;
    protectionPlan?: any;
  }>;
  status: 'Complete' | 'Processing' | 'Error' | 'Pending';
  /** Ordered list of changes: oldest first, newest last */
  history?: ReportHistoryEntry[];
  visualHighlights?: {
    boundingBox: number[];
    reasoning: string;
  }[];
  visualHighlightsReviewed?: boolean;
  /** Set only after the dedicated image review has completed. */
  visualHighlightsReviewVersion?: number;
  visualHighlight?: { // Backwards compatibility for old reports
    boundingBox?: { ymin: number; xmin: number; ymax: number; xmax: number; };
    reasoning: string;
  };
  expertReviewRequired?: boolean;
  fieldId?: string;
  cropId?: string;
  plantId?: string;
  plantName?: string;
  plantRecordId?: string;
  age?: string;
  severityScore?: number | null;
  severityExplanation?: string;
  createdAt: any; // ISO string
  updatedAt: any; // ISO string
};

export type Field = {
  id: string;
  uid: string;
  name: string;
  cropType: string;
  variety?: string;
  plantingDate?: string;
  location?: string;
  growthStage?: string;
  notes?: string;
  createdAt: any;
  updatedAt: any;
};

export type AdminLog = {
  id: string;
  agentName: 'ingestAgent' | 'diagnosticAgent' | 'actionPlannerAgent' | 'marketplaceAgent' | 'coordinatorAgent';
  action: string;
  reportId?: string;
  status: 'success' | 'error' | 'info';
  duration?: number;
  timestamp: any;
  payload?: Record<string, any>;
};

export type Supplier = {
  id: string;
  name: string;
  type: 'supplier' | 'buyer' | 'logistics';
  location: {
    address: string;
    coordinates: {
      lat: number;
      lng: number;
    };
    city: string;
    province: string;
  };
  products: string[];
  services: string[];
  contact: {
    phone: string;
    email?: string;
    whatsapp?: string;
  };
  rating: number;
  distance?: number;
  availability: 'available' | 'busy' | 'unavailable';
  pricing: {
    competitive: boolean;
    notes?: string;
  };
  verification: {
    verified: boolean;
    documents?: string[];
  };
};
