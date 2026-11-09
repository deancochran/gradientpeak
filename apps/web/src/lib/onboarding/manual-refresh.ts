export async function retainSnapshotOnRefresh<T>(input: {
  load: () => Promise<T>;
  onSuccess: (value: T) => void;
  onError: (message: string) => void;
  errorMessage: string;
}) {
  try {
    const value = await input.load();
    input.onSuccess(value);
    return true;
  } catch {
    input.onError(input.errorMessage);
    return false;
  }
}
