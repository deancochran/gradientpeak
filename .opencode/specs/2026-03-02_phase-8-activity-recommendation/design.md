# Phase 8: Goals Engine & Activity Recommendation Design

## Problem
Goals and targets currently exist and projection calculations are largely complete (Phase 8.1 MVP), but the system cannot translate a projected gap into a concrete, actionable daily recommendation. Users need to know exactly which activity plan to perform on a given day to close the gap to their goals safely.

## Solution
1. **Goal Readiness Completion (8.1)**: Verify and expose the readiness and optimal performance curve outputs already implemented in `projectionCalculations.ts` to the UI. Ensure `unmet_gap` translates cleanly to zone targeting signals.
2. **Activity Recommendation Engine (8.2)**: Build a new recommendation engine in `@repo/core` that takes a daily target profile (TSS, zones, effort category) and scores available Activity Plans. 
3. **TRPC and Mobile UI**: Expose the recommendation engine via a new TRPC endpoint and build the daily recommendation view on the mobile calendar/home feed.

## Recommendation Scoring Heuristics
- **TSS Proximity**: Plans closer to the optimal daily TSS score higher.
- **Zone Alignment**: Plans whose interval zones match the user's `unmet_gap` targets score higher.
- **ACWR Safety**: Hard rejection of plans that push ACWR > 1.5.
- **Effort Match**: Hard vs Easy day constraints.
