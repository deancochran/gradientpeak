# Implementation Plan: GPS Routing & Tracking with Google Maps

**Current Implementation Status:** 0% Complete - This is a requirements and planning document.

Based on comprehensive codebase analysis, this plan outlines the complete implementation needed for GPS routing and tracking features. The existing codebase has excellent GPS tracking infrastructure (`ActivityRecorderService`, `LocationManager`) but **no route management, GPX handling, or MapCard implementation yet**.

---

## Current State Assessment

### ✅ What Exists
- **GPS Tracking**: `ActivityRecorderService` with location recording (`apps/mobile/lib/services/ActivityRecorder/index.ts`)
- **Location Management**: Background and foreground GPS tracking
- **Activity Streams**: Database support for `latlng` coordinate storage
- **Wahoo Integration**: Comprehensive sync service for planned activities (`packages/trpc/src/lib/integrations/wahoo/`)
- **Plan Tab**: Activity scheduling and planned activity creation (`apps/mobile/app/(internal)/(tabs)/plan/`)

### ❌ What's Missing
- **Database Schema**: No `activity_routes` table, no `activity_route_id` in `planned_activities`
- **GPX Infrastructure**: No parsing, upload, or storage for GPX files
- **Route Services**: No tRPC router or backend services for route management
- **MapCard Component**: Placeholder only - no real map display (`apps/mobile/components/RecordingCarousel/cards/MapCard.tsx`)
- **Route Selection**: No UI for selecting routes when creating planned activities
- **External Route Sync**: No route upload to Wahoo/Strava

---

## Phase 0: Database Foundation (CRITICAL - DO THIS FIRST)

### 0.1 Create Activity Routes Table

**Location**: `packages/supabase/supabase/migrations/`

```sql
-- Create activity_routes table
CREATE TABLE activity_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idx SERIAL UNIQUE NOT NULL,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Route metadata
  name TEXT NOT NULL,
  description TEXT,
  activity_type activity_type NOT NULL,
  
  -- GPX file storage
  gpx_file_path TEXT NOT NULL, -- Path: routes/{profile_id}/{route_id}.gpx
  
  -- Route statistics
  total_distance INTEGER NOT NULL, -- meters
  total_ascent INTEGER, -- meters (null if no elevation data)
  total_descent INTEGER, -- meters (null if no elevation data)
  
  -- Compressed preview coordinates for efficient loading
  -- Uses same compression as activity_streams latlng type
  preview_coordinates BYTEA NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT check_distance CHECK (total_distance >= 0),
  CONSTRAINT check_ascent CHECK (total_ascent IS NULL OR total_ascent >= 0),
  CONSTRAINT check_descent CHECK (total_descent IS NULL OR total_descent >= 0)
);

-- Indexes
CREATE INDEX idx_activity_routes_profile_id ON activity_routes(profile_id);
CREATE INDEX idx_activity_routes_activity_type ON activity_routes(activity_type);
CREATE INDEX idx_activity_routes_created_at ON activity_routes(created_at DESC);

-- RLS Policies
ALTER TABLE activity_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own routes"
  ON activity_routes FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "Users can create own routes"
  ON activity_routes FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can update own routes"
  ON activity_routes FOR UPDATE
  USING (auth.uid() = profile_id);

CREATE POLICY "Users can delete own routes"
  ON activity_routes FOR DELETE
  USING (auth.uid() = profile_id);

-- Update trigger
CREATE TRIGGER update_activity_routes_updated_at
  BEFORE UPDATE ON activity_routes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 0.2 Link Routes to Planned Activities

```sql
-- Add route reference to planned_activities
ALTER TABLE planned_activities 
  ADD COLUMN activity_route_id UUID REFERENCES activity_routes(id) ON DELETE SET NULL;

CREATE INDEX idx_planned_activities_route_id ON planned_activities(activity_route_id);

COMMENT ON COLUMN planned_activities.activity_route_id IS 
  'Optional reference to a route that should be followed during this activity';
```

### 0.3 Supabase Storage Configuration

**Manual Setup Required in Supabase Dashboard:**

1. Create new storage bucket:
   - **Name**: `routes`
   - **Public**: `false` (private access only)
   - **File size limit**: `10 MB`
   - **Allowed MIME types**: `application/gpx+xml`, `application/xml`, `text/xml`

2. Add storage policies:

```sql
-- Users can upload GPX files to their own folder
CREATE POLICY "Users can upload own route files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'routes' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can read their own route files
CREATE POLICY "Users can read own route files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'routes' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update their own route files
CREATE POLICY "Users can update own route files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'routes' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own route files
CREATE POLICY "Users can delete own route files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'routes' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

### 0.4 Update TypeScript Types

After migration, regenerate Supabase types:

```bash
cd packages/supabase
npm run generate-types
```

Update `packages/core/types/activity.ts` to include route in payload:

```typescript
export interface ActivityPayload {
  type: PublicActivityType;
  plannedActivityId?: string;
  plan?: RecordingServiceActivityPlan;
  route?: {
    id: string;
    name: string;
    coordinates: Array<{
      latitude: number;
      longitude: number;
      altitude?: number;
    }>;
    totalDistance: number;
    totalAscent?: number;
    totalDescent?: number;
  };
}
```

---

## Phase 1: Backend - GPX Upload & Route Service

### 1.1 Install Dependencies

```bash
# GPX parsing and geospatial calculations
npm install @tmcw/togeojson        # Parse GPX/KML to GeoJSON
npm install @turf/turf             # Distance, elevation calculations
npm install simplify-js            # Douglas-Peucker line simplification

# Already installed
npx expo install expo-location
npm install @googlemaps/polyline-codec
```

### 1.2 Create Route Utilities

**Location**: `packages/trpc/src/lib/routes/gpx-parser.ts`

