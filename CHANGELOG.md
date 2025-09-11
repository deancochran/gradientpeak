# Changelog

All notable changes to the TurboFit project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Activity Recording System**: Enhanced GPS and Bluetooth indicator UX improvements
  - GPS ready indicator now shows green when GPS is connected and capable of recording location info (not just when actively recording)
  - Bluetooth indicator shows green when devices are connected and Bluetooth is enabled
  - **Enhanced Bluetooth Modal**: Complete UX overhaul for MVP simplicity
    - Auto-triggers device search when modal opens (no manual button press required)
    - Auto-stops search after timeout or when no new devices found for 10 seconds
    - Modal stays open when user connects/disconnects devices for easier multi-device management
    - Connected devices listed above available devices for better organization
    - Simplified device listing with signal strength icon and connect/disconnect buttons
    - Connect/disconnect buttons show loading states during connection process
    - Removed device icons, descriptions, and dBM counts for cleaner MVP interface
    - Improved timeout management and error handling for better reliability

### Fixed
- **Activity Recording System**: Complete consolidation and modal fixes
  - **Consolidated Recording Screens**: Merged `record.tsx` and `record-enhanced.tsx` into single, optimized recording screen
  - **Fixed Modal Visibility Issues**: Resolved React Native modal conflicts where permissions and BLE modals weren't appearing
  - **Fixed Modal Stacking**: Main recording modal now conditionally hides when sub-modals (permissions/BLE) are open
  - **Fixed "Permissions Required" Button**: Resolved issue where button text never changed to "Start Activity" after granting permissions
  - Fixed permissions check to only require essential permissions (location, bluetooth, motion) for recording start
  - Made background location permission optional for basic recording functionality
  - Fixed permissions indicator not showing popup when clicked - now opens comprehensive permissions modal
  - Fixed BLE indicator not opening device selection modal - now properly triggers EnhancedBluetoothModal
  - Fixed BLE connection UI reactivity - device connection states now update in real-time
  - Restructured recording modal layout with new RecordingHeader component
  - Completely removed "Start Activity" text from header, leaving only GPS, permissions, and BLE indicators
  - Moved recording controls to footer with improved Start/Stop/Pause/Resume layout
  - Removed redundant ActivityStatusBar component and replaced with integrated header indicators
  - Added PermissionsModal for comprehensive permission management with detailed explanations
  - Enhanced RecordingControls component with better visual hierarchy and accessibility
  - Fixed permission request flow to use proper modal workflow instead of system alerts
  - Added background location permission support for continuous GPS tracking (optional)
  - Improved sensor connection status indicators with real-time badge updates
  - Added extensive debug logging for troubleshooting modal and permission issues

### Added
- **Trends Screen**: Complete implementation with fault-tolerant design
  - Training Load Progression Chart showing CTL, ATL, TSB over time from real activity data
  - Power Zone Distribution Chart with stacked visualization for cycling activities  
  - Heart Rate Zone Distribution Chart showing cardiovascular load patterns
  - Power vs Heart Rate Trend Chart for tracking efficiency improvements
  - Performance Power Curve Chart displaying best efforts across all durations
  - Real-time data integration from completed, synced activities only
  - Graceful handling of missing data with informative placeholder charts
  - Sample data generation for testing when insufficient activity data exists
  - Period selection (7D, 30D, 90D, 1Y) with intelligent data sampling
- **Core Package**: Added comprehensive trends calculation functions in `calculations/trends.ts`
  - `calculateTrainingLoadProgression()` for exponential weighted CTL/ATL/TSB analysis
  - `calculatePowerZoneDistribution()` for time-in-zone aggregation across activities
  - `calculateHeartRateZoneDistribution()` for HR zone time analysis
  - `calculatePowerHeartRateTrend()` for 5W power bucket efficiency tracking
  - `calculatePowerCurve()` for best effort power analysis across durations
  - `validateTrendsData()` for comprehensive data availability validation
  - New TypeScript types: `TrendsActivity`, `TrendsTimeFrame`, `TrainingLoadTrendPoint`, etc.
- **Mobile App**: New `TrendsService` for intelligent activity data aggregation
  - Real activity data loading from local JSON files with stream processing
  - Comprehensive data validation and availability checking (minimum 3-5 activities)
  - Automatic fallback to sample data for development and testing
  - Integration with existing activity recording and sync system
  - Fault-tolerant design handles missing sensors, incomplete data, sparse activities
- **Database**: Enhanced local_activities schema with `cached_metadata` field for processed activity data

### Changed
- **BREAKING**: Removed FIT file generation and storage in favor of JSON-based local storage
- Updated local_activities schema to use `localStoragePath` instead of `localFitFilePath`
- Activity completion workflow now saves JSON files locally and syncs to cloud storage
- Local JSON files are automatically cleaned up after successful cloud sync
- Export format settings updated to use JSON as default instead of FIT
- Activity recording system now uses comprehensive JSON format for all activity data

### Removed
- FIT file generation logic from activity completion service
- `generateFitFile` option from completion workflow
- FIT file export format from user settings
- `importFitFile` methods replaced with `importJsonFile` equivalents

### Added
- Initial TurboFit monorepo setup with Turborepo and Bun
- Core package with database-independent business logic and Zod schemas
- Mobile app foundation with Expo 53 and React Native 0.79.5
- Web dashboard foundation with Next.js 15 and React 19
- Drizzle ORM package for type-safe database operations
- Shared TypeScript and ESLint configurations
- Local-first architecture with Expo SQLite and Supabase sync
- Enhanced fault-tolerant activity recording system with GPS tracking and BLE sensor support
- Multi-sensor BLE integration (heart rate, power, cadence, speed, smartwatch)
- Planned activity selection and guidance during recording sessions
- Real-time activity step compliance monitoring for structured workouts
- Training load analytics (CTL/ATL/TSB) with real data integration
- Performance metrics calculation from recorded activities
- User authentication and profile management
- JSON-first activity storage architecture with cloud sync
- Streamlined activity completion workflow with single summary modal
- Enhanced activity summary with performance analysis and training metrics

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
- ✅ Enhanced fault-tolerant activity recording system complete
- ✅ Multi-sensor BLE integration with smartwatch support
- ✅ Planned activity integration with real-time guidance
- ✅ Real performance metrics display on home screen
- ✅ Core business logic calculations functional
- ✅ Local-first data storage with cloud sync
- ✅ Streamlined activity completion workflow
- ✅ Activity summary modal with comprehensive performance analysis
- 🔄 Activity detail screens in development
- 🔄 Training plan system partially implemented
- 🔄 Charts and analytics visualization in progress

### Fixed
- Added missing Zod dependency to core package
- Created core package README documentation
- Initialized CHANGELOG for project tracking
- Replaced basic recording screen with enhanced fault-tolerant version
- Eliminated blocking popups during activity recording sessions
- Fixed activity completion workflow to use single summary modal
- Enhanced error handling and recovery mechanisms in recording system
- Improved sensor data validation and stale data filtering
- **Migration applied**: Updated local_activities schema from `localFitFilePath` to `localStoragePath`
- **Database compatibility**: Added migration support for schema changes
- **Type safety improvements**: Fixed property name mismatches in activity completion service

### Technical Debt
- TypeScript compilation errors across multiple files
- Some test infrastructure defined but not fully implemented
- Web app README needs updating from default template
- Planned activity templates need expansion and testing
- Activity metadata type definitions need standardization

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