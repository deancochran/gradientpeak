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

### 4. Infeasibility Detection & The "Best Effort" Curve

When a user sets a goal that is physiologically unreachable within the timeframe (e.g., a beginner wanting to run a marathon in 2 weeks), the engine must detect this and adapt:

- **Detection:** The algorithm calculates the required ramp rate ($Ramp_{req} = (CTL_{target} - CTL_{current}) / Weeks$). If $Ramp_{req}$ exceeds the user's maximum safe ramp rate, the goal is flagged as infeasible.
- **State Shift:** The engine shifts from _Target-Seeking Mode_ (reverse-engineering from the goal) to _Capacity-Bounded Mode_ (forward-simulating at maximum safe capacity).
- **The "Best Effort" Curve:** The engine draws a curve that safely gets the user as close to the goal as possible without violating safety constraints, and calculates a "Readiness Gap" ($CTL_{target} - CTL_{achievable}$) to communicate the reality to the user.

### 5. Adjustable Risk Thresholds (UI to Math Mapping)

User risk tolerance directly maps to the constraint variables in the optimization model. By exposing a "Risk Profile" setting in the UI (e.g., a slider from Conservative to Aggressive), the bounding box of the heuristic engine is mathematically altered.

These UI inputs map to continuous values ($0.0 - 1.0$) in the `AthletePreferenceProfile` schema, which are then interpolated into rigid constraints:

- **Max CTL Ramp Rate:** $Ramp_{max} = 2 + (x \times 4)$ (Yields 2 to 6 CTL/wk)
- **Max ACWR:** $ACWR_{max} = 1.1 + (x \times 0.4)$ (Yields 1.1 to 1.5)
- **TSB Floor:** $TSB_{floor} = -10 - (x \times 20)$ (Yields -10 to -30)

**Dynamic Recalculation:** If a user changes their preference mid-season (e.g., from Aggressive to Conservative), the engine instantly recalculates. A goal that was previously "Feasible" might become "Infeasible" because the algorithm is no longer allowed to ramp CTL aggressively. The UI will then display the new "Best Effort" curve and the resulting "Readiness Gap" alert.

## Handling Multi-Goal Scenarios

The Heuristic Layer views the entire season holistically.

- It plots the required CTL peaks for all 'A' and 'B' priority goals on a single timeline.
- If a 'B' race occurs during the build phase of an 'A' race, the heuristic draws a "micro-taper" (a slight flattening of the CTL curve for 4-5 days) rather than a full reset.
- The MPC then smoothly tracks this complex, multi-peak reference trajectory, ensuring the athlete "trains through" minor events while peaking perfectly for major ones.

## Why this is the optimal MVP

1. **Computational Speed:** The deterministic MPC lattice solver executes in single-digit milliseconds in Node.js, making it perfect for real-time mobile application updates. Bayesian Optimization would require thousands of heavy simulations.
2. **Physiological Safety:** Reinforcement Learning agents often exploit mathematical loopholes to suggest physically impossible workouts. By using heuristics to bracket the search space, we guarantee the generated plans are physiologically safe and realistic.
3. **Leverages Existing Code:** This architecture builds directly upon the robust constraint engine (`projection/safety-caps`), readiness modifiers (`projection/readiness`), and MPC solver (`projection/mpc/solver`) already present in the `@repo/core` package.