```typescript
import { DOMParser } from '@xmldom/xmldom';
import * as toGeoJSON from '@tmcw/togeojson';
import * as turf from '@turf/turf';
import simplify from 'simplify-js';

export interface GPXPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: string;
}

export interface GPXTrack {
  name?: string;
  segments: GPXPoint[][];
}

export interface ParsedGPX {
  tracks: GPXTrack[];
  waypoints: Array<{ lat: number; lon: number; name?: string }>;
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    time?: string;
  };
}

export function parseGPX(gpxString: string): ParsedGPX {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpxString, 'text/xml');
  
  // Check for parsing errors
  const parseError = xmlDoc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    throw new Error('Invalid GPX XML format');
  }
  
  const geoJSON = toGeoJSON.gpx(xmlDoc);
  
  // Extract tracks and points
  const tracks: GPXTrack[] = [];
  const waypoints: Array<{ lat: number; lon: number; name?: string }> = [];
  
  for (const feature of geoJSON.features) {
    if (feature.geometry.type === 'LineString') {
      const points = feature.geometry.coordinates.map(coord => ({
        lon: coord[0],
        lat: coord[1],
        ele: coord[2],
      }));
      
      tracks.push({
        name: feature.properties?.name,
        segments: [points],
      });
    } else if (feature.geometry.type === 'Point') {
      waypoints.push({
        lon: feature.geometry.coordinates[0],
        lat: feature.geometry.coordinates[1],
        name: feature.properties?.name,
      });
    }
  }
  
  if (tracks.length === 0) {
    throw new Error('No tracks found in GPX file');
  }
  
  return { tracks, waypoints };
}

export interface RouteStats {
  distance: number; // meters
  ascent: number; // meters
  descent: number; // meters
  minElevation?: number;
  maxElevation?: number;
}

export function calculateRouteStats(points: GPXPoint[]): RouteStats {
  let totalDistance = 0;
  let totalAscent = 0;
  let totalDescent = 0;
  let minEle: number | undefined;
  let maxEle: number | undefined;
  
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    
    // Calculate distance using Haversine formula
    const from = turf.point([prev.lon, prev.lat]);
    const to = turf.point([curr.lon, curr.lat]);
    const distance = turf.distance(from, to, { units: 'meters' });
    totalDistance += distance;
    
    // Calculate elevation gain/loss
    if (prev.ele !== undefined && curr.ele !== undefined) {
      const elevChange = curr.ele - prev.ele;
      if (elevChange > 0) {
        totalAscent += elevChange;
      } else {
        totalDescent += Math.abs(elevChange);
      }
      
      minEle = minEle === undefined ? curr.ele : Math.min(minEle, curr.ele);
      maxEle = maxEle === undefined ? curr.ele : Math.max(maxEle, curr.ele);
    }
  }
  
  return {
    distance: Math.round(totalDistance),
    ascent: Math.round(totalAscent),
    descent: Math.round(totalDescent),
    minElevation: minEle,
    maxElevation: maxEle,
  };
}

export function simplifyCoordinates(
  points: GPXPoint[],
  tolerance: number = 0.0001
): GPXPoint[] {
  // Convert to simplify-js format
  const simplified = simplify(
    points.map(p => ({ x: p.lon, y: p.lat, ele: p.ele })),
    tolerance,
    true // high quality
  );
  
  // Convert back
  return simplified.map(p => ({
    lon: p.x,
    lat: p.y,
    ele: (p as any).ele,
  }));
}

// Compress coordinates using same method as activity_streams
export function compressCoordinates(points: GPXPoint[]): Buffer {
  // Store as [lat, lon, ele?, lat, lon, ele?, ...]
  const flatArray: number[] = [];
  
  for (const point of points) {
    flatArray.push(point.lat, point.lon);
    if (point.ele !== undefined) {
      flatArray.push(point.ele);
    }
  }
  
  // Convert to binary buffer
  const buffer = Buffer.allocUnsafe(flatArray.length * 4); // 4 bytes per float
  for (let i = 0; i < flatArray.length; i++) {
    buffer.writeFloatLE(flatArray[i], i * 4);
  }
  
  return buffer;
}

export function decompressCoordinates(buffer: Buffer, hasElevation: boolean = true): GPXPoint[] {
  const points: GPXPoint[] = [];
  const stride = hasElevation ? 3 : 2;
  
  for (let i = 0; i < buffer.length; i += stride * 4) {
    const lat = buffer.readFloatLE(i);
    const lon = buffer.readFloatLE(i + 4);
    const ele = hasElevation ? buffer.readFloatLE(i + 8) : undefined;
    
    points.push({ lat, lon, ele });
  }
  
  return points;
}
```

### 1.3 Create Routes tRPC Router

**Location**: `packages/trpc/src/routers/routes.ts`

