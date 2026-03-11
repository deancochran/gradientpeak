# Design: Continuous Fluid Periodization (MVP Architecture)

## Vision

Evolve the GradientPeak projection engine from a traditional, rigid, phase-based model (Base, Build, Peak, Taper buckets) into a **continuous, dynamic, and fluid periodization model**.

After evaluating advanced mathematical frameworks (Bi-level Bayesian Optimization, Reinforcement Learning, Tri-level Optimization), the most robust, computationally feasible, and mathematically sound approach for the current TypeScript/Node.js stack is a **Heuristic-Guided Model Predictive Control (MPC)** architecture.

## Core Architecture: Heuristic + Single-Level MPC

Instead of relying on a supercomputer to blindly "discover" periodization via Bayesian Optimization, we will leverage the known laws of human physiology (Banister Impulse-Response, EWMA) and established sports science heuristics to guide a deterministic optimizer.

### 1. The Heuristic Layer (The "Envelope")

The algorithm first uses rules-based sports science to draw an ideal **Target Continuous Fitness Curve (Reference Trajectory)**.

- It calculates the required Chronic Training Load (CTL) for the user's goals.
- It works backward from the goal dates, applying safe maximum weekly ramp rates (e.g., +3 to +5 CTL/week).
- It dynamically calculates taper durations (7 to 28 days based on event distance/duration) and recovery windows.
- This creates a mathematically perfect, but rigid, reference line from today until race day.

### 2. The MPC Layer (The "Fluidity")

We feed this Reference Trajectory into the existing `solveDeterministicBoundedMpc` engine.

- The MPC acts as a **trajectory tracker**. It evaluates discrete weekly Training Stress Score (TSS) candidates over a rolling horizon (e.g., 3-4 weeks ahead).
- **The Objective Function:** The MPC seeks to minimize the error between the _projected_ CTL and the _Heuristic Target_ CTL, while strictly enforcing safety constraints (keeping Acute Training Load / ATL below injury thresholds).
- **The Result:** By adjusting objective weights dynamically (e.g., heavily penalizing load when the user's `readiness_score` drops), the MPC will naturally weave, bob, and adapt around the heuristic reference line. This creates fluid, non-rigid periodization that responds to the user's actual state without ever violating the macro-strategy.

### 3. Independent Ideal Load Generator (Baseline Projection)

The heuristic engine must be capable of generating an "Ideal Recommended Load" curve that is completely independent of the user's actual planned or completed calendar events.

- **Pure Mathematical Projection:** It outputs a continuous array of smoothed daily TSS and target CTL values based solely on the user's goals, current fitness, and physiological constraints.
- **UI Integration:** This decoupled baseline curve can be plotted on the UI (e.g., the projection chart on the plan tab) to provide a visual "target tracking" experience. It allows the user to see how their actual/planned schedule weaves around the mathematically ideal trajectory, similar to a financial burndown/burnup chart.

## Handling Multi-Goal Scenarios

The Heuristic Layer views the entire season holistically.

- It plots the required CTL peaks for all 'A' and 'B' priority goals on a single timeline.
- If a 'B' race occurs during the build phase of an 'A' race, the heuristic draws a "micro-taper" (a slight flattening of the CTL curve for 4-5 days) rather than a full reset.
- The MPC then smoothly tracks this complex, multi-peak reference trajectory, ensuring the athlete "trains through" minor events while peaking perfectly for major ones.

## Why this is the optimal MVP

1. **Computational Speed:** The deterministic MPC lattice solver executes in single-digit milliseconds in Node.js, making it perfect for real-time mobile application updates. Bayesian Optimization would require thousands of heavy simulations.
2. **Physiological Safety:** Reinforcement Learning agents often exploit mathematical loopholes to suggest physically impossible workouts. By using heuristics to bracket the search space, we guarantee the generated plans are physiologically safe and realistic.
3. **Leverages Existing Code:** This architecture builds directly upon the robust constraint engine (`projection/safety-caps`), readiness modifiers (`projection/readiness`), and MPC solver (`projection/mpc/solver`) already present in the `@repo/core` package.
