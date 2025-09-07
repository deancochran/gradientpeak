# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TurboFit is a sophisticated fitness tracking platform built with modern local-first architecture using a Turborepo monorepo structure. The application combines a React Native mobile app with a Next.js web dashboard, both sharing common packages and infrastructure.

## Architecture

### Monorepo Structure
- **Turborepo** with **Bun** package manager
- **Root level** coordinated builds, testing, and development
- **Shared packages** for consistent types, configuration, and utilities

### Applications
- **`apps/native/`** - Expo 53 + React Native 0.79.5 mobile app
  - Expo-SQLite for local-first data storage
  - Supabase client for cloud synchronization
  - NativeWind 4.1 for styling
  - Jest for testing with Maestro for E2E tests
- **`apps/web/`** - Next.js 15 + React 19 web dashboard
  - Turbopack for fast builds
  - Supabase for backend services
  - Tailwind CSS for styling

### Shared Packages
- **`packages/supabase/`** - Shared database types and schemas
- **`packages/eslint-config/`** - Common ESLint configuration
- **`packages/typescript-config/`** - Shared TypeScript settings
- **`packages/testing-utils/`** - Common testing utilities

## Development Commands

### Root Level Commands (run from project root)
```bash
bun dev          # Start all development servers
bun build        # Build all applications
bun lint         # Lint all code across monorepo
bun test         # Run all tests
bun check-types  # Type check all packages
bun format       # Format code with Prettier
```

### Test Commands
```bash
bun test:unit           # Unit tests only (excludes e2e)
bun test:integration    # Integration tests
bun test:e2e           # All E2E tests
bun test:e2e:web       # Web E2E tests only
bun test:e2e:mobile    # Mobile E2E tests only (Maestro)
bun test:watch         # Watch mode for tests
bun test:coverage      # Tests with coverage reports
```

### Mobile App Commands (from apps/native/)
```bash
bun dev              # Start Expo development server
bun android          # Run on Android emulator
bun ios              # Run on iOS simulator
bun test             # Jest tests in watch mode
bun test:e2e         # Maestro E2E tests
bun lint             # ESLint with expo config
```

### Web App Commands (from apps/web/)
```bash
bun dev     # Next.js dev with Turbopack
bun build   # Production build with Turbopack
bun start   # Start production server
bun lint    # ESLint for web app
```

## Key Technologies & Patterns

### Mobile App Architecture
- **Local-first design** - Expo-SQLite SQLite for instant data access
- **Cloud synchronization** - Background sync to Supabase when connected
- **FIT file processing** - Local generation and cloud storage of fitness data
- **Real-time GPS tracking** - High-frequency location data collection
- **Offline functionality** - Full app functionality without internet

### Data Flow
- **Recording** - Activities recorded locally first (Expo-SQLite)
- **Synchronization** - Background sync to Supabase PostgreSQL
- **Analytics** - Cloud processing for dashboard insights
- **Conflict resolution** - Smart merging of local and server data

### Authentication & Security
- **Supabase Auth** - JWT-based authentication
- **Row Level Security** - Database-level access control
- **Encrypted local storage** - Secure offline data

## Environment Configuration

### Required Environment Variables
**Mobile app** (`apps/native/.env`):
```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_KEY=your_supabase_anon_key
```

**Web dashboard** (`apps/web/.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Database Schema

### Core Tables (Supabase PostgreSQL)
- **users** - User profiles and preferences
- **activities** - Synced workout activities with metrics
- **activity_segments** - GPS and time-based activity data
- **user_metrics** - Pre-calculated performance analytics
- **user_achievements** - Gamification and milestones
- **fit_files** - FIT file metadata and storage references

### Local Storage (Expo-SQLite - Mobile Only)
- **local_activities** - Real-time activity recording
- **local_segments** - GPS tracking during workouts
- **local_fit_data** - Raw FIT file data before cloud upload
- **sync_queue** - Pending sync operations

## Code Conventions

### TypeScript
- Strict mode enabled across all packages
- Shared types from `@repo/supabase` package
- Database types auto-generated from Supabase schema

### Testing Strategy
- **Unit tests** - Jest across all packages
- **Integration tests** - API and database testing
- **E2E tests** - Maestro for mobile, potential Playwright for web
- **Coverage** - Comprehensive coverage requirements

### Styling
- **Mobile** - NativeWind (Tailwind for React Native)
- **Web** - Tailwind CSS with Radix UI components
- **Consistent** - Shared design tokens and patterns

## Development Notes

### Package Manager
- Uses **Bun** as the package manager (not npm/yarn)
- Workspace dependencies use `workspace:*` protocol

### Build System
- **Turbo** orchestrates builds across monorepo
- **Turbopack** for Next.js development and builds
- Cached builds for performance

### Mobile Development
- **Expo SDK 53** with React Native 0.79.5 New Architecture
- **EAS Build** for production deployments
- **Maestro** for mobile E2E testing

### Key Dependencies
- **Supabase** - Backend-as-a-service (PostgreSQL, Auth, Storage)
- **Expo-SQLite** - Reactive database for React Native
- **React Query** - Data fetching and synchronization
- **Zustand** - State management
- **React Navigation** - Mobile navigation