```typescript
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  parseGPX,
  calculateRouteStats,
  simplifyCoordinates,
  compressCoordinates,
  decompressCoordinates,
} from '../lib/routes/gpx-parser';

export const routesRouter = createTRPCRouter({
  // Upload and parse GPX file
  upload: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileData: z.string(), // Base64 encoded GPX XML
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        activityType: z.enum([
          'outdoor_run',
          'outdoor_bike',
          'indoor_treadmill',
          'indoor_bike_trainer',
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // 1. Decode and parse GPX
        const gpxBuffer = Buffer.from(input.fileData, 'base64');
        const gpxString = gpxBuffer.toString('utf-8');
        const gpx = parseGPX(gpxString);
        
        // Use first track
        const track = gpx.tracks[0];
        if (!track.segments[0] || track.segments[0].length === 0) {
          throw new Error('GPX file contains no track points');
        }
        
        const points = track.segments[0];
        
        // 2. Calculate route statistics
        const stats = calculateRouteStats(points);
        
        if (stats.distance < 100) {
          throw new Error('Route must be at least 100 meters');
        }
        
        // 3. Simplify coordinates for preview (reduce to ~200-500 points)
        const targetPoints = Math.min(500, Math.max(200, Math.floor(points.length / 10)));
        const tolerance = 0.0001; // ~11 meters
        let simplified = simplifyCoordinates(points, tolerance);
        
        // Adjust tolerance if needed
        if (simplified.length > targetPoints) {
          simplified = simplifyCoordinates(points, tolerance * 2);
        }
        
        // 4. Compress preview coordinates
        const hasElevation = points.some(p => p.ele !== undefined);
        const compressed = compressCoordinates(simplified);
        
        // 5. Generate route ID and file path
        const routeId = crypto.randomUUID();
        const filePath = `${ctx.session.user.id}/${routeId}.gpx`;
        
        // 6. Upload original GPX to Supabase Storage
        const { error: uploadError } = await ctx.supabase.storage
          .from('routes')
          .upload(filePath, gpxBuffer, {
            contentType: 'application/gpx+xml',
            upsert: false,
          });
        
        if (uploadError) {
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }
        
        // 7. Create route record in database
        const { data, error: dbError } = await ctx.supabase
          .from('activity_routes')
          .insert({
            id: routeId,
            profile_id: ctx.session.user.id,
            name: input.name,
            description: input.description,
            activity_type: input.activityType,
            gpx_file_path: filePath,
            total_distance: stats.distance,
            total_ascent: stats.ascent > 0 ? stats.ascent : null,
            total_descent: stats.descent > 0 ? stats.descent : null,
            preview_coordinates: compressed,
          })
          .select()
          .single();
        
        if (dbError) {
          // Cleanup: delete uploaded file
          await ctx.supabase.storage.from('routes').remove([filePath]);
          throw new Error(`Database insert failed: ${dbError.message}`);
        }
        
        return {
          ...data,
          previewPointCount: simplified.length,
          originalPointCount: points.length,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to process GPX file',
        });
      }
    }),

  // List user's routes
  list: protectedProcedure
    .input(
      z.object({
        activityType: z
          .enum(['outdoor_run', 'outdoor_bike', 'indoor_treadmill', 'indoor_bike_trainer'])
          .optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('activity_routes')
        .select('*', { count: 'exact' })
        .eq('profile_id', ctx.session.user.id)
        .order('created_at', { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);
      
      if (input.activityType) {
        query = query.eq('activity_type', input.activityType);
      }
      
      const { data, error, count } = await query;
      
      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        });
      }
      
      return {
        routes: data || [],
        total: count || 0,
      };
    }),

  // Get route with preview coordinates
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('activity_routes')
        .select('*')
        .eq('id', input.id)
        .eq('profile_id', ctx.session.user.id)
        .single();
      
      if (error || !data) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Route not found',
        });
      }
      
      // Decompress preview coordinates
      const hasElevation = data.total_ascent !== null || data.total_descent !== null;
      const points = decompressCoordinates(data.preview_coordinates, hasElevation);
      
      return {
        ...data,
        coordinates: points.map(p => ({
          latitude: p.lat,
          longitude: p.lon,
          altitude: p.ele,
        })),
      };
    }),

  // Get full resolution route (downloads GPX)
  getFullRoute: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Get route record
      const { data: route, error: routeError } = await ctx.supabase
        .from('activity_routes')
        .select('*')
        .eq('id', input.id)
        .eq('profile_id', ctx.session.user.id)
        .single();
      
      if (routeError || !route) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Route not found',
        });
      }
      
      // Download GPX file
      const { data: fileData, error: downloadError } = await ctx.supabase.storage
        .from('routes')
        .download(route.gpx_file_path);
      
      if (downloadError || !fileData) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to download GPX file',
        });
      }
      
      // Parse GPX
      const gpxString = await fileData.text();
      const gpx = parseGPX(gpxString);
      const points = gpx.tracks[0].segments[0];
      
      return {
        ...route,
        coordinates: points.map(p => ({
          latitude: p.lat,
          longitude: p.lon,
          altitude: p.ele,
        })),
      };
    }),

  // Delete route
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get route to find file path
      const { data: route, error: fetchError } = await ctx.supabase
        .from('activity_routes')
        .select('gpx_file_path')
        .eq('id', input.id)
        .eq('profile_id', ctx.session.user.id)
        .single();
      
      if (fetchError || !route) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Route not found',
        });
      }
      
      // Delete from storage
      const { error: storageError } = await ctx.supabase.storage
        .from('routes')
        .remove([route.gpx_file_path]);
      
      if (storageError) {
        console.error('Failed to delete GPX file:', storageError);
        // Continue anyway - clean up database
      }
      
      // Delete from database
      const { error: deleteError } = await ctx.supabase
        .from('activity_routes')
        .delete()
        .eq('id', input.id)
        .eq('profile_id', ctx.session.user.id);
      
      if (deleteError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: deleteError.message,
        });
      }
      
      return { success: true };
    }),
});
```

### 1.4 Register Router

**Location**: `packages/trpc/src/routers/index.ts`

```typescript
import { routesRouter } from './routes';

export const appRouter = createTRPCRouter({
  // ... existing routers
  routes: routesRouter, // ADD THIS
});
```

---

## Phase 2: Frontend - Plan Tab Route Selection

### 2.1 Update Planned Activity Creation Schema

**Location**: `packages/core/schemas/planned_activity.ts`

```typescript
export const plannedActivityCreateSchema = z.object({
  activity_plan_id: z.string().uuid(),
  scheduled_date: z.string(),
  notes: z.string().nullable().optional(),
  activity_route_id: z.string().uuid().nullable().optional(), // NEW
});
```

### 2.2 Update Planned Activities Router

**Location**: `packages/trpc/src/routers/planned_activities.ts`

```typescript
// In create mutation, add activity_route_id to insert
create: protectedProcedure
  .input(plannedActivityCreateSchema)
  .mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from('planned_activities')
      .insert({
        profile_id: ctx.session.user.id,
        activity_plan_id: input.activity_plan_id,
        scheduled_date: input.scheduled_date,
        notes: input.notes,
        activity_route_id: input.activity_route_id, // NEW
      })
      .select()
      .single();
    
    // ... rest of mutation
  }),

// In getById, include route data
getById: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from('planned_activities')
      .select(`
        *,
        activity_plan:activity_plans (*),
        activity_route:activity_routes (
          id,
          name,
          description,
          total_distance,
          total_ascent,
          total_descent,
          preview_coordinates
        )
      `)
      .eq('id', input.id)
      .eq('profile_id', ctx.session.user.id)
      .single();
    
    // Decompress route coordinates if route exists
    if (data?.activity_route) {
      const hasElevation = 
        data.activity_route.total_ascent !== null || 
        data.activity_route.total_descent !== null;
      const points = decompressCoordinates(
        data.activity_route.preview_coordinates,
        hasElevation
      );
      data.activity_route.coordinates = points.map(p => ({
        latitude: p.lat,
        longitude: p.lon,
        altitude: p.ele,
      }));
    }
    
    return data;
  }),
```

### 2.3 Create Route Upload Screen

**Location**: `apps/mobile/app/(internal)/routes/upload.tsx`

