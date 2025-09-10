# TurboFit Hybrid Architecture Migration Roadmap
**From Edge Functions → Next.js API (Keeping Supabase Auth + Storage)**

## 🏗️ Hybrid Architecture Strategy

### **Strategic Approach**
**Keep Supabase For:**
- 🔐 **Authentication**: Login, signup, JWT token management
- 📁 **Storage**: Activity files, images, media assets
- 🔄 **Real-time**: WebSocket subscriptions (if needed)

**Migrate to Next.js API For:**
- 🧮 **Business Logic**: Activity CRUD, analytics, training calculations
- 🔄 **Sync Operations**: Complex offline-first synchronization
- 📊 **Server-side Computation**: Training load modeling, zone calculations
- 🎯 **Custom API Logic**: Everything requiring your core business rules

---

## 🎯 New Architectural Vision

### **Hybrid Flow**
```
Mobile App → Supabase Auth (tokens) → Next.js API Routes → Drizzle ORM → PostgreSQL
     ↓
Supabase Storage (files/media)
```

### **Benefits of Hybrid Approach**
1. **Simplified Auth**: No custom JWT implementation needed
2. **Proven File Handling**: Supabase Storage handles uploads seamlessly
3. **Full Business Logic Control**: Next.js API for all custom logic
4. **Unified Backend**: Share business logic between web and mobile
5. **Type Safety**: End-to-end TypeScript with existing auth infrastructure
6. **Reduced Complexity**: Keep what works, migrate what needs control

---

## 📋 Updated Migration Implementation Roadmap

### **Phase 1: Hybrid API Infrastructure Setup**
**Duration: 1-2 weeks**

#### **Authentication Integration**
- [ ] **Middleware Setup**: Verify Supabase JWT tokens in Next.js middleware
- [ ] **Auth Utilities**: Helper functions for extracting user from Supabase token
- [ ] **Session Management**: Integrate with existing Supabase auth flow (no changes needed on mobile)

#### **Next.js API Routes Development**
- [ ] **Activity Business Logic**: Replace Edge Functions with API routes
  - `POST /api/activities` - Create new activity (business validation)
  - `GET /api/activities` - List with advanced filtering/sorting
  - `PUT /api/activities/[id]` - Update with training calculations
  - `DELETE /api/activities/[id]` - Soft delete with cascade logic
  - `GET /api/activities/[id]/analytics` - Training metrics computation

- [ ] **Profile & Training Management**
  - `GET /api/profile` - Enhanced profile with computed stats
  - `PUT /api/profile` - Update with zone recalculations
  - `POST /api/profile/training-zones` - Smart zone recommendations
  - `GET /api/profile/training-load` - CTL/ATL/TSB calculations

- [ ] **Advanced Sync Operations**
  - `POST /api/sync/activities` - Intelligent bulk sync with conflict resolution
  - `GET /api/sync/status` - Detailed sync status with recommendations
  - `POST /api/sync/resolve-conflicts` - Smart conflict resolution
  - `POST /api/sync/validate` - Pre-sync validation and optimization

#### **File Handling Strategy**
- [ ] **Keep Supabase Storage**: No changes to existing file upload flow
- [ ] **Metadata API**: `POST /api/files/metadata` - Store file references in PostgreSQL
- [ ] **File Processing**: Background processing of uploaded files via API routes
- [ ] **Storage Integration**: API routes fetch from Supabase Storage when needed

### **Phase 2: Mobile App Hybrid Integration**
**Duration: 2-3 weeks**

#### **Authentication Layer (No Changes)**
- [ ] **Verify Current Flow**: Ensure existing Supabase auth works seamlessly
- [ ] **Token Management**: Confirm JWT tokens work with Next.js middleware
- [ ] **Session Refresh**: Test automatic token refresh functionality

#### **Service Layer Updates**
- [ ] **Update ActivitySyncService**:
  ```typescript
  // Keep Supabase auth, switch API endpoints
  class ActivitySyncService {
    static async syncActivity(activity: LocalActivity) {
      const token = await supabase.auth.getSession(); // Keep existing
      const response = await fetch(`${API_BASE}/api/sync/activities`, {
        headers: { 'Authorization': `Bearer ${token.access_token}` }
      });
    }
  }
  ```

- [ ] **File Upload Service**:
  ```typescript
  // Hybrid approach: Upload to Supabase, metadata to Next.js
  class FileUploadService {
    static async uploadActivity(file: File) {
      // 1. Upload to Supabase Storage (existing)
      const { data } = await supabase.storage.from('activities').upload(path, file);

      // 2. Store metadata via Next.js API
      await fetch('/api/files/metadata', {
        method: 'POST',
        body: JSON.stringify({ path: data.path, type: 'activity' })
      });
    }
  }
  ```

#### **API Client Creation**
- [ ] **Typed API Client**: Generate types for Next.js endpoints
- [ ] **Error Handling**: Unified error handling for hybrid architecture
- [ ] **Retry Logic**: Smart retry with Supabase auth token refresh

### **Phase 3: Enhanced Business Logic & Web Dashboard**
**Duration: 2-3 weeks**

