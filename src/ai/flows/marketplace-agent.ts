import { z } from "zod";
import { ai } from "@/ai/genkit";
import { nearbySuppliers as filterNearbySuppliers } from "@/lib/supplier-location";

// Marketplace Agent Schemas
export const SupplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['supplier', 'buyer', 'logistics']),
  location: z.object({
    address: z.string(),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number()
    }),
    city: z.string(),
    province: z.string()
  }),
  products: z.array(z.string()),
  services: z.array(z.string()),
  contact: z.object({
    phone: z.string(),
    email: z.string().optional(),
    whatsapp: z.string().optional()
  }),
  rating: z.number().min(0).max(5),
  distance: z.number().optional(),
  availability: z.enum(['available', 'busy', 'unavailable']),
  pricing: z.object({
    competitive: z.boolean(),
    notes: z.string().optional()
  }),
  verification: z.object({
    verified: z.boolean(),
    documents: z.array(z.string()).optional()
  })
});

export const MarketplaceSearchSchema = z.object({
  query: z.string(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    radius: z.number().default(50) // km
  }),
  filters: z.object({
    type: z.array(z.string()).optional(),
    products: z.array(z.string()).optional(),
    minRating: z.number().optional(),
    maxDistance: z.number().optional()
  }).optional()
});

export const MarketplaceResultSchema = z.object({
  suppliers: z.array(SupplierSchema),
  totalCount: z.number(),
  searchRadius: z.number(),
  recommendations: z.array(z.string()),
  marketInsights: z.object({
    averagePricing: z.string(),
    availability: z.string(),
    trends: z.array(z.string())
  })
});

export type Supplier = z.infer<typeof SupplierSchema>;
export type MarketplaceSearch = z.infer<typeof MarketplaceSearchSchema>;
export type MarketplaceResult = z.infer<typeof MarketplaceResultSchema>;

// Import external suppliers API (no Firestore dependency - avoids permission issues)
import { fetchRealSuppliersFromGooglePlaces, fetchRealSuppliersFromOpenStreetMap } from '@/lib/external-suppliers';

