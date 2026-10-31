// Metro handles stylesheet side effects. Keep clean-checkout typechecking independent
// of the ignored expo-env.d.ts generated when the development server starts.
declare module "*.css";
