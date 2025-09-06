# Training Platform Database Schema Overview

This document provides a high-level overview of the database schema for a comprehensive training platform that manages athletes, training plans, and performance tracking.

## Core Architecture

The schema is built around a user-centric design that supports personalized training plans with detailed activity tracking and performance analysis. The database leverages Supabase’s built-in authentication system and extends it with custom tables to create a complete training management solution.

## Table Relationships and Structure

### User Management

**`auth.users`** serves as the foundation, utilizing Supabase’s built-in authentication system to handle user accounts, login credentials, and security. This table is extended by **`profiles`**, which stores comprehensive personal information, preferences, and profile details that customize each user’s experience within the platform.

### Training Plan Framework

**`training_plans`** contains the blueprint for various training programs, defining the core structure, methodology, and parameters that make each plan unique. These plans are connected to users through **`profile_training_plans`**, a junction table that enables users to follow multiple training plans simultaneously while maintaining separate progress tracking for each.

### Activity Planning and Execution

**`planned_activities`** represents the intelligent scheduling component of the system, storing activities that are dynamically generated based on a user’s fitness level, progress, and training plan requirements. This table enables adaptive training that evolves with the athlete’s development and supports offline access to planned workouts.

**`activities`** captures all completed training sessions, whether recorded through the mobile application or ingested from third-party sources (Garmin Connect, Strava, etc.). Each activity maintains metadata about its data source and serves as the comprehensive activity log that tracks an athlete’s actual training history.

### Performance Analysis

**`activity_results`** provides the analytical bridge between planned and completed activities. It stores objective performance metrics, compliance scores, Training Stress Score (TSS), Chronic Training Load (CTL), and other key performance indicators that evaluate how well an athlete executed their planned training.

**`activity_streams`** contains the granular, time-series data collected during activities, including heart rate, power output, GPS coordinates, cadence, and other sensor metrics. This table is designed to handle high-volume data from various recording sources and enables sophisticated performance analysis. Given the temporary nature of local storage, this data represents the permanent cloud-based repository of detailed activity metrics.

### Personalization

**`zones`** stores each athlete’s personalized training zones, primarily focusing on heart rate and power zones across all supported sports. While pace zones may be included for sports where other data collection is limited (such as swimming), the emphasis on power and heart rate zones provides consistent training intensity guidance regardless of sport type. These zones customize planned activities to ensure training aligns with individual physiological characteristics and fitness levels.

## Schema Benefits

This architecture supports sophisticated training management by enabling dynamic plan adaptation, comprehensive performance tracking, and detailed analytics while maintaining data integrity through proper relational design. The local-first approach ensures athletes can record activities and access planned workouts without connectivity, while the cloud-based analysis engine provides advanced insights once synchronized. The separation of planned versus completed activities allows for intelligent training adjustments based on actual performance and compliance patterns, creating a responsive training system that evolves with the athlete’s development.