```typescript
import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Select } from '~/components/ui/select';
import { trpc } from '~/lib/trpc';
import { useToast } from '~/lib/hooks/useToast';

export default function UploadRouteScreen() {
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [activityType, setActivityType] = useState<'outdoor_run' | 'outdoor_bike'>('outdoor_bike');
  
  const { toast } = useToast();
  const uploadMutation = trpc.routes.upload.useMutation({
    onSuccess: () => {
      toast({ title: 'Route uploaded successfully!' });
      router.back();
    },
    onError: (error) => {
      toast({ 
        title: 'Upload failed', 
        description: error.message,
        variant: 'destructive'
      });
    },
  });
  
  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/gpx+xml', 'application/xml', 'text/xml'],
      copyToCacheDirectory: true,
    });
    
    if (result.type === 'success') {
      // Read file as base64
      const fileData = await fetch(result.uri).then(r => r.blob());
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        setFile({ name: result.name, data: base64 });
        
        // Auto-populate name from filename
        if (!name) {
          setName(result.name.replace('.gpx', ''));
        }
      };
      reader.readAsDataURL(fileData);
    }
  };
  
  const handleUpload = () => {
    if (!file || !name) return;
    
    uploadMutation.mutate({
      fileName: file.name,
      fileData: file.data,
      name,
      description,
      activityType,
    });
  };
  
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 gap-4">
        <Text className="text-2xl font-bold">Upload GPX Route</Text>
        
        <Button 
          onPress={handlePickFile}
          variant={file ? 'outline' : 'default'}
        >
          <Text>{file ? file.name : 'Select GPX File'}</Text>
        </Button>
        
        {file && (
          <>
            <View>
              <Text className="mb-2 font-semibold">Route Name</Text>
              <Input
                value={name}
                onChangeText={setName}
                placeholder="e.g., Morning Ride"
              />
            </View>
            
            <View>
              <Text className="mb-2 font-semibold">Description (Optional)</Text>
              <Input
                value={description}
                onChangeText={setDescription}
                placeholder="Add details about this route"
                multiline
                numberOfLines={3}
              />
            </View>
            
            <View>
              <Text className="mb-2 font-semibold">Activity Type</Text>
              <Select
                value={activityType}
                onValueChange={setActivityType}
                options={[
                  { label: 'Outdoor Run', value: 'outdoor_run' },
                  { label: 'Outdoor Bike', value: 'outdoor_bike' },
                ]}
              />
            </View>
            
            <Button
              onPress={handleUpload}
              disabled={!name || uploadMutation.isLoading}
            >
              <Text>{uploadMutation.isLoading ? 'Uploading...' : 'Upload Route'}</Text>
            </Button>
          </>
        )}
      </View>
    </ScrollView>
  );
}
```

### 2.4 Update Create Planned Activity Screen

**Location**: `apps/mobile/app/(internal)/(tabs)/plan/create_planned_activity/index.tsx`

Add route selection after activity plan selection:

```typescript
// Add to component state
const [selectedRoute, setSelectedRoute] = useState<any>(null);

// Fetch routes when activity type is outdoor
const selectedPlan = allPlans?.find(p => p.id === selectedPlanId);
const isOutdoor = selectedPlan?.activity_type === 'outdoor_run' || 
                  selectedPlan?.activity_type === 'outdoor_bike';

const { data: routesData } = trpc.routes.list.useQuery(
  { activityType: selectedPlan?.activity_type, limit: 20 },
  { enabled: !!selectedPlan && isOutdoor }
);

// Add route selector UI (after plan selection, before date picker)
{isOutdoor && (
  <View className="gap-3">
    <View className="flex-row items-center justify-between">
      <Text className="text-base font-semibold">Route (Optional)</Text>
      <Button
        variant="ghost"
        size="sm"
        onPress={() => router.push('/routes/upload')}
      >
        <Icon as={Upload} size={16} />
        <Text>Upload GPX</Text>
      </Button>
    </View>
    
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
      <TouchableOpacity
        onPress={() => setSelectedRoute(null)}
        className={`p-3 rounded-lg border ${
          !selectedRoute ? 'bg-primary/10 border-primary' : 'bg-muted border-border'
        }`}
      >
        <Text className="font-medium">No Route</Text>
      </TouchableOpacity>
      
      {routesData?.routes.map(route => (
        <TouchableOpacity
          key={route.id}
          onPress={() => setSelectedRoute(route)}
          className={`p-3 rounded-lg border min-w-[140px] ${
            selectedRoute?.id === route.id 
              ? 'bg-primary/10 border-primary' 
              : 'bg-muted border-border'
          }`}
        >
          <Text className="font-semibold" numberOfLines={1}>{route.name}</Text>
          <Text className="text-xs text-muted-foreground mt-1">
            {(route.total_distance / 1000).toFixed(1)} km
          </Text>
          {route.total_ascent && (
            <Text className="text-xs text-muted-foreground">
              ↑ {route.total_ascent}m
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  </View>
)}

// Update mutation to include route_id
const handleSchedule = () => {
  if (!selectedPlanId || !selectedDate) return;
  
  createMutation.mutate({
    activity_plan_id: selectedPlanId,
    scheduled_date: selectedDate.toISOString(),
    notes: notes || null,
    activity_route_id: selectedRoute?.id || null, // NEW
  });
};
```

---

## Phase 3: Frontend - Activity Selection & MapCard

### 3.1 Update Activity Selection Store

**Location**: `apps/mobile/lib/stores/activitySelectionStore.ts`

Already updated `ActivityPayload` type in Phase 0.4. No changes needed here.

### 3.2 Update Plan Tab to Load Route

**Location**: `apps/mobile/app/(internal)/(tabs)/plan/index.tsx`

Update the `handleStartActivity` function:

```typescript
const handleStartActivity = async (plannedActivity: any) => {
  try {
    // Fetch full planned activity with route
    const fullPlannedActivity = await trpc.plannedActivities.getById.query({
      id: plannedActivity.id,
    });
    
    // Prepare route data if exists
    let route = null;
    if (fullPlannedActivity.activity_route) {
      route = {
        id: fullPlannedActivity.activity_route.id,
        name: fullPlannedActivity.activity_route.name,
        coordinates: fullPlannedActivity.activity_route.coordinates,
        totalDistance: fullPlannedActivity.activity_route.total_distance,
        totalAscent: fullPlannedActivity.activity_route.total_ascent,
        totalDescent: fullPlannedActivity.activity_route.total_descent,
      };
    }
    
    const payload: ActivityPayload = {
      type: plannedActivity.activity_plan.activity_type,
      plannedActivityId: plannedActivity.id,
      plan: convertToRecordingServicePlan(plannedActivity.activity_plan),
      route, // NEW
    };
    
    activitySelectionStore.setSelection(payload);
    router.push('/record');
  } catch (error) {
    console.error('Failed to start activity:', error);
    toast({
      title: 'Failed to start activity',
      description: 'Please try again',
      variant: 'destructive',
    });
  }
};
```

### 3.3 Install Map Dependencies

