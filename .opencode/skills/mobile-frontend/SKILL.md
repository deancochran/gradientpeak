---
name: mobile-frontend
description: Expo and React Native UI patterns, NativeWind styling, and mobile interaction conventions
---

# Mobile Frontend Skill

## When to Use

- Building or editing `apps/mobile` screens, components, hooks, or providers
- Working with Expo Router navigation or mobile interaction flows
- Reusing `@repo/ui` native components and NativeWind styling

## Scope

This skill covers mobile UI composition and app-side interaction patterns.

- Use `backend` for server work.
- Use `mobile-recording-assistant` for deep recorder-specific service changes.
- Use `react-native-reusables-expert` for primitive/component-library work.

## Rules

1. Style every `Text` explicitly; React Native does not inherit text styling.
2. Prefer semantic tokens such as `text-foreground` and `bg-background`.
3. Reuse shared providers and service instances instead of creating parallel state.
4. Subscribe to specific events and clean subscriptions up.
5. Use navigation/store patterns already established in the app for complex payload handoff.
6. Do not import database clients directly into mobile UI.

## Default Patterns

```tsx
function RecordMetrics() {
  const service = useSharedActivityRecorder();
  const readings = useCurrentReadings(service);

  return (
    <View className="bg-card p-4">
      <Text className="text-foreground text-lg font-semibold">
        {readings.heartRate ? `${readings.heartRate} bpm` : "--"}
      </Text>
    </View>
  );
}
```

## Repo-Specific Guidance

- Recorder state should flow through shared provider/hook patterns.
- `apps/mobile` uses Expo Router, NativeWind, Zustand, and shared `@repo/ui` primitives.
- For React Hook Form + Zod screens, prefer `useZodForm` and `useZodFormSubmit` from `@repo/ui/hooks` plus shared wrappers from `@repo/ui/components/form` before writing ad hoc `Controller` render blocks.
- Prefer `FormTextField`, `FormTextareaField`, `FormSwitchField`, `FormSelectField`, `FormDateInputField`, `FormWeightInputField`, `FormBoundedNumberField`, and `FormIntegerStepperField` when the screen is binding a standard shared field shape.
- Fall back to raw `FormField` only when a widget is truly custom, multi-control, or does not match the existing shared wrapper contracts.
- Prefer targeted hooks over broad service subscriptions.
- Keep runtime device or service behavior visible in UI state rather than hidden side effects.

## Shared Form Guidance

```tsx
const form = useZodForm({
  schema: profileSchema,
  defaultValues: { username: "", is_public: false },
});

return (
  <Form {...form}>
    <FormTextField control={form.control} label="Username" name="username" />
    <FormSwitchField control={form.control} label="Public Account" name="is_public" />
  </Form>
);
```

- Keep schema ownership in `@repo/core` and form interaction ownership in `@repo/ui`.
- Prefer wrappers for repeated mobile form fields so labels, messages, accessibility, and parsing stay consistent.

## Avoid

- Unstyled `Text`
- Duplicate service instances
- Catch-all subscriptions that trigger broad re-renders
- Direct Supabase or database usage in mobile components

## Quick Checklist

- [ ] text styled explicitly
- [ ] shared providers/hooks reused
- [ ] subscriptions cleaned up
- [ ] navigation pattern matches existing app flow
- [ ] UI uses semantic tokens and shared components
