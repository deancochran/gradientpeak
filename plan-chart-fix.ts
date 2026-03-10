import * as fs from 'fs';

let content = fs.readFileSync('apps/mobile/components/charts/PlanVsActualChart.tsx', 'utf-8');

// Import Scatter
content = content.replace(
  'import { CartesianChart, Line, Area } from "victory-native";',
  'import { CartesianChart, Line, Area, Scatter } from "victory-native";'
);

// We need to change the chart logic to frame the domain.
