# Form Error Handling Guide

Quick reference for handling form submission errors with user-friendly messages.

## Overview

The form error handling utilities provide:
- ✅ User-friendly error messages (no technical jargon)
- ✅ Automatic network error detection
- ✅ React Hook Form integration
- ✅ Consistent error display across the app
- ✅ Smart error message mapping

## Quick Start

### Basic Form Submission

```typescript
import { withFormErrorHandling } from '@/lib/utils/formErrors';

const onSubmit = withFormErrorHandling(async (data) => {
  await mutation.mutateAsync(data);
}, {
  errorTitle: 'Failed to Save',
});

// In component
<Button onPress={form.handleSubmit(onSubmit)} />
```

### React Hook Form Integration

```typescript
import { formErrorHandler } from '@/lib/utils/formErrors';

// Shows validation errors automatically
<Button 
  onPress={form.handleSubmit(onSubmit, formErrorHandler)} 
/>
```

## API Reference

### `getErrorMessage(error: unknown): string`

Extracts user-friendly message from any error type.

```typescript
try {
  await api.call();
} catch (error) {
  const message = getErrorMessage(error);
  // "Unable to connect to the server. Please check your internet connection."
}
```

### `showErrorAlert(error: unknown, title?: string)`

Shows an alert with formatted error message.

```typescript
mutation.mutate(data, {
  onError: (error) => showErrorAlert(error, 'Save Failed')
});
```

### `formErrorHandler(errors: FieldErrors)`

React Hook Form error handler - shows first validation error.

```typescript
form.handleSubmit(onSubmit, formErrorHandler)
```

### `withFormErrorHandling(fn, options?)`

Wraps async function with automatic error handling.

```typescript
const safeSubmit = withFormErrorHandling(
  async (data) => {
    await save(data);
  },
  {
    errorTitle: 'Save Failed',
    onError: (error) => console.error(error),
    suppressAlert: false, // Set true to handle manually
  }
);
```

## Common Patterns

### Pattern 1: Custom Hook with Error Handling

```typescript
export function useActivityPlanForm() {
  const mutation = trpc.activityPlans.create.useMutation({
    onSuccess: () => {
      Alert.alert('Success', 'Plan created!');
    },
    onError: (error) => {
      showErrorAlert(error, 'Failed to Create Plan');
    },
  });

  return { mutation };
}
```

### Pattern 2: Form with Validation Errors

```typescript
const onSubmit = async (data: FormData) => {
  try {
    await mutation.mutateAsync(data);
  } catch (error) {
    // Already handled by mutation.onError
  }
};

<Button 
  onPress={form.handleSubmit(onSubmit, formErrorHandler)}
  disabled={form.formState.isSubmitting}
/>
```

### Pattern 3: Network Error Detection

```typescript
import { isNetworkError } from '@/lib/utils/formErrors';

mutation.mutate(data, {
  onError: (error) => {
    if (isNetworkError(error)) {
      // Show offline UI or retry button
    } else {
      showErrorAlert(error);
    }
  }
});
```

## Error Message Examples

| Technical Error | User-Friendly Message |
|----------------|----------------------|
| `Failed to fetch` | Unable to connect to the server. Please check your internet connection. |
| `UNAUTHORIZED` | Please sign in to continue. |
| `VALIDATION_ERROR` | Please check your input and try again. |
| `INTERNAL_SERVER_ERROR` | Something went wrong on our end. Please try again. |
| `CONFLICT` | This item already exists. |

## Best Practices

### ✅ DO

```typescript
// Use showErrorAlert for consistent messaging
mutation.onError = (error) => showErrorAlert(error);

// Wrap form submissions
const onSubmit = withFormErrorHandling(async (data) => {
  await save(data);
});

// Use formErrorHandler for validation
form.handleSubmit(onSubmit, formErrorHandler);
```

### ❌ DON'T

```typescript
// Don't use raw Alert.alert
Alert.alert('Error', error.message); // BAD - technical message

// Don't ignore errors
try { await save(); } catch {} // BAD - no feedback

// Don't duplicate error handling
mutation.onError = (error) => {
  Alert.alert('Error', error.message); // BAD - mutation already handles
};
```

## Migration Guide

### Before

```typescript
const submit = async () => {
  try {
    await mutation.mutateAsync(data);
  } catch (error) {
    Alert.alert('Error', error.message || 'Something went wrong');
  }
};
```

### After

```typescript
const submit = withFormErrorHandling(async () => {
  await mutation.mutateAsync(data);
});

// Or let mutation handle it
const mutation = useMutation({
  onError: (error) => showErrorAlert(error, 'Save Failed'),
});
```

## Testing

```typescript
describe('Form Error Handling', () => {
  it('shows user-friendly network error', () => {
    const error = new Error('Failed to fetch');
    const message = getErrorMessage(error);
    expect(message).toContain('internet connection');
  });

  it('handles validation errors', () => {
    const errors = { name: { message: 'Required' } };
    const message = getFirstFormError(errors);
    expect(message).toBe('Required');
  });
});
```

## Related

- [React Hook Form Validation](./REACT_HOOK_FORM_VALIDATION.md)
- [Mutation Hooks](../lib/hooks/useOptimisticMutation.ts)
- [Performance Guide](./PERFORMANCE_IMPLEMENTATION_GUIDE.md)