```bash
npx expo install react-native-maps
npx expo install @googlemaps/polyline-codec
```

### 3.4 Configure Google Maps API

**Update**: `apps/mobile/app.json`

```json
{
  "expo": {
    "android": {
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_ANDROID_API_KEY"
        }
      }
    },
    "ios": {
      "config": {
        "googleMapsApiKey": "YOUR_IOS_API_KEY"
      },
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "This app needs your location to track your activities.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "This app needs your location in the background to record activities."
      }
    }
  }
}
```

**Environment Variables**: Create `.env` in mobile app root:

```bash
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
```

### 3.5 Implement Real MapCard

**Location**: `apps/mobile/components/RecordingCarousel/cards/MapCard.tsx`

```typescript
import { memo, useEffect, useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Polyline, Marker, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import { Text } from '~/components/ui/text';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Plus, Minus, MapPin } from 'lucide-react-native';
import type { ActivityRecorderService } from '~/lib/services/ActivityRecorder';
import { useCurrentReadings } from '~/lib/hooks/useCurrentReadings';

interface LatLng {
  latitude: number;
  longitude: number;
}

interface RouteCoordinate extends LatLng {
  altitude?: number;
}

interface MapCardProps {
  service: ActivityRecorderService;
  screenWidth: number;
  routeCoordinates?: RouteCoordinate[] | null;
}

export const MapCard = memo(({ service, screenWidth, routeCoordinates }: MapCardProps) => {
  const current = useCurrentReadings(service);
  const mapRef = useRef<MapView>(null);
  
  const [recordedPath, setRecordedPath] = useState<LatLng[]>([]);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [zoomLevel, setZoomLevel] = useState(15);
  
  const latitude = current.position?.lat;
  const longitude = current.position?.lng;
  const altitude = current.position?.altitude;
  const hasLocation = latitude !== undefined && longitude !== undefined;
  
  // Initialize map region when first location is received
  useEffect(() => {
    if (hasLocation && !mapRegion) {
      const initialRegion: Region = {
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setMapRegion(initialRegion);
    }
  }, [hasLocation, latitude, longitude, mapRegion]);
  
  // Update recorded path and follow user
  useEffect(() => {
    if (latitude && longitude) {
      // Add point to recorded path (with simple distance filter)
      setRecordedPath(prev => {
        const lastPoint = prev[prev.length - 1];
        
        // Only add if moved at least 5 meters from last point
        if (lastPoint) {
          const distance = calculateDistance(
            lastPoint.latitude,
            lastPoint.longitude,
            latitude,
            longitude
          );
          if (distance < 5) return prev; // Skip
        }
        
        return [...prev, { latitude, longitude }];
      });
      
      // Update map region to follow user
      const delta = calculateDelta(zoomLevel);
      setMapRegion({
        latitude,
        longitude,
        latitudeDelta: delta,
        longitudeDelta: delta,
      });
    }
  }, [latitude, longitude, zoomLevel]);
  
  const handleZoomIn = () => {
    setZoomLevel(prev => {
      const newZoom = Math.min(prev + 1, 20);
      return newZoom;
    });
  };
  
  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const newZoom = Math.max(prev - 1, 10);
      return newZoom;
    });
  };
  
  // Show loading state if no location yet
  if (!hasLocation || !mapRegion) {
    return (
      <View style={[styles.container, { width: screenWidth }]}>
        <View style={styles.loadingContainer}>
          <Icon as={MapPin} size={48} className="text-muted-foreground mb-4" />
          <Text className="text-lg font-semibold">Waiting for GPS signal...</Text>
          <Text className="text-sm text-muted-foreground mt-2">
            Make sure location services are enabled
          </Text>
        </View>
      </View>
    );
  }
  
  return (
    <View style={[styles.container, { width: screenWidth }]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        region={mapRegion}
        
        // Critical: Disable gestures for carousel compatibility
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        
        showsUserLocation={false} // We'll draw custom marker
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
      >
        {/* Planned route (gray dashed line) */}
        {routeCoordinates && routeCoordinates.length > 1 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="rgba(128, 128, 128, 0.6)"
            strokeWidth={4}
            lineDashPattern={[10, 10]}
            zIndex={1}
          />
        )}
        
        {/* Recorded path (orange solid line) */}
        {recordedPath.length > 1 && (
          <Polyline
            coordinates={recordedPath}
            strokeColor="#FF6B35"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            zIndex={2}
          />
        )}
        
        {/* User marker (blue dot) */}
        <Marker
          coordinate={{ latitude, longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          zIndex={3}
        >
          <View style={styles.userMarker}>
            <View style={styles.userMarkerInner} />
          </View>
        </Marker>
      </MapView>
      
      {/* Zoom controls */}
      <View style={styles.zoomControls}>
        <Button
          size="icon"
          variant="secondary"
          onPress={handleZoomIn}
          style={styles.zoomButton}
        >
          <Icon as={Plus} size={20} />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          onPress={handleZoomOut}
          style={styles.zoomButton}
        >
          <Icon as={Minus} size={20} />
        </Button>
      </View>
      
      {/* GPS info overlay */}
      <View style={styles.gpsInfo}>
        <Text className="text-xs font-mono text-foreground">
          {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </Text>
        {altitude !== undefined && (
          <Text className="text-xs font-mono text-foreground">
            Altitude: {altitude.toFixed(0)}m
          </Text>
        )}
        {recordedPath.length > 0 && (
          <Text className="text-xs text-muted-foreground">
            {recordedPath.length} points recorded
          </Text>
        )}
      </View>
      
      {/* Route info (if route loaded) */}
      {routeCoordinates && (
        <View style={styles.routeInfo}>
          <Text className="text-xs font-semibold text-foreground">
            Following planned route
          </Text>
          <Text className="text-xs text-muted-foreground">
            {routeCoordinates.length} points
          </Text>
        </View>
      )}
    </View>
  );
});

MapCard.displayName = 'MapCard';

const styles = StyleSheet.create({
  container: {
    height: '100%',
    position: 'relative',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  zoomControls: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    gap: 8,
  },
  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  gpsInfo: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 2,
  },
  routeInfo: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 2,
  },
  userMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  userMarkerInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2196F3',
  },
});

// Helper: Calculate distance between two points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Helper: Calculate lat/lng delta for zoom level
function calculateDelta(zoom: number): number {
  // Approximate conversion: zoom 20 = 0.0005, zoom 10 = 0.05
  return 0.5 / Math.pow(2, zoom - 10);
}
```

### 3.6 Update RecordModal to Pass Route

**Location**: `apps/mobile/app/(internal)/record/index.tsx`

```typescript
// Add state for route
const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinate[] | null>(null);

// Load route from activity selection
useEffect(() => {
  const selection = activitySelectionStore.consumeSelection();
  if (selection) {
    service.selectActivityFromPayload(selection);
    
    // Load route if exists
    if (selection.route) {
      setRouteCoordinates(selection.route.coordinates);
    }
  }
}, []);

// Update RecordingCarousel props
<RecordingCarousel
  cardsConfig={cardsConfig}
  service={service}
  routeCoordinates={routeCoordinates} // NEW - pass to carousel
/>
```

**Update**: `apps/mobile/components/RecordingCarousel/index.tsx`

```typescript
interface RecordingCarouselProps {
  cardsConfig: CardConfig[];
  service: ActivityRecorderService;
  routeCoordinates?: RouteCoordinate[] | null; // NEW
}

export function RecordingCarousel({ cardsConfig, service, routeCoordinates }: RecordingCarouselProps) {
  // ... existing code
  
  // Pass route to MapCard
  const renderCard = (config: CardConfig) => {
    if (config.component === 'MapCard') {
      return (
        <MapCard
          service={service}
          screenWidth={screenWidth}
          routeCoordinates={routeCoordinates} // NEW
        />
      );
    }
    // ... other cards
  };
}
```

---

## Phase 4: External Service Integration

### 4.1 Wahoo Route Sync

**Location**: `packages/trpc/src/lib/integrations/wahoo/route-sync-service.ts` (NEW FILE)

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import { WahooClient } from './client';
import { parseGPX } from '../../routes/gpx-parser';

export class WahooRouteSync {
  constructor(
    private supabase: SupabaseClient,
    private wahooClient: WahooClient
  ) {}
  
  /**
   * Upload route to Wahoo and store mapping
   * Returns Wahoo route ID
   */
  async syncRoute(routeId: string, profileId: string): Promise<number> {
    // Check if already synced
    const existing = await this.getWahooRouteId(routeId);
    if (existing) return existing;
    
    // Get route from database
    const { data: route } = await this.supabase
      .from('activity_routes')
      .select('*')
      .eq('id', routeId)
      .eq('profile_id', profileId)
      .single();
    
    if (!route) throw new Error('Route not found');
    
    // Download GPX file
    const { data: gpxFile } = await this.supabase.storage
      .from('routes')
      .download(route.gpx_file_path);
    
    if (!gpxFile) throw new Error('GPX file not found');
    
    const gpxString = await gpxFile.text();
    const gpx = parseGPX(gpxString);
    
    // Convert to Wahoo format (waypoints array)
    const waypoints = gpx.tracks[0].segments[0].map((point, index) => ({
      latitude: point.lat,
      longitude: point.lon,
      elevation: point.ele || 0,
      distance: 0, // Wahoo calculates this
      index,
    }));
    
    // Upload to Wahoo
    const wahooRoute = await this.wahooClient.createRoute({
      name: route.name,
      description: route.description || '',
      activity_type: route.activity_type === 'outdoor_bike' ? 'bike' : 'run',
      waypoints,
    });
    
    // Store mapping in integrations metadata
    // (You may want a dedicated route_syncs table for this)
    await this.supabase
      .from('synced_routes')
      .insert({
        profile_id: profileId,
        activity_route_id: routeId,
        provider: 'wahoo',
        external_id: wahooRoute.id.toString(),
      });
    
    return wahooRoute.id;
  }
  
  private async getWahooRouteId(routeId: string): Promise<number | null> {
    const { data } = await this.supabase
      .from('synced_routes')
      .select('external_id')
      .eq('activity_route_id', routeId)
      .eq('provider', 'wahoo')
      .single();
    
    return data ? parseInt(data.external_id) : null;
  }
}
```

**Note**: You'll need to create a `synced_routes` table similar to `synced_planned_activities`:

```sql
CREATE TABLE synced_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_route_id UUID NOT NULL REFERENCES activity_routes(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('wahoo', 'strava', 'trainingpeaks')),
  external_id TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(activity_route_id, provider)
);

CREATE INDEX idx_synced_routes_profile_id ON synced_routes(profile_id);
CREATE INDEX idx_synced_routes_route_id ON synced_routes(activity_route_id);
```

### 4.2 Update Wahoo Sync Service

**Location**: `packages/trpc/src/lib/integrations/wahoo/sync-service.ts`

```typescript
// Update syncPlannedActivity to include route
private async createNewSync(plannedActivity: PlannedActivity, ...args) {
  // ... existing code
  
  // Sync route if exists
  let wahooRouteId: number | null = null;
  if (plannedActivity.activity_route_id) {
    const routeSync = new WahooRouteSync(this.supabase, this.wahooClient);
    wahooRouteId = await routeSync.syncRoute(
      plannedActivity.activity_route_id,
      plannedActivity.profile_id
    );
  }
  
  // Convert plan with route reference
  const wahooPlan = convertToWahooPlan(structure, {
    ...options,
    routeId: wahooRouteId,
  });
  
  // Continue with workout creation...
}
```

**Update**: `packages/trpc/src/lib/integrations/wahoo/plan-converter.ts`

```typescript
export interface ConvertOptions {
  // ... existing options
  routeId?: number; // Wahoo route ID
}

export function convertToWahooPlan(
  structure: ActivityPlanStructure,
  options: ConvertOptions
): WahooPlanJson {
  const plan: WahooPlanJson = {
    header: {
      // ... existing header
      route_id: options.routeId || null, // NEW
    },
    // ... rest of plan
  };
  
  return plan;
}
```

### 4.3 Strava Route Integration (Future)

**Location**: `packages/trpc/src/lib/integrations/strava/route-sync-service.ts` (NEW FILE)

```typescript
// Similar to Wahoo, but use Strava API
// POST /api/v3/routes
// Requires activity:write scope

export class StravaRouteSync {
  async uploadRoute(routeId: string, profileId: string): Promise<string> {
    // Get GPX
    // Upload to Strava
    // Store mapping
    // Return Strava route ID
  }
}
```

---

## Phase 5: Advanced Features (Future)

### 5.1 Google Directions API (MVP+)

For users who don't have GPX files, allow generating routes:

```typescript
// packages/trpc/src/lib/routes/directions-service.ts
import { Client } from '@googlemaps/google-maps-services-js';

