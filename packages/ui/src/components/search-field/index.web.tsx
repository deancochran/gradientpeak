import { Search, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { Icon } from "../icon/index.web";
import { Input } from "../input/index.web";
import { Spinner } from "../loading/index.web";
import type { SearchFieldProps } from "./shared";

function SearchField({
  accessibilityLabel,
  className,
  clearTestId,
  disabled = false,
  loading = false,
  loadingLabel = "Loading search results",
  maxLength,
  name,
  onSubmit,
  onValueChange,
  placeholder,
  testId,
  value,
}: SearchFieldProps) {
  return (
    <div className="relative">
      <Icon
        aria-hidden="true"
        as={Search}
        className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
        size={18}
      />
      <Input
        accessibilityLabel={accessibilityLabel}
        className={cn(
          "pr-10 pl-10 [&::-webkit-search-cancel-button]:appearance-none",
          loading && value.length > 0 && "pr-16",
          className,
        )}
        disabled={disabled}
        maxLength={maxLength}
        name={name}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing && onSubmit) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        testId={testId}
        type="search"
        value={value}
      />
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
        {loading ? <Spinner label={loadingLabel} /> : null}
        {value.length > 0 ? (
          <button
            aria-label={`Clear ${accessibilityLabel}`}
            className="inline-flex size-5 items-center justify-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            data-testid={clearTestId ?? (testId ? `${testId}-clear` : undefined)}
            disabled={disabled}
            onClick={() => onValueChange("")}
            type="button"
          >
            <Icon aria-hidden="true" as={X} size={18} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type { SearchFieldProps } from "./shared";
export { SearchField };
