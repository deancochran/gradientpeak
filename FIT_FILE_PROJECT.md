# FIT File Integration Project

**Status:** Ready for Implementation
**Version:** 1.0
**Last Updated:** 2026-01-21

## Overview

This project migrates GradientPeak from storing activity data as compressed JSON in the database to using industry-standard FIT files (Garmin format). This enables better integration with fitness platforms like Strava, Garmin Connect, and Wahoo.

## What Changes

### Before
- Activities recorded as JSON sensor data
- Compressed and stored directly in PostgreSQL database
- Manual processing when data needed

### After
- Activities recorded as FIT files (industry standard)
- Stored in Supabase Storage (file system)
- Automatic processing via serverless functions
- Compatible with all major fitness platforms

## Key Benefits

1. **Platform Compatibility** - Upload/download to Strava, Garmin, Wahoo
2. **Official Standards** - Uses Garmin's FIT SDK (guaranteed compatibility)
3. **Automatic Processing** - Activities analyzed automatically after upload
4. **Better Performance** - Database focused on metadata, files in storage
5. **Crash Recovery** - Partial recordings preserved via checkpoints
6. **Historical Accuracy** - Calculations use your FTP/weight from activity date

## Implementation Phases

### Phase 1: Infrastructure Setup (1-2 days)
- Download Garmin FIT SDK
- Create Supabase Storage bucket for files
- Database updates to track FIT files
- Deploy serverless processing function

### Phase 2: Mobile Recording (3-5 days)
- Replace JSON recording with FIT encoder
- Real-time FIT file generation during activities
- Automatic checkpoints every 60 seconds
- Upload completed FIT files to storage

### Phase 3: Automatic Processing (4-5 days)
- Serverless function processes uploaded FIT files
- Extracts all activity metrics
- Calculates performance data (TSS, power zones, etc.)
- Updates activity records automatically

### Phase 4: User Interface (2 days)
- Show processing status badges
- Add retry buttons for failed uploads
- Display "Analyzing..." messages
- Handle processing states gracefully

### Phase 5: Data Migration (2-3 days)
- Convert existing activities to FIT format
- Preserve all historical data
- Maintain backwards compatibility

## Timeline

**Total Duration:** 14-20 days (approximately 3-4 weeks)

## Technical Architecture

### Simple Flow
```
Record Activity → Create FIT File → Upload to Storage
                                    ↓
                          Trigger Automatic Processing
                                    ↓
                          Update Activity with Metrics
```

### Components
- **Mobile App** - Records activities as FIT files
- **Supabase Storage** - Stores FIT files securely
- **Serverless Function** - Processes FIT files automatically
- **Database** - Stores activity metadata and metrics

## Implementation Details

### New Files to Create
- `apps/mobile/lib/services/fit/StreamingFitEncoder.ts` - Real-time FIT encoder
- `apps/mobile/lib/services/fit/FitUploader.ts` - Upload service
- `supabase/functions/process-activity-fit/index.ts` - Processing function
- `packages/supabase/migrations/20240120_add_fit_file_support.sql` - Database schema

### Files to Modify
- `apps/mobile/lib/services/ActivityRecorder/index.ts` - Replace StreamBuffer with FIT encoder
- `packages/trpc/src/routers/activities.ts` - Add FIT upload procedures

### Database Changes
```sql
ALTER TABLE activities
ADD COLUMN fit_file_path TEXT,
ADD COLUMN processing_status TEXT DEFAULT 'PENDING',
ADD COLUMN processing_error TEXT,
ADD COLUMN ftp_at_time_of_activity INTEGER,
ADD COLUMN weight_at_time_of_activity NUMERIC(5,2);
```

### Storage Setup
- Bucket: `activity-files`
- Structure: `{userId}/{activityId}.fit`
- Security: Row Level Security (users can only access their own files)

## Success Criteria

- ✅ 100% FIT file integrity (validated by SDK)
- ✅ >95% upload success rate
- ✅ >98% processing success rate
- ✅ <30 seconds processing time per activity
- ✅ No performance impact during recording
- ✅ All existing activities migrated

## Next Steps

1. Review and approve this plan
2. Set up infrastructure (Phase 1)
3. Begin mobile implementation
4. Deploy serverless processing
5. Update user interface
6. Migrate historical data
7. Full rollout

## Key Implementation Notes

### FIT File Encoding
- Use official Garmin FIT SDK
- Follow "Summary Last" message sequence
- Include File ID, User Profile, Device Info messages
- Write Record messages in real-time during activity
- Finalize with Lap, Session, Activity summaries

### Upload Flow
1. Mobile requests signed upload URL from tRPC
2. Upload FIT file directly to Supabase Storage
3. Create activity record with `processing_status = 'PENDING'`
4. Database trigger automatically invokes Edge Function
5. Edge Function downloads, parses, and updates activity

### Processing Pipeline
1. Download FIT file from storage
2. Parse using Garmin SDK
3. Query historical FTP/weight values at activity date
4. Calculate metrics (TSS, Normalized Power, zones)
5. Generate GPS polyline
6. Update activity record with all data

### Error Handling
- Processing status: PENDING → PROCESSING → COMPLETED/FAILED
- Failed uploads show retry button in UI
- Processing errors stored in `processing_error` column
- Mobile app polls status periodically

## Resources

- Garmin FIT SDK: https://developer.garmin.com/fit/
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- FIT Protocol: https://developer.garmin.com/fit/overview/
