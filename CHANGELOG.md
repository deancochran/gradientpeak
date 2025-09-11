# Changelog

All notable changes to the TurboFit project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial TurboFit monorepo setup with Turborepo and Bun
- Core package with database-independent business logic and Zod schemas
- Mobile app foundation with Expo 53 and React Native 0.79.5
- Web dashboard foundation with Next.js 15 and React 19
- Drizzle ORM package for type-safe database operations
- Shared TypeScript and ESLint configurations
- Local-first architecture with Expo SQLite and Supabase sync
- Activity recording system with GPS tracking and BLE sensor support
- Training load analytics (CTL/ATL/TSB) with real data integration
- Performance metrics calculation from recorded activities
- User authentication and profile management
- JSON-first activity storage architecture

### Technical Infrastructure
- Turborepo monorepo with workspace dependencies
- Bun package manager for fast development
- New Architecture enabled for React Native 0.79.5
- NativeWind 4.1 for mobile styling
- Tailwind CSS for web styling
- Comprehensive test setup with Jest and potential Maestro E2E
- EAS Build configuration for mobile deployments

### Current State
- ✅ Authentication system complete
- ✅ Activity recording infrastructure in place
- ✅ Real performance metrics display on home screen
- ✅ Core business logic calculations functional
- ✅ Local-first data storage with cloud sync
- 🔄 Activity recording UI needs completion
- 🔄 Activity detail screens in development
- 🔄 Training plan system planned
- 🔄 Charts and analytics visualization in progress

### Fixed
- Added missing Zod dependency to core package
- Created core package README documentation
- Initialized CHANGELOG for project tracking

### Technical Debt
- TypeScript compilation errors across multiple files
- Some test infrastructure defined but not fully implemented
- Web app README needs updating from default template
- Activity recording modal requires GPS/BLE integration completion

## [0.1.0] - 2024-01-XX (Initial Development)

### Added
- Project initialization and monorepo structure
- Core package architecture design
- Mobile and web application scaffolding
- Database schema design with Drizzle ORM
- Authentication flow implementation
- Basic activity tracking infrastructure

---

## Future Roadmap

### v1.0.0 - MVP Release
- Complete activity recording with GPS/BLE integration
- Individual activity analysis screens
- Training trends and charts with Victory Native
- Basic training plan system
- Activity management (edit, delete, export)
- Personal record tracking

### v1.1.0 - Enhanced Features  
- Advanced analytics and performance modeling
- Social features and activity sharing
- Training plan library and templates
- Third-party integrations (Strava, TrainingPeaks)
- Advanced sensor support and device compatibility

### v2.0.0 - Platform Expansion
- Coach/athlete relationship management
- Team and group training features
- Advanced data export and API access
- Enterprise features and multi-tenant support