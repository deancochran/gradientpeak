# Design: Continuous Fluid Periodization

## Vision

Evolve the GradientPeak projection engine from a traditional, rigid, phase-based model (Base, Build, Peak, Taper buckets) into a **continuous, dynamic, and fluid periodization model**. This approach treats fitness as a continuous mathematical function of applied stress and time, where phases are emergent properties of mathematical curves rather than hardcoded rules.

## Core Concepts

### 1. Continuous Scaling via Mathematical Modeling

Instead of assigning rigid phases based on calendar weeks, the algorithm generates a **Target Continuous Fitness Curve** using the Banister Impulse-Response Model and Exponentially Weighted Moving Averages (EWMA):

- **CTL (Chronic Training Load / Fitness):** 42-day rolling average of TSS.
- **ATL (Acute Training Load / Fatigue):** 7-day rolling average of TSS.
- **TSB (Training Stress Balance / Form):** CTL - ATL.
  The duration and intensity of training are determined by the required $\Delta CTL$ (change in fitness needed) and the athlete's safe maximum weekly Ramp Rate. The "Build Phase" simply becomes the mathematical slope of the CTL curve required to bridge the gap between today's fitness and the goal's demand.

### 2. Holistic Input & Multi-Goal Periodization

A training plan should be a single, unified representation of _all_ profile goals, rather than separate plans stitched together. The algorithm must view the entire season as a **single, multi-objective optimization problem**:

- **Input Vector:** Accept an array of all events (e.g., `[{date: t1, priority: B, demand: 150}, {date: t2, priority: A, demand: 300}]`).
- **Reverse Curve Generation:** Start at the furthest `A-priority` event, set the target TSB (e.g., +20), calculate the required ATL drop (the taper), and work backward in time, tracing the CTL curve down at the optimal ramp rate.

### 3. Shared Phases & Residual Training Effects

Goals that are close together should NOT each get their own isolated Base/Build/Peak/Taper cycle. Physiological systems retain adaptations for different durations (e.g., Aerobic base ~30 days, Anaerobic threshold ~18 days).

- **Training Through:** When tracing backward from an A-race, if a B-race is encountered, the algorithm calculates a localized "micro-taper" (flattening the CTL curve slightly for 4-5 days to clear some ATL) rather than a full taper. The athlete carries the broader "Build" fatigue through the B-race.
- **Continuous Top-Ups:** The algorithm injects targeted workouts to top up fast-decaying anaerobic reservoirs while maintaining the slow-decaying aerobic reservoir.

### 4. Dynamic Taper & Recovery Scaling

Taper and recovery durations must scale dynamically based on the specific demands of the goal (distance, duration, TSS):

- **Taper Scaling:** 5K/10K (7-10 days), Half Marathon (10-14 days), Marathon (14-21 days), Ultramarathon (21-28 days).
- **Recovery Scaling:** Based on the Distance Formula (1 day per mile) or TSS Formula (1 day per 100 TSS), scaling non-linearly with event muscle damage and duration.

### 5. Daily Undulating Periodization (DUP)

Once daily mathematical targets (Target TSS, Target CTL, Target ATL) are plotted as a continuous time-series, a secondary micro-cycle algorithm reads the daily TSS target and uses DUP principles to select specific workout structures (e.g., 1x Long, 1x Threshold, 1x VO2max) while satisfying 80/20 Polarized Training constraints.
