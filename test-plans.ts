import { ALL_SAMPLE_PLANS } from "./packages/core/samples/index.ts";
console.log(ALL_SAMPLE_PLANS.map(p => ({ name: p.name, sessions: p.structure.sessions.length })));
