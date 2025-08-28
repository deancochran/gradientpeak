# TurboFit 🏃‍♂️

A sophisticated, enterprise-grade fitness tracking platform built with modern local-first architecture. TurboFit delivers seamless offline-first experiences with intelligent cloud synchronization, real-time analytics, and cross-platform consistency.

## 🏗️ Architecture Overview

TurboFit is built as a **Turborepo monorepo** with enterprise-grade local-first architecture:

### 📱 Native Mobile App (`apps/native`)
- **Expo 53** + React Native 0.79.5 (New Architecture)
- **WatermelonDB** - High-performance local database for activity recording
- **Supabase Client** - Cloud sync and real-time features
- **NativeWind 4.1** - Native Tailwind CSS styling
- **Hybrid Architecture** - Local-first recording with intelligent cloud sync

### 🌐 Web Dashboard (`apps/web`)
- **Next.js 15** + React 19 (cutting-edge performance)
- **Turbopack** - Lightning-fast development builds
- **Supabase** - PostgreSQL backend with real-time subscriptions
- **Analytics Interface** - Comprehensive fitness insights and admin tools

### 🔗 Shared Infrastructure
- **Turborepo** with **Bun** package manager
- **TypeScript** throughout the stack
- **Supabase** - PostgreSQL with Row Level Security
- **Intelligent Sync Engine** - Conflict resolution and offline-first

## ✨ Key Features

### 🔄 Hybrid Local-First Architecture
- **Instant Activity Recording** - WatermelonDB handles real-time GPS tracking and FIT file creation
- **Intelligent Cloud Sync** - Automatic sync to Supabase when network is available
- **Conflict Resolution** - Smart merging of local and cloud data
- **FIT File Processing** - Local parsing and analysis with cloud backup storage

### 📊 Advanced Analytics
- **Real-Time Metrics** - Power curves, training load, recovery tracking
- **Performance Analytics** - Trends, comparisons, and insights
- **Achievement System** - Automated milestone detection and gamification
- **Dashboard Views** - Pre-calculated metrics for instant loading

### 🔐 Enterprise Security
- **Row Level Security** - Database-level access control
- **Encrypted Storage** - Secure local data management
- **Audit Logging** - Comprehensive tracking for compliance

### 🚀 Developer Experience
- **Type Safety** - End-to-end TypeScript with shared schemas
- **Hot Reloading** - Instant development feedback
- **Shared Components** - Consistent UI across platforms
- **Testing Suite** - Unit, integration, and E2E testing

## 🛠️ Tech Stack

| Layer | Mobile | Web | Backend |
|-------|--------|-----|---------|
| **Frontend** | Expo 53, React Native | Next.js 15, React 19 | - |
| **Local Storage** | WatermelonDB (SQLite) | - | - |
| **Cloud Database** | Supabase Client | Supabase | PostgreSQL |
| **Styling** | NativeWind 4.1 | Tailwind CSS | - |
| **State** | WatermelonDB + React Query | React Query + Zustand | - |

## 🚦 Getting Started

### Prerequisites
- **Node.js** 18+
- **Bun** package manager
- **Expo CLI** for mobile development
- **Supabase** account for cloud database

### Quick Setup

```bash
# Clone the repository
git clone https://github.com/your-org/turbofit
cd turbofit

# Install dependencies
bun install

# Set up environment variables
cp apps/native/.env.example apps/native/.env
cp apps/web/.env.local.example apps/web/.env.local

# Start development servers
bun dev
```

### Environment Configuration

**Mobile App** (`apps/native/.env`):
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_KEY=your_supabase_anon_key
```

**Web Dashboard** (`apps/web/.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## 📖 Development Guide

### Project Structure
```
turbofit/
├── apps/
│   ├── native/          # Mobile app (Expo + React Native)
│   └── web/             # Web dashboard (Next.js)
├── packages/
│   ├── database/        # Shared database schemas
│   └── config/          # Shared configuration
└── docs/                # Documentation
```

### Common Commands

**Root level** (runs across all apps):
```bash
bun dev          # Start all development servers
bun build        # Build all applications
bun lint         # Lint all code
bun test         # Run all tests
```

**Mobile development**:
```bash
cd apps/native
bun start        # Start Expo development server
bun ios          # Run on iOS simulator
bun android      # Run on Android emulator
```

**Web development**:
```bash
cd apps/web
bun dev          # Start Next.js development server
bun build        # Build production application
```

### Database Setup

1. **Create Supabase Project** and copy credentials
2. **Apply migrations** from `packages/database/migrations/`
3. **Configure Row Level Security** policies

> See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed setup instructions

## 🗄️ Database Architecture

