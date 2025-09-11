# Changelog

All notable changes to the TurboFit project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Recording UX Refactor**: Complete overhaul of recording interface from modal-based to themed view architecture
  - **Removed Modal-Based Interface**: Eliminated all modals except activity summary, converted to single themed view
  - **Three-Section Layout**: Created header/body/footer components with shared state access for recording session, user selections, BLE devices, permissions, GPS data
  - **Reactive Header Component**: Always-accessible permissions and bluetooth controls with real-time connection status indicators and minimal styling
  - **Dynamic Body Component**: Activity selection interface transitions to planned workout display or unplanned activity metrics based on selection state
  - **Context-Aware Footer Controls**: Recording buttons only (start/pause/resume/finish) with state-based visibility, planned activities blocked until required metrics available, no automatic state changes
  - **Centralized State Management**: Cross-component synchronization of recording states, user selections, device connections, permissions, and GPS data
  - **Activity Selection Flow**: Binary planned/unplanned choice, activity type selection for unplanned activities, prevents recording until selection complete
  - **Minimal UI/UX**: Bare functional styling, no complex animations, simple readable typography focused on information visibility
  - **New Components**: RecordingBodySection for dynamic content rendering, updated RecordingHeader and RecordingControls for reactive behavior
  - **Requirements Display Enhancement**: When activity selected but requirements not met, body displays detailed breakdown with interactive permission buttons and GPS guidance instead of generic footer message
- **Expo Router Navigation Refactoring**: Resolved modal stacking conflicts in activity recording
  - Created `(session)` route group to isolate recording session from main tab navigation
  - Moved `record.tsx` from `(internal)` to `(session)` group for better isolation
  - Created dedicated modal screens: `bluetooth.tsx`, `permissions.tsx` (select-workout later consolidated into record screen)
  - Created `(modal)` route group for app-wide modals like password reset
  - Updated tab layout with floating action button instead of record tab
  - Integrated existing modal components with navigation-based approach
  - Updated deep links and Supabase redirect URLs to use new modal paths
  - Recording session now remains mounted during modal presentation, preventing state loss
- **Recording Session UX Improvements**: Enhanced user experience during activity recording
  - Recording state is now controlled exclusively by recording buttons after session starts
  - Close button (X) is hidden when activity is actively recording to prevent accidental exits
  - Changed close button icon from down arrow to X mark for better clarity
  - Performance metrics now display in a responsive 2-column grid layout
  - GPS, permissions, and BLE status indicators moved to top-right corner for better visibility
  - Updated terminology: "Start Free Activity" changed to "Start Unplanned Activity"
  - Fixed modal black screen issues with improved presentation configuration
  - Removed "recording continues in background" notice for cleaner interface
  - Simplified recording controls: only pause button visible when actively recording
  - When paused, users can only resume, discard, or finish the activity
  - Users must now select an activity type before starting unplanned activities
  - Activity type is prominently displayed in the recording header with emoji and environment info
  - Activity recording automatically adapts based on activity type constraints (indoor vs outdoor)
  - Speed/pace display switches based on activity type (running shows pace, cycling shows speed)
  - Each metric now displays its data source (GPS, Bluetooth sensors, calculated, etc.)
  - Bluetooth sensor data takes precedence over default recording settings when available
  - Activity constraints prevent inappropriate metrics (e.g., no GPS tracking for indoor activities)
  - Unified "finish" action replaces separate "stop" button for consistency
  - Activity completion automatically redirects to internal home page
- **Recording UX Redesign**: Unified single-screen experience for activity selection and recording
  - Combined workout selection directly into the record screen, eliminating separate modals
  - Users must complete workout selection (planned workout or activity type) before recording
  - Smooth state transitions between selection mode and active recording mode
  - Dynamic content display: planned workout guidance for structured activities, live metrics for free activities
  - Context-aware UI that adapts based on recording state (selection → recording → paused)
  - Streamlined user flow reduces navigation complexity and improves recording start time
- **Consolidated Record Screen Implementation**: ✅ Complete - Simplified modal architecture by removing redundant selection modals
  - Removed separate SelectWorkoutModal and SelectActivityTypeModal files
  - All activity selection logic now consolidated within single record screen
  - Record screen handles complete workflow: selection → type confirmation → recording
  - State management clearly differentiates between selection phase and recording phase
  - Planned activities automatically load workout guidance visual when selected
  - Unplanned activities require activity type selection before recording metrics display
  - Close button available during selection phase, automatically hidden when recording starts
  - Record screen header and core recording components remain unchanged during recording
  - Updated session route layout to remove references to deleted modal screens
  - Implementation verified: all requirements met in current record screen architecture
- **Activity Type System**: Comprehensive activity type definitions with recording constraints
  - Added 15+ predefined activity types in core package (cycling, running, swimming, etc.)
  - Each activity type includes environment classification (indoor, outdoor, water, mixed)
  - Recording constraints define which metrics are required, available, or excluded
  - Display configuration includes colors, icons, emojis, and preferred units
  - Activity-specific constraints (GPS for outdoor activities, power for cycling, etc.)
  - Data source tracking for all metrics with visual indicators
  - Activity type selection modal with search and categorization
  - Automatic activity recording adaptation based on selected type constraints
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