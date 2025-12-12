# Form Error Handling - Quick Examples

Copy-paste examples for common scenarios.

## 1. Basic Form Submission

```typescript
import { withFormErrorHandling } from '@/lib/utils/formErrors';

export function MyForm() {
  const mutation = useMutation(/* ... */);

  const onSubmit = withFormErrorHandling(async (data) => {
    await mutation.mutateAsync(data);
  });

  return <Button onPress={form.handleSubmit(onSubmit)} />;
}
```

## 2. React Hook Form with Validation Errors

```typescript
import { formErrorHandler } from '@/lib/utils/formErrors';

export function MyForm() {
  const form = useForm({ /* ... */ });

  const onSubmit = async (data) => {
    await saveMutation.mutateAsync(data);
  };

  return (
    <Button 
      onPress={form.handleSubmit(onSubmit, formErrorHandler)}
      disabled={form.formState.isSubmitting}
    />
  );
}
```

## 3. Mutation with Custom Error Handling

```typescript
import { showErrorAlert } from '@/lib/utils/formErrors';

export function useMyMutation() {
  return useMutation({
    mutationFn: async (data) => {
      return await api.save(data);
    },
    onSuccess: () => {
      Alert.alert('Success', 'Saved!');
    },
    onError: (error) => {
      showErrorAlert(error, 'Failed to Save');
    },
  });
}
```

## 4. Handle Network Errors Differently

```typescript
import { showErrorAlert, isNetworkError } from '@/lib/utils/formErrors';

mutation.mutate(data, {
  onError: (error) => {
    if (isNetworkError(error)) {
      // Show retry UI
      setShowRetry(true);
    } else {
      showErrorAlert(error);
    }
  }
});
```

## 5. Custom Error Handler with Fallback

```typescript
import { withFormErrorHandling } from '@/lib/utils/formErrors';

const onSubmit = withFormErrorHandling(
  async (data) => {
    await save(data);
  },
  {
    errorTitle: 'Save Failed',
    onError: (error) => {
      // Log to analytics
      logError(error);
    },
  }
);
```

## 6. Silent Error Handling (No Alert)

```typescript
import { withFormErrorHandling, getErrorMessage } from '@/lib/utils/formErrors';

const onSubmit = withFormErrorHandling(
  async (data) => {
    await save(data);
  },
  {
    suppressAlert: true,
    onError: (error) => {
      // Show inline error instead
      setErrorMessage(getErrorMessage(error));
    },
  }
);
```

## 7. Extract Error Message Only

```typescript
import { getErrorMessage } from '@/lib/utils/formErrors';

try {
  await api.call();
} catch (error) {
  const message = getErrorMessage(error);
  setErrorText(message); // Show in UI
}
```

## 8. Show First Form Validation Error

```typescript
import { getFirstFormError } from '@/lib/utils/formErrors';

const errors = form.formState.errors;
const firstError = getFirstFormError(errors);

if (firstError) {
  return <Text className="text-red-500">{firstError}</Text>;
}
```

## 9. Complete Form Component Example

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { withFormErrorHandling, formErrorHandler } from '@/lib/utils/formErrors';
import { mySchema } from './schema';

export function CompleteFormExample() {
  const form = useForm({
    resolver: zodResolver(mySchema),
    defaultValues: { name: '', email: '' },
  });

  const mutation = useMutation({
    mutationFn: async (data) => await api.save(data),
    onSuccess: () => {
      form.reset();
      Alert.alert('Success', 'Saved!');
    },
    onError: (error) => {
      showErrorAlert(error, 'Failed to Save');
    },
  });

  const onSubmit = withFormErrorHandling(async (data) => {
    await mutation.mutateAsync(data);
  });

  return (
    <View>
      <Input {...form.register('name')} />
      {form.formState.errors.name && (
        <Text className="text-red-500">
          {form.formState.errors.name.message}
        </Text>
      )}

      <Input {...form.register('email')} />
      {form.formState.errors.email && (
        <Text className="text-red-500">
          {form.formState.errors.email.message}
        </Text>
      )}

      <Button
        onPress={form.handleSubmit(onSubmit, formErrorHandler)}
        disabled={form.formState.isSubmitting}
        loading={mutation.isPending}
      >
        Submit
      </Button>
    </View>
  );
}
```

## 10. Custom Hook Pattern

```typescript
import { showErrorAlert } from '@/lib/utils/formErrors';
import { useForm } from 'react-hook-form';

export function useProfileForm() {
  const form = useForm({ /* ... */ });
  
  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      Alert.alert('Success', 'Profile updated!');
    },
    onError: (error) => {
      showErrorAlert(error, 'Failed to Update Profile');
    },
  });

  const submit = async (data) => {
    await mutation.mutateAsync(data);
  };

  return {
    form,
    submit,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

// Usage in component
export function ProfileScreen() {
  const { form, submit, isLoading } = useProfileForm();

  return (
    <Button 
      onPress={form.handleSubmit(submit, formErrorHandler)} 
      loading={isLoading}
    />
  );
}
```

## Pro Tips

### Tip 1: Let Mutations Handle Errors
```typescript
// ✅ GOOD - Mutation handles error
const mutation = useMutation({
  onError: (error) => showErrorAlert(error),
});

// ❌ BAD - Duplicate error handling
const mutation = useMutation({
  onError: (error) => showErrorAlert(error),
});
try {
  await mutation.mutateAsync(data);
} catch (error) {
  showErrorAlert(error); // Already handled!
}
```

### Tip 2: Use formErrorHandler for Validation
```typescript
// ✅ GOOD - Automatic validation error display
form.handleSubmit(onSubmit, formErrorHandler)

// ❌ BAD - Manual validation check
if (Object.keys(form.formState.errors).length > 0) {
  Alert.alert('Error', 'Fix the errors');
}
```

### Tip 3: Wrap Async Functions
```typescript
// ✅ GOOD - Clean and simple
const onSubmit = withFormErrorHandling(async (data) => {
  await save(data);
});

// ❌ BAD - Verbose try-catch
const onSubmit = async (data) => {
  try {
    await save(data);
  } catch (error) {
    Alert.alert('Error', getErrorMessage(error));
  }
};
```