// Mock supplier data for seeding - Distributed across major cities in Pakistan
const SEED_SUPPLIERS: Omit<Supplier, 'id' | 'distance'>[] = [
  // Lahore Suppliers
  {
    name: "Green Valley Seeds & Fertilizers",
    type: "supplier",
    location: {
      address: "123 Agriculture Road, Model Town",
      coordinates: { lat: 31.5204, lng: 74.3587 },
      city: "Lahore",
      province: "Punjab"
    },
    products: ["Seeds", "Fertilizers", "Pesticides", "Farming Tools"],
    services: ["Delivery", "Consultation", "Bulk Orders"],
    contact: {
      phone: "+92-300-1234567",
      email: "info@greenvalley.com",
      whatsapp: "+92-300-1234567"
    },
    rating: 4.5,
    availability: "available",
    pricing: {
      competitive: true,
      notes: "Best prices in the area"
    },
    verification: {
      verified: true,
      documents: ["Business License", "Tax Certificate"]
    }
  },
  {
    name: "Crop Care Solutions",
    type: "supplier",
    location: {
      address: "456 Farm Street, Gulberg",
      coordinates: { lat: 31.5304, lng: 74.3487 },
      city: "Lahore",
      province: "Punjab"
    },
    products: ["Pesticides", "Herbicides", "Plant Protection"],
    services: ["Spraying Service", "Crop Monitoring", "Expert Consultation"],
    contact: {
      phone: "+92-300-2345678",
      whatsapp: "+92-300-2345678"
    },
    rating: 4.2,
    availability: "available",
    pricing: {
      competitive: true
    },
    verification: {
      verified: true
    }
  },
  {
    name: "Fresh Harvest Buyers",
    type: "buyer",
    location: {
      address: "789 Market Square, Anarkali",
      coordinates: { lat: 31.5704, lng: 74.3187 },
      city: "Lahore",
      province: "Punjab"
    },
    products: ["Wheat", "Rice", "Cotton", "Vegetables"],
    services: ["Direct Purchase", "Fair Pricing", "Transportation"],
    contact: {
      phone: "+92-300-3456789",
      whatsapp: "+92-300-3456789"
    },
    rating: 4.7,
    availability: "available",
    pricing: {
      competitive: true,
      notes: "Premium prices for quality produce"
    },
    verification: {
      verified: true,
      documents: ["Trading License", "Bank Guarantee"]
    }
  },
  {
    name: "Agri Transport Services",
    type: "logistics",
    location: {
      address: "321 Transport Hub, Ravi Road",
      coordinates: { lat: 31.5104, lng: 74.3687 },
      city: "Lahore",
      province: "Punjab"
    },
    products: [],
    services: ["Crop Transportation", "Cold Storage", "Market Delivery"],
    contact: {
      phone: "+92-300-4567890",
      whatsapp: "+92-300-4567890"
    },
    rating: 4.0,
    availability: "available",
    pricing: {
      competitive: true
    },
    verification: {
      verified: true
    }
  },
  
  // Faisalabad Suppliers
  {
    name: "Faisalabad Seed Company",
    type: "supplier",
    location: {
      address: "22 Canal Road, Faisalabad",
      coordinates: { lat: 31.4504, lng: 73.1350 },
      city: "Faisalabad",
      province: "Punjab"
    },
    products: ["Cotton Seeds", "Wheat Seeds", "Fertilizers", "Irrigation Equipment"],
    services: ["Technical Support", "Soil Testing", "Delivery"],
    contact: {
      phone: "+92-300-5678901",
      email: "contact@faisalabadseeds.com",
      whatsapp: "+92-300-5678901"
    },
    rating: 4.6,
    availability: "available",
    pricing: {
      competitive: true,
      notes: "Bulk discounts available"
    },
    verification: {
      verified: true,
      documents: ["Business License", "Quality Certificate"]
    }
  },
  
  // Multan Suppliers
  {
    name: "Punjab Organic Buyers",
    type: "buyer",
    location: {
      address: "15 Agricultural Market, Multan",
      coordinates: { lat: 30.1575, lng: 71.5249 },
      city: "Multan",
      province: "Punjab"
    },
    products: ["Organic Wheat", "Organic Vegetables", "Fruits"],
    services: ["Fair Trade", "Quick Payment", "Quality Inspection"],
    contact: {
      phone: "+92-300-6789012",
      whatsapp: "+92-300-6789012"
    },
    rating: 4.8,
    availability: "available",
    pricing: {
      competitive: true,
      notes: "Premium prices for certified organic produce"
    },
    verification: {
      verified: true,
      documents: ["Trading License", "Organic Certification"]
    }
  },
  {
    name: "Multan Agricultural Supplies",
    type: "supplier",
    location: {
      address: "88 Bosan Road, Multan",
      coordinates: { lat: 30.1975, lng: 71.4797 },
      city: "Multan",
      province: "Punjab"
    },
    products: ["Seeds", "Pesticides", "Fertilizers", "Farm Equipment"],
    services: ["Home Delivery", "Technical Advice", "Warranty"],
    contact: {
      phone: "+92-300-7890123",
      whatsapp: "+92-300-7890123"
    },
    rating: 4.3,
    availability: "available",
    pricing: {
      competitive: true
    },
    verification: {
      verified: true
    }
  },
  
  // Karachi Suppliers
  {
    name: "Karachi Agro Center",
    type: "supplier",
    location: {
      address: "45 Shahrah-e-Faisal, Karachi",
      coordinates: { lat: 24.8607, lng: 67.0011 },
      city: "Karachi",
      province: "Sindh"
    },
    products: ["Modern Farming Equipment", "Drip Irrigation", "Greenhouse Materials"],
    services: ["Installation", "Maintenance", "Training"],
    contact: {
      phone: "+92-300-8901234",
      email: "info@karachiagro.pk",
      whatsapp: "+92-300-8901234"
    },
    rating: 4.4,
    availability: "available",
    pricing: {
      competitive: true,
      notes: "Latest technology at competitive prices"
    },
    verification: {
      verified: true,
      documents: ["Business License", "Import License"]
    }
  },
  
  // Islamabad Suppliers
  {
    name: "Capital Seeds & Fertilizers",
    type: "supplier",
    location: {
      address: "12 Blue Area, Islamabad",
      coordinates: { lat: 33.7294, lng: 73.0931 },
      city: "Islamabad",
      province: "Islamabad Capital Territory"
    },
    products: ["Hybrid Seeds", "Organic Fertilizers", "Bio-Pesticides"],
    services: ["Expert Consultation", "Soil Analysis", "Custom Solutions"],
    contact: {
      phone: "+92-300-9012345",
      email: "sales@capitalseeds.pk",
      whatsapp: "+92-300-9012345"
    },
    rating: 4.7,
    availability: "available",
    pricing: {
      competitive: true,
      notes: "Premium quality products"
    },
    verification: {
      verified: true,
      documents: ["Business License", "Quality Certification", "ISO 9001"]
    }
  },
  
  // Peshawar Suppliers
  {
    name: "Khyber Agriculture Trading",
    type: "buyer",
    location: {
      address: "32 Saddar Road, Peshawar",
      coordinates: { lat: 34.0151, lng: 71.5249 },
      city: "Peshawar",
      province: "Khyber Pakhtunkhwa"
    },
    products: ["Wheat", "Maize", "Vegetables", "Fruits"],
    services: ["Direct Purchase", "Market Linkage", "Transportation"],
    contact: {
      phone: "+92-300-0123456",
      whatsapp: "+92-300-0123456"
    },
    rating: 4.5,
    availability: "available",
    pricing: {
      competitive: true,
      notes: "Best rates in KPK"
    },
    verification: {
      verified: true,
      documents: ["Trading License"]
    }
  },
  
  // Sialkot Suppliers
  {
    name: "Sialkot Farm Equipment",
    type: "supplier",
    location: {
      address: "101 Circular Road, Sialkot",
      coordinates: { lat: 32.4945, lng: 74.5229 },
      city: "Sialkot",
      province: "Punjab"
    },
    products: ["Tractors", "Harvesters", "Ploughs", "Irrigation Systems"],
    services: ["Spare Parts", "Repair Services", "Financing"],
    contact: {
      phone: "+92-300-1112233",
      whatsapp: "+92-300-1112233"
    },
    rating: 4.6,
    availability: "available",
    pricing: {
      competitive: true,
      notes: "Best equipment in Punjab"
    },
    verification: {
      verified: true
    }
  },
  
  // Gujranwala Suppliers
  {
    name: "Gujranwala Agri Mart",
    type: "supplier",
    location: {
      address: "55 GT Road, Gujranwala",
      coordinates: { lat: 32.1877, lng: 74.1945 },
      city: "Gujranwala",
      province: "Punjab"
    },
    products: ["Seeds", "Fertilizers", "Pesticides", "Animal Feed"],
    services: ["24/7 Delivery", "Expert Advice", "Credit Facility"],
    contact: {
      phone: "+92-300-2223344",
      email: "info@gujranwalaagri.pk",
      whatsapp: "+92-300-2223344"
    },
    rating: 4.4,
    availability: "available",
    pricing: {
      competitive: true
    },
    verification: {
      verified: true
    }
  }
];

