"use client";
import { useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { Button } from "../button/index.web";
import { Label } from "../label/index.web";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../select/index.web";
import type { ChoiceFieldProps, ChoiceValue } from "./shared";
import { useChoiceField } from "./use-choice-field";

export function ChoiceField<T extends ChoiceValue>(props: ChoiceFieldProps<T>) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const focus = () => trigger.current?.focus();
  useImperativeHandle(props.ref, () => ({ focus }));
  const choice = useChoiceField(props, focus, () => setOpen(false));
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetting or rebinding closes the old field's popup.
  useEffect(() => {
    setOpen(false);
  }, [props.resetKey, props.formControl, props.fieldName]);
  useEffect(() => {
    if (props.disabled || (props.isCurrent && !props.isCurrent())) setOpen(false);
  }, [props.disabled, props.isCurrent]);
  const index = props.options.findIndex((option) => option.value === props.value);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {props.label}
        {props.required ? " *" : ""}
      </Label>
      <div className="flex items-center gap-2">
        <Select
          open={open}
          onOpenChange={(next) => {
            if (next === openRef.current || (next && !choice.usable())) return;
            openRef.current = next;
            if (!next) choice.invalidate();
            setOpen(next);
          }}
          disabled={Boolean(props.disabled)}
          value={choice.result.status === "valid" ? String(index) : ""}
          onValueChange={(key) => {
            const option = props.options.find((_option, position) => String(position) === key);
            if (option) choice.select(option.value);
          }}
        >
          <SelectTrigger
            ref={trigger}
            id={id}
            aria-label={props.label}
            aria-required={props.required}
            aria-invalid={Boolean(choice.error)}
            aria-describedby={
              choice.error ? `${id}-error` : props.helperText ? `${id}-help` : undefined
            }
            onBlur={choice.blur}
            data-testid={props.testId}
          >
            <SelectValue placeholder={choice.display}>
              {choice.result.status === "valid" ? choice.display : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            onCloseAutoFocus={(event) => {
              if (props.isCurrent && !props.isCurrent()) event.preventDefault();
            }}
          >
            {!props.options.some((option) => !option.disabled) ? (
              <p role="status">No supported {props.label.toLowerCase()} choices are available.</p>
            ) : null}
            {props.options.map((option, position) => (
              <SelectItem
                key={`${typeof option.value}:${option.value}`}
                value={String(position)}
                disabled={Boolean(option.disabled)}
                aria-label={option.label}
                aria-labelledby={undefined}
                textValue={option.label}
                aria-describedby={option.description ? `${id}-option-${position}` : undefined}
              >
                <span>{option.label}</span>
                {option.description ? (
                  <span
                    id={`${id}-option-${position}`}
                    className="block text-xs text-muted-foreground"
                  >
                    {option.description}
                  </span>
                ) : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {props.onClear && !props.required && choice.result.status !== "empty" ? (
          <Button
            type="button"
            variant="ghost"
            disabled={props.disabled}
            aria-label={`Clear ${props.label}`}
            onClick={choice.clear}
          >
            Clear
          </Button>
        ) : null}
      </div>
      {props.helperText ? (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {props.helperText}
        </p>
      ) : null}
      {choice.error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {choice.error}
        </p>
      ) : null}
    </div>
  );
}
export type { ChoiceFieldProps, ChoiceOption } from "./shared";
