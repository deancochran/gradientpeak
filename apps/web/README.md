# TurboFit Web Dashboard

A modern fitness analytics dashboard built with Next.js 15, React 19, and Tailwind CSS. Provides comprehensive training analysis, performance tracking, and data visualization for the TurboFit fitness platform.

## 🌐 Overview

The TurboFit web dashboard serves as the analytical companion to the mobile app, offering detailed insights into training data, performance trends, and comprehensive activity analysis. Built with server-side rendering and optimized for fast data visualization.

## 🚀 Tech Stack

### Core Framework
- **Next.js 15** - React framework with Turbopack for fast builds
- **React 19** - Latest React with concurrent features
- **TypeScript 5** - Type safety and developer experience
- **Turbopack** - Ultra-fast bundler for development and production

### Backend & Database
- **Supabase** - PostgreSQL backend with real-time subscriptions
- **tRPC** - TypeScript-first RPC framework
- **Row Level Security** - JWT-based data access control
- **Server Components** - Optimized data fetching with caching

### Styling & UI
- **Tailwind CSS 4** - Utility-first styling with latest features
- **Radix UI** - Accessible component primitives
- **Shadcn/ui** - Beautiful component library built on Radix
- **Lucide React** - Consistent icon library
- **Class Variance Authority** - Type-safe component variants

### Data & State
- **React Query/TanStack Query** - Server state management and caching
- **React Hook Form** - Form handling with validation
- **Zod** - Schema validation and type generation
- **@repo/core** - Shared business logic and calculations


## 🎯 Key Features

### 📊 Advanced Analytics Dashboard
- **Training Load Analysis** - CTL/ATL/TSB progression charts
- **Performance Trends** - Power/speed progression over time
- **Zone Distribution** - Heart rate and power zone analysis
- **Activity Comparisons** - Side-by-side performance analysis
- **Personal Records** - PR tracking and historical analysis

### 📱 Activity Management
- **Activity Library** - Comprehensive activity history with search/filter
- **Detailed Analysis** - Individual activity breakdowns with maps
- **Bulk Operations** - Multi-select for editing/deleting activities
- **Data Export** - Export activities in multiple formats (JSON, TCX, CSV)

### 📋 Training Plan Management
- **Plan Library** - Browse and assign training plans
- **Plan Progress** - Visual progress tracking and compliance scoring
- **Plan Customization** - Modify plans based on performance
- **Scheduled Activities** - Calendar view of planned activities

### 🔐 User Management
- **Profile Settings** - FTP, zones, preferences, and goals
- **Data Privacy** - Granular privacy controls for activities
- **Account Management** - Subscription and billing (future)
- **Data Backup** - Export all user data

## 🔧 Development

### Prerequisites
- **Node.js 18+** (recommended: use with Bun)
- **Bun** package manager
- **Supabase** account and project
- **PostgreSQL** database (via Supabase)

### Environment Setup

Create `.env.local` in the web app root:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Next.js Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret

# Optional: Analytics
NEXT_PUBLIC_GA_ID=your_google_analytics_id
```

### Development Commands

```bash
# Start development server with Turbopack
bun dev

# Build for production with Turbopack
bun build

# Start production server
bun start

# Lint code
bun lint

# Type checking
bun run check-types
```

### Database Integration


```typescript

// Type-safe database queries
const userActivities = await db
  .select()
  .from(activities)
  .where(eq(activities.userId, userId));
```

## 🎨 Component Architecture

### Atomic Design Principles
- **Atoms** - Basic UI elements (buttons, inputs, icons)
- **Molecules** - Simple component combinations (search bars, cards)
- **Organisms** - Complex components (charts, forms, tables)
- **Templates** - Page layouts and structure
- **Pages** - Complete page implementations

### Shared Components
Components are built for reusability across dashboard sections:

```typescript
// Example: Reusable metric card
<MetricCard
  title="Training Stress Score"
  value={tss}
  trend={tssChange}
  format="number"
  icon={<TrendingUp />}
/>
```

## 📈 Performance Optimization

### Next.js 15 Features
- **Turbopack** - Ultra-fast bundling for development and builds
- **Server Components** - Reduced client-side JavaScript
- **Streaming** - Progressive page loading with Suspense
- **Image Optimization** - Automatic image optimization and lazy loading

### Data Optimization
- **React Query** - Intelligent caching and background updates
- **Pagination** - Efficient large dataset handling
- **Virtual Scrolling** - Performance for large activity lists
- **Optimistic Updates** - Immediate UI feedback

### Analytics Integration
- **Real-time Calculations** - Client-side metrics using `@repo/core`
- **Background Processing** - Heavy calculations moved to server
- **Caching Strategy** - Multi-level caching for fast page loads

## 🔒 Security & Authentication

### Authentication Flow
1. **Supabase Auth** - JWT-based authentication
2. **Middleware Protection** - Route-level access control
3. **Row Level Security** - Database-level data protection
4. **Session Management** - Secure token refresh

### Data Privacy
- **User Consent** - Granular privacy controls
- **Data Encryption** - Encrypted sensitive data at rest
- **Audit Logging** - Complete access and modification tracking
- **GDPR Compliance** - Data export and deletion capabilities

## 🧪 Testing Strategy

### Component Testing
```bash
# Unit tests for components
bun test:unit

# Integration tests for API routes
bun test:integration

# E2E tests (future: Playwright)
bun test:e2e
```

### Performance Testing
- **Lighthouse** - Core web vitals monitoring
- **Bundle Analysis** - JavaScript bundle size optimization
- **Database Query Analysis** - Query performance monitoring

## 🚀 Deployment

### Vercel Deployment (Recommended)
- **Automatic Deployment** - Push to main branch deploys automatically
- **Preview Deployments** - Every PR gets a preview URL
- **Edge Runtime** - Global performance optimization
- **Analytics** - Built-in performance monitoring

```bash
# Manual deployment
vercel --prod
```

### Alternative Deployment
The app can be deployed to any Node.js hosting provider:

```bash
# Build and start
bun build && bun start
```

## 🔄 Integration with Mobile App

### Data Synchronization
- **Real-time Sync** - Activities from mobile sync immediately to web
- **Conflict Resolution** - Smart merging of local and server data
- **Offline Handling** - Graceful handling of mobile offline periods

### Shared Business Logic
- **@repo/core Package** - Consistent calculations across platforms
- **Type Safety** - Shared TypeScript types prevent inconsistencies
- **Schema Validation** - Unified data validation with Zod

## 📚 Additional Resources

- [Next.js 15 Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Radix UI Documentation](https://www.radix-ui.com/docs)
- [TurboFit Core Package](../packages/core/README.md)
- [Database Schema](../packages/drizzle/README.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with appropriate tests
4. Run quality checks: `bun lint && bun test`
5. Submit a pull request

## 📝 License

This project is part of the TurboFit platform and follows the same MIT license as the monorepo.

---

**TurboFit Web Dashboard** - Comprehensive fitness analytics for serious athletes 📊
