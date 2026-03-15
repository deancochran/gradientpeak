import { ALL_SAMPLE_PLANS } from "./packages/core/samples/index.ts";
const plan = ALL_SAMPLE_PLANS.find(p => p.name.includes('Cycling Endurance Builder'));
console.log(plan.structure.sessions.map(s => s.offset_days));