#### **Advanced API Features**
- [ ] **Training Analytics**:
  - `GET /api/analytics/training-load` - Advanced CTL/ATL modeling
  - `GET /api/analytics/performance-trends` - Long-term analysis
  - `GET /api/analytics/zone-distribution` - Training distribution analysis
  - `POST /api/analytics/predictions` - Performance predictions

- [ ] **Smart Recommendations**:
  - `GET /api/recommendations/training` - AI-powered training suggestions
  - `GET /api/recommendations/recovery` - Recovery recommendations
  - `POST /api/recommendations/plan` - Generate training plans

- [ ] **Background Processing**:
  - Queue system for heavy calculations
  - Activity file processing pipeline
  - Training load recalculation jobs

#### **Web Dashboard Integration**
- [ ] **Shared API**: Web dashboard uses same Next.js API routes
- [ ] **Enhanced Features**: Advanced analytics only available on web
- [ ] **Admin Capabilities**: User management, system analytics
- [ ] **Real-time Updates**: Supabase real-time for live dashboard updates

### **Phase 4: Performance Optimization & Testing**
**Duration: 1-2 weeks**

#### **Caching Strategy**
- [ ] **API Response Caching**: Redis for frequently accessed data
- [ ] **Database Query Optimization**: Leverage existing Drizzle queries
- [ ] **CDN Integration**: Static assets via Supabase Storage CDN

#### **Testing Strategy**
- [ ] **API Testing**: All Next.js endpoints with Supabase auth mocking
- [ ] **Integration Testing**: Mobile app with hybrid backend
- [ ] **Performance Testing**: Compare with current Edge Functions
- [ ] **Auth Flow Testing**: Ensure seamless Supabase auth integration

---

## 🔧 Technical Implementation Details

### **Authentication Middleware**
```typescript
// middleware.ts
import { createClient } from '@supabase/supabase-js'

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const token = request.headers.get('authorization')?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify Supabase JWT
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Add user to request headers for API routes
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', user.id)
    requestHeaders.set('x-user-email', user.email!)

    return NextResponse.next({
      request: { headers: requestHeaders }
    })
  }
}
```

### **Hybrid File Handling**
```typescript
// /api/activities/route.ts
export async function POST(request: Request) {
  const userId = request.headers.get('x-user-id')
  const { activity, fileReference } = await request.json()

  // Process business logic with your core packages
  const processedActivity = await ActivityCalculations.process(activity)

  // Save to database via Drizzle
  const result = await activityQueries.createActivity({
    ...processedActivity,
    userId,
    fileUrl: fileReference?.url // From Supabase Storage
  })

  return NextResponse.json(result)
}
```

### **Mobile Service Integration**
```typescript
// Updated mobile service - minimal changes
class ActivityService {
  // Auth unchanged - still Supabase
  static async authenticate(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  // File upload unchanged - still Supabase Storage
  static async uploadFile(file: File) {
    return supabase.storage.from('activities').upload(path, file)
  }

  // Business logic now via Next.js API
  static async syncActivities(activities: LocalActivity[]) {
    const { data: { session } } = await supabase.auth.getSession()

    return fetch(`${API_BASE}/api/sync/activities`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ activities })
    })
  }
}
```

---

## 🎯 Success Metrics

### **Performance Targets**
- **API Response Time**: < 200ms for business logic operations
- **Auth Performance**: No degradation (Supabase handles this)
- **File Upload**: No change (Supabase Storage unchanged)
- **Sync Performance**: < 5 seconds with enhanced conflict resolution

### **Development Benefits**
- **Reduced Auth Complexity**: No custom JWT implementation
- **File Handling Simplicity**: Proven Supabase Storage solution
- **Business Logic Control**: Full control over core application logic
- **Type Safety**: 100% TypeScript with minimal auth complexity

---

## ⚠️ Risk Mitigation

### **Hybrid Architecture Benefits**
1. **Lower Risk**: Keep proven auth and storage systems
2. **Incremental Migration**: Only business logic moves to Next.js
3. **Rollback Simplicity**: Easy to revert business logic changes
4. **Auth Reliability**: Supabase auth is battle-tested

### **Migration Strategy**
- **Auth Unchanged**: Zero risk to authentication flow
- **Storage Unchanged**: No file migration needed
- **API-Only Migration**: Only business logic endpoints change
- **Parallel Testing**: Run Edge Functions and Next.js APIs simultaneously

---

## 💡 Long-term Hybrid Benefits

### **Best of Both Worlds**
- **Supabase Strengths**: Auth, Storage, Real-time capabilities
- **Next.js Strengths**: Custom business logic, unified codebase, advanced APIs
- **Simplified Operations**: Fewer systems to maintain than full migration
- **Enhanced Capabilities**: Advanced business logic with proven infrastructure

### **Future Flexibility**
- **Easy Auth Migration**: Could migrate auth later if needed
- **Storage Options**: Could add additional storage providers
- **Microservices Ready**: Clear separation of concerns for future scaling

---

## 🚀 Immediate Next Steps

1. **Week 1**: Set up Next.js middleware for Supabase JWT verification
2. **Week 1**: Create first API route (`/api/activities`) with existing auth
3. **Week 2**: Update mobile app to hit Next.js API while keeping Supabase auth/storage
4. **Week 2**: Test hybrid flow end-to-end

**This hybrid approach gives you the benefits of the migration while minimizing complexity and risk!**
