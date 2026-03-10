import { readFileSync } from 'fs';
const content = readFileSync('/home/deancochran/GradientPeak/apps/mobile/components/charts/PlanVsActualChart.tsx', 'utf-8');
console.log("Includes Scatter?", content.includes("Scatter"));