### Core Tables (Supabase PostgreSQL)
- **users** - User profiles and preferences
- **activities** - Synced workout activities with comprehensive metrics
- **activity_segments** - GPS and time-based activity segments
- **user_metrics** - Pre-calculated performance analytics
- **user_achievements** - Gamification and milestone tracking
- **fit_files** - Metadata and cloud storage references

### Local Storage (WatermelonDB SQLite)
- **local_activities** - Real-time activity recording during workouts
- **local_segments** - GPS tracking data and time series
- **local_fit_data** - Raw FIT file data before processing
- **sync_queue** - Pending uploads and sync operations

### Hybrid Sync Strategy
- **Record Locally** - All activity data written to WatermelonDB first
- **Background Sync** - Automatic upload to Supabase when connected
- **Conflict Resolution** - Smart merging with server-side validation
- **FIT File Pipeline** - Local processing → Cloud storage → Analytics

## 🔐 Authentication Flow

2. **JWT token generated** with custom Supabase claims
3. **Database access** authorized via Row Level Security policies
4. **Local data sync** authenticated with bearer tokens

### Security Features
- **Database-level isolation** - RLS policies per user
- **Token refresh** - Automatic JWT rotation
- **Encrypted local storage** - Secure offline data
- **Audit logging** - Track all data access

## 📱 Mobile Features

### Hybrid Recording Architecture
- **Local-first activity recording** - WatermelonDB captures all workout data instantly
- **Real-time GPS tracking** - High-frequency location data stored locally
- **Background cloud sync** - Automatic sync to Supabase when network available
- **FIT file generation** - Local processing and cloud storage integration

### Performance Optimizations
- **WatermelonDB reactive queries** - Real-time UI updates during workouts
- **Efficient GPS batching** - Optimized location data collection
- **Smart sync scheduling** - Network-aware background uploads
- **Local FIT processing** - Parse and analyze without internet dependency

## 🌐 Web Dashboard

### Data Flow & Administration
- **Real-time metrics** - Live dashboards powered by Supabase subscriptions
- **Advanced visualizations** - Power curves, trends, and comparative analysis
- **Cloud analytics** - Server-side processing of synced activity data
- **User management** - Administrative tools and account oversight

### Administrative Features
- **User management** - Account administration
- **Data insights** - Platform-wide analytics
- **System monitoring** - Performance and health metrics
- **Bulk operations** - Efficient data management

## 🧪 Testing Strategy

### Comprehensive Test Coverage
- **Unit tests** - Component and function testing
- **Integration tests** - API and database integration
- **E2E tests** - Full user journey validation
- **Performance tests** - Load and stress testing

### Quality Assurance
- **TypeScript strict mode** - Compile-time error prevention
- **ESLint + Prettier** - Consistent code quality
- **Husky pre-commit hooks** - Automated quality checks
- **CI/CD validation** - Automated testing pipeline

## 🚀 Deployment

### Mobile App (Expo/EAS)
```bash
# Production builds
eas build --platform all --profile production

# Over-the-air updates
eas update --branch production --message "Feature update"
```

### Web Dashboard (Vercel)
```bash
# Automatic deployment on push to main
git push origin main

# Manual deployment
vercel --prod
```

## 📊 Performance Metrics

### Hybrid Architecture Benefits
- **⚡ Real-time recording** - Instant GPS tracking and activity capture via WatermelonDB
- **🔄 Smart sync** - Automatic background sync to Supabase cloud database
- **📱 Offline workouts** - Full functionality without internet connection
- **☁️ Cloud analytics** - Rich dashboard insights powered by Supabase

### Scalability Features
- **🚀 Multi-tenant** - Enterprise-ready architecture
- **📈 Horizontal scaling** - Database read replicas
- **🗂️ File storage** - Efficient binary data handling
- **⚡ Caching layers** - Optimized query performance

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow
1. **Fork the repository** and create a feature branch
2. **Make your changes** with tests and documentation
3. **Run quality checks** - `bun lint && bun test`
4. **Submit a pull request** with clear description

## 📄 Documentation

- [**Setup Guide**](SETUP_GUIDE.md) - Complete installation and configuration
- [**Architecture Guide**](CLAUDE.md) - Technical implementation details
- [**API Documentation**](docs/api/) - Database schemas and endpoints
- [**Component Library**](packages/ui/README.md) - Shared UI components

## 📝 License

This project is licensed under the [MIT License](LICENSE).

## 🙏 Acknowledgments

Built with modern tools and technologies:
- [Expo](https://expo.dev) - Cross-platform mobile development
- [Next.js](https://nextjs.org) - React web framework
- [WatermelonDB](https://watermelondb.dev) - Reactive database
- [Supabase](https://supabase.com) - Backend-as-a-service
- [Turborepo](https://turbo.build) - Monorepo build system

---

**TurboFit** - Enterprise-grade fitness tracking with local-first architecture 🚀