// Note: Suppliers are now fetched from external API (no Firestore needed)
// No need to seed suppliers since we use real data from OpenStreetMap/Google Places

// Marketplace Agent Flow
export const marketplaceAgent = ai.defineFlow(
  {
    name: "marketplaceAgent",
    inputSchema: MarketplaceSearchSchema,
    outputSchema: MarketplaceResultSchema,
  },
  async (input) => {
    try {
      // Step 1: Search suppliers using external API (no Firestore - avoids permission issues)
      // Converts radius from km to meters for the API
      const radiusMeters = (input.filters?.maxDistance || input.location.radius) * 1000;
      
      console.log(`🔍 Searching for suppliers near location: ${input.location.lat}, ${input.location.lng} within ${radiusMeters/1000}km`);
      
      // Try Google Places first (best for real nearby businesses)
      let nearbySuppliers = await fetchRealSuppliersFromGooglePlaces(
        input.location.lat,
        input.location.lng,
        radiusMeters
      );
      
      // If Google Places returns no results, fall back to OpenStreetMap
      if (!nearbySuppliers || nearbySuppliers.length === 0) {
        console.log('⚠️ Google Places returned no results, trying OpenStreetMap...');
        nearbySuppliers = await fetchRealSuppliersFromOpenStreetMap(
          input.location.lat,
          input.location.lng,
          radiusMeters
        );
      }
      
      console.log(`✅ Found ${nearbySuppliers.length} suppliers from external API`);
      
      // Step 2: Apply additional filters if provided
      let filteredSuppliers = filterNearbySuppliers(nearbySuppliers, input.location, Math.min(input.location.radius, input.filters?.maxDistance ?? input.location.radius));
      
      if (input.query && input.query.trim() !== '' && input.query.trim().toLowerCase() !== 'agricultural supplies') {
        const normalizedQuery = input.query.trim().toLowerCase();
        filteredSuppliers = filteredSuppliers.filter(supplier => 
          [...(supplier.products || []), ...(supplier.services || []), supplier.name]
            .some(value => value.toLowerCase().includes(normalizedQuery))
        );
      }
      
      if (input.filters?.type && input.filters.type.length > 0) {
        filteredSuppliers = filteredSuppliers.filter(s => 
          input.filters!.type!.includes(s.type)
        );
      }
      
      if (input.filters?.products && input.filters.products.length > 0) {
        filteredSuppliers = filteredSuppliers.filter(supplier =>
          input.filters!.products!.some(product =>
            supplier.products.some(p =>
              p.toLowerCase().includes(product.toLowerCase())
            )
          )
        );
      }
      
      if (input.filters?.minRating) {
        filteredSuppliers = filteredSuppliers.filter(s => 
          s.rating >= input.filters!.minRating!
        );
      }
      
      // Step 3: Ensure suppliers have all required fields (including id)
      const formattedSuppliers = filteredSuppliers.map(supplier => {
        // Ensure ID exists - generate one if missing
        const supplierId = supplier.id || `supplier-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        return {
          ...supplier,
          id: supplierId,
          distance: supplier.distance || 0,
          availability: supplier.availability || 'available',
          pricing: supplier.pricing || { competitive: true },
          verification: supplier.verification || { verified: false }
        } as Supplier;
      });
      
      // Step 4: Generate AI recommendations
      const recommendations = await generateRecommendations(input, formattedSuppliers);
      
      // Step 5: Generate market insights
      const marketInsights = await generateMarketInsights(formattedSuppliers);
      
      return {
        suppliers: formattedSuppliers,
        totalCount: formattedSuppliers.length,
        searchRadius: input.location.radius,
        recommendations,
        marketInsights
      };
    } catch (error) {
      console.error('Marketplace search error:', error);
      
      // Fallback: return empty results
      return {
        suppliers: [],
        totalCount: 0,
        searchRadius: input.location.radius,
        recommendations: [
          "No suppliers found in your area",
          "Try expanding your search radius",
          "Contact local agricultural extension office for recommendations"
        ],
        marketInsights: {
          averagePricing: "Unable to determine pricing",
          availability: "No suppliers currently available",
          trends: ["Expand your search to find more options"]
        }
      };
    }
  }
);

// Helper Functions for AI-powered insights
async function generateRecommendations(search: MarketplaceSearch, suppliers: Supplier[]): Promise<string[]> {
  return [
    `Compare prices from the ${suppliers.length} nearby suppliers`,
    "Check supplier ratings and verification status",
    "Verify product quality before making a bulk purchase",
    "Ask about delivery costs and availability"
  ];
}

async function generateMarketInsights(suppliers: Supplier[]): Promise<{
  averagePricing: string;
  availability: string;
  trends: string[];
}> {
  const verifiedCount = suppliers.filter(supplier => supplier.verification.verified).length;
  return {
    averagePricing: "Contact suppliers for current pricing",
    availability: `${suppliers.length} suppliers found (${verifiedCount} verified)`,
    trends: ["Market prices vary by season", "Quality products command premium prices"]
  };
}

// Additional utility functions for marketplace operations
import { createSupplier as createSupplierInFirestore, updateSupplierRating as updateRatingInFirestore, createSupplierContact } from '@/lib/repositories';

export async function createSupplierListing(supplier: Omit<Supplier, 'id'>): Promise<Supplier> {
  try {
    const supplierId = await createSupplierInFirestore(supplier);
    return {
      ...supplier,
      id: supplierId
    };
  } catch (error) {
    console.error('Error creating supplier:', error);
    throw new Error('Failed to create supplier listing');
  }
}

export async function updateSupplierRating(supplierId: string, userId: string, newRating: number, review?: string): Promise<boolean> {
  try {
    await updateRatingInFirestore(supplierId, userId, newRating, review);
    return true;
  } catch (error) {
    console.error('Error updating rating:', error);
    return false;
  }
}

export async function sendMessageToSupplier(
  userId: string,
  supplierId: string,
  message: string,
  contactMethod: 'phone' | 'whatsapp' | 'email' = 'whatsapp'
): Promise<boolean> {
  try {
    await createSupplierContact({
      userId,
      supplierId,
      message,
      contactMethod
    });
    return true;
  } catch (error) {
    console.error('Error sending message:', error);
    return false;
  }
}

// Generate negotiation template messages using AI
export async function generateNegotiationMessage(
  supplierName: string,
  products: string[],
  quantity?: string,
  priceRange?: string
): Promise<string> {
  try {
    let message = `السلام علیکم ${supplierName},\n\nI am interested in purchasing ${products.join(', ')}.`;
    
    if (quantity) {
      message += ` I am looking for a quantity of ${quantity}.`;
    }
    
    if (priceRange) {
      message += ` My budget is around ${priceRange} PKR.`;
    }
    
    message += `\n\nPlease let me know your best rates and availability.\n\nThank you.`;
    
    return message;
  } catch (error) {
    console.error('Error generating message template:', error);
    return `السلام علیکم, I am interested in purchasing ${products.join(', ')}. Please share your best rates and availability.`;
  }
}