export async function getDirections(
  origin: string,
  destination: string,
  mode: 'walking' | 'bicycling'
): Promise<GPXPoint[]> {
  const client = new Client({});
  
  const response = await client.directions({
    params: {
      origin,
      destination,
      mode,
      key: process.env.GOOGLE_MAPS_API_KEY!,
    },
  });
  
  // Decode polyline to coordinates
  const route = response.data.routes[0];
  const points = decodePolyline(route.overview_polyline.points);
  
  return points.map(p => ({ lat: p.latitude, lon: p.longitude }));
}
```

### 5.2 Turn-by-Turn Navigation (Future)

**Component**: `NavigationBanner` overlay on MapCard

- Show next turn instruction
- Distance to next turn
- ETA to destination
- Off-route detection

### 5.3 Offline Map Support (Future)

- Pre-download map tiles for route area
- Cache in SQLite or filesystem
- Use `react-native-maps` offline tile support

---

## Implementation Priority & Timeline

### **Sprint 1-2: Database & Backend Foundation** (MVP Critical)

**Estimated: 1-2 weeks**

- [ ] Create `activity_routes` table migration
- [ ] Add `activity_route_id` to `planned_activities`
- [ ] Setup Supabase Storage bucket and policies
- [ ] Install GPX parsing dependencies
- [ ] Create `gpx-parser.ts` utility
- [ ] Create `routes.ts` tRPC router
- [ ] Test GPX upload/parse/store flow
- [ ] Regenerate TypeScript types
- [ ] Update `ActivityPayload` interface

**Success Criteria:**
- Can upload GPX file via API
- Route stored in database with stats
- Preview coordinates compressed efficiently

### **Sprint 3-4: Frontend Route Selection** (MVP Critical)

**Estimated: 1-2 weeks**

- [ ] Create route upload screen UI
- [ ] Update planned activity creation with route selector
- [ ] Update `plannedActivities.create` mutation
- [ ] Update `plannedActivities.getById` to include route
- [ ] Update plan tab to load route data
- [ ] Update activitySelectionStore payload
- [ ] Test end-to-end route selection flow

**Success Criteria:**
- Can upload GPX from mobile app
- Can select route when creating planned activity
- Route data flows to activity selection

### **Sprint 5-6: MapCard Implementation** (MVP Critical)

**Estimated: 2 weeks**

- [ ] Install react-native-maps
- [ ] Configure Google Maps API keys
- [ ] Implement real MapCard component
- [ ] Add route polyline rendering
- [ ] Add recorded path polyline
- [ ] Implement zoom controls
- [ ] Add GPS info overlay
- [ ] Update RecordModal to pass route
- [ ] Update RecordingCarousel
- [ ] Test on iOS and Android devices

**Success Criteria:**
- Map displays with user location
- Planned route shown as gray dashed line
- Recorded path shown as orange solid line
- Zoom controls work
- No carousel gesture conflicts

### **Sprint 7-8: External Service Sync** (MVP+)

**Estimated: 1-2 weeks**

- [ ] Create `synced_routes` table
- [ ] Implement WahooRouteSync service
- [ ] Update Wahoo sync to include routes
- [ ] Test route upload to Wahoo
- [ ] Update plan-converter with route ID
- [ ] Add Strava route sync (if needed)

**Success Criteria:**
- Routes uploaded to Wahoo when syncing
- Wahoo workout references route
- Route mapping stored in database

### **Future Sprints: Enhancements**

- Google Directions API integration
- Turn-by-turn navigation
- Off-route detection
- Route drawing tool
- Elevation profile chart
- Route sharing/discovery
- Offline map caching

---

## Testing Strategy

### Unit Tests

```typescript
// Test GPX parsing
describe('GPX Parser', () => {
  it('should parse valid GPX file', () => {
    const gpx = parseGPX(validGPXString);
    expect(gpx.tracks).toHaveLength(1);
    expect(gpx.tracks[0].segments[0].points.length).toBeGreaterThan(0);
  });
  
  it('should throw on invalid GPX', () => {
    expect(() => parseGPX('<invalid>')).toThrow('Invalid GPX');
  });
  
  it('should calculate distance correctly', () => {
    const points = [
      { lat: 0, lon: 0 },
      { lat: 0.01, lon: 0 }, // ~1.11 km
    ];
    const stats = calculateRouteStats(points);
    expect(stats.distance).toBeCloseTo(1110, -2);
  });
  
  it('should simplify coordinates while preserving shape', () => {
    const route = generateTestRoute(1000);
    const simplified = simplifyCoordinates(route, 0.0001);
    expect(simplified.length).toBeLessThan(route.length);
    expect(simplified.length).toBeGreaterThan(100);
  });
  
  it('should compress/decompress coordinates', () => {
    const original = [
      { lat: 37.7749, lon: -122.4194, ele: 50 },
      { lat: 37.7750, lon: -122.4195, ele: 51 },
    ];
    const compressed = compressCoordinates(original);
    const decompressed = decompressCoordinates(compressed, true);
    
    expect(decompressed).toHaveLength(2);
    expect(decompressed[0].lat).toBeCloseTo(37.7749, 4);
  });
});
```

### Integration Tests

```typescript
describe('Route Upload Flow', () => {
  it('should upload, parse, and store route', async () => {
    const gpxFile = readFileSync('test-route.gpx');
    const base64 = gpxFile.toString('base64');
    
    const result = await trpc.routes.upload.mutate({
      fileName: 'test-route.gpx',
      fileData: base64,
      name: 'Test Route',
      activityType: 'outdoor_bike',
    });
    
    expect(result.id).toBeDefined();
    expect(result.total_distance).toBeGreaterThan(0);
    
    // Verify in database
    const route = await trpc.routes.getById.query({ id: result.id });
    expect(route.coordinates.length).toBeGreaterThan(0);
  });
  
  it('should create planned activity with route', async () => {
    const route = await createTestRoute();
    const plan = await createTestPlan();
    
    const planned = await trpc.plannedActivities.create.mutate({
      activity_plan_id: plan.id,
      scheduled_date: new Date().toISOString(),
      activity_route_id: route.id,
    });
    
    expect(planned.activity_route_id).toBe(route.id);
    
    const fetched = await trpc.plannedActivities.getById.query({
      id: planned.id,
    });
    
    expect(fetched.activity_route).toBeDefined();
    expect(fetched.activity_route.coordinates).toHaveLength(route.preview_points);
  });
});
```

### E2E Tests (Detox)

```typescript
describe('Complete Route Recording Flow', () => {
  it('should record activity with route guidance', async () => {
    // 1. Upload route
    await element(by.id('routes-tab')).tap();
    await element(by.id('upload-route-button')).tap();
    await element(by.id('file-picker')).tap();
    // Select test GPX file
    await element(by.text('test-route.gpx')).tap();
    await element(by.id('route-name-input')).typeText('Test Route');
    await element(by.id('upload-button')).tap();
    await waitFor(element(by.text('Route uploaded'))).toBeVisible();
    
    // 2. Create planned activity with route
    await element(by.id('plan-tab')).tap();
    await element(by.id('create-activity-button')).tap();
    await element(by.id('select-plan')).tap();
    await element(by.text('Test Plan')).tap();
    await element(by.id('select-route')).tap();
    await element(by.text('Test Route')).tap();
    await element(by.id('schedule-button')).tap();
    
    // 3. Start activity
    await element(by.id('start-activity-button')).tap();
    await waitFor(element(by.id('record-modal'))).toBeVisible();
    
    // 4. Verify map shows route
    await element(by.id('carousel')).swipe('left'); // Swipe to map card
    await waitFor(element(by.id('map-view'))).toBeVisible();
    await expect(element(by.id('planned-route-polyline'))).toBeVisible();
    await expect(element(by.id('route-info-banner'))).toHaveText('Following planned route');
    
    // 5. Simulate GPS movement
    await device.setLocation({ lat: 37.7749, lon: -122.4194 });
    await waitFor(element(by.id('recorded-path-polyline'))).toBeVisible();
    
    // 6. Finish activity
    await element(by.id('finish-button')).tap();
    await element(by.id('confirm-finish')).tap();
    
    // 7. Verify saved
    await waitFor(element(by.text('Activity saved'))).toBeVisible();
  });
});
```

### Manual Testing Checklist

**Map Rendering:**
- [ ] Map displays on iOS
- [ ] Map displays on Android
- [ ] Google Maps tiles load correctly
- [ ] User location marker appears

**Route Display:**
- [ ] Planned route shows as gray dashed line
- [ ] Route loads from GPX data
- [ ] Route is visible at appropriate zoom level

**Live Tracking:**
- [ ] Recorded path shows as orange solid line
- [ ] Path updates in real-time as user moves
- [ ] Map follows user location (follow mode)
- [ ] No lag with 1000+ recorded points

**Controls:**
- [ ] Zoom in/out buttons work
- [ ] Zoom doesn't break map centering
- [ ] GPS info overlay shows correct coordinates
- [ ] Route info banner shows when route loaded

**Carousel Integration:**
- [ ] Can swipe between cards smoothly
- [ ] Map doesn't capture pan gestures (scrollEnabled=false)
- [ ] Zoom buttons work while in carousel

**Permissions:**
- [ ] Location permission prompt appears
- [ ] Handles "Never" permission gracefully
- [ ] Background location works during recording

**Performance:**
- [ ] No frame drops while recording
- [ ] Battery usage acceptable (<10% per hour)
- [ ] App doesn't crash with long routes (10k+ points)

**Edge Cases:**
- [ ] Works with GPS disabled (indoor activities)
- [ ] Handles poor GPS signal
- [ ] Works without route (outdoor activity, no route selected)
- [ ] Works with route that has no elevation data

---

## Risk Mitigation & Performance

### Performance Concerns

**1. Large GPX Files (10k+ points)**

- **Risk**: Rendering 10,000 polyline points causes lag
- **Solution**:
  - Store simplified version (200-500 points) for preview
  - Use Douglas-Peucker algorithm with tolerance 0.0001 (~11m)
  - Only load full resolution when exporting

**2. Real-time Recording**

- **Risk**: Adding point every second (3,600 points/hour) slows rendering
- **Solution**:
  - Filter points by distance (min 5m between points)
  - Batch updates (update polyline every 5-10 points)
  - Use `useMemo` for coordinate arrays

**3. Map Tile Loading**

- **Risk**: Poor connectivity causes blank map
- **Solution**:
  - React Native Maps has built-in tile caching
  - Show loading indicator while tiles load
  - Consider offline map support (future)

### Cost Concerns

**Google Maps API Pricing:**

- **Maps SDK**: Free up to 28,000 map loads/month
- **Directions API**: $5 per 1,000 requests (after free tier)

**Mitigation:**
- Encourage GPX uploads over Directions API
- Cache generated directions
- Monitor usage with Google Cloud Console

### External Service Rate Limits

**Wahoo API:**
- Limits unknown (likely 100-1000 req/hour)
- Solution: Queue requests, implement exponential backoff

**Strava API:**
- 100 requests per 15 minutes
- 1,000 requests per day
- Solution: Batch operations, cache responses

### Battery Usage

**GPS tracking drains battery:**
- Expected: 5-10% per hour with active GPS
- Mitigation:
  - Use `desiredAccuracy: "balanced"` (not "high")
  - Batch location updates (every 5 seconds, not every second)
  - Allow users to disable map card if needed

---

## Current Implementation Status

**As of [Date]: 0% Complete**

All phases outlined above are **requirements**, not current state. The existing codebase has:

✅ GPS tracking infrastructure  
✅ Activity recording service  
✅ Database support for coordinate storage  
✅ Wahoo integration for plans  

❌ No route database schema  
❌ No GPX handling  
❌ No MapCard implementation  
❌ No route selection UI  
❌ No external route sync  

**Next Step**: Begin with Phase 0 (Database Foundation).

---

## Summary

This plan provides a complete roadmap for implementing GPS routing and tracking features in GradientPeak. The implementation is broken into logical phases:

1. **Phase 0**: Database foundation (activity_routes table, storage)
2. **Phase 1**: Backend GPX service and API
3. **Phase 2**: Frontend route selection in plan creation
4. **Phase 3**: MapCard with live tracking
5. **Phase 4**: External service route sync (Wahoo, Strava)
6. **Phase 5**: Advanced features (turn-by-turn, offline maps)

**Estimated Timeline**: 4-6 sprints (8-12 weeks) for MVP completion.

**Key Success Metrics**:
- Users can upload GPX routes
- Routes can be selected when creating planned activities
- Map displays planned route and recorded path in real-time
- Routes sync to Wahoo when syncing workouts
- No performance issues with 1000+ coordinate points

Start with database foundation, build backend services, then implement frontend features. This bottom-up approach ensures solid infrastructure before adding UI complexity.
