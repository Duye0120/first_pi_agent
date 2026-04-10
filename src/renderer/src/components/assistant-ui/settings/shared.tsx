import type { InputHTMLAttributes, ReactNode } from "react";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@renderer/components/assistant-ui/badge";
import { Select } from "@renderer/components/assistant-ui/select";
import { cn } from "@renderer/lib/utils";

export function SettingsCard({
  title,
  description,
  children,
  className,
  headerClassName,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "chela-panel-surface overflow-hidden rounded-[calc(var(--radius-shell)+4px)]",
        className,
      )}
    >
      {title || description ? (
        <div className={cn("px-6 py-5", headerClassName)}>
          {title ? (
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="mt-1.5 text-[12px] leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-[color:var(--color-control-border)] px-6 py-4 first:border-t-0 md:flex-row md:items-start md:justify-between md:gap-8">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium tracking-[-0.01em] text-foreground">{label}</p>
        {hint ? (
          <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      <div className="w-full md:max-w-[336px]">{children}</div>
    </div>
  );
}

export function FieldInput(
  props: InputHTMLAttributes<HTMLInputElement> & {
    mono?: boolean;
  },
) {
  const { className = "", mono = false, ...rest } = props;

  return (
    <input
      {...rest}
      className={`h-9 w-full rounded-[var(--radius-shell)] border-none bg-[color:var(--color-control-bg)] px-3 text-[13px] text-foreground shadow-[var(--color-control-shadow)] ring-1 ring-[color:var(--color-control-border)] transition-[background-color,color,box-shadow] outline-none placeholder:text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-control-bg-hover)] focus-visible:bg-[color:var(--color-control-bg-active)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-control-focus-ring)] ${mono ? "font-mono text-[12px]" : ""} ${className}`}
    />
  );
}

export function FieldSelect(props: {
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  className?: string;
  disabled?: boolean;
}) {
  const { options, className = "", value, onChange, disabled = false } = props;

  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      options={options.map((option) => ({
        value: option.value,
        label: option.label,
        textValue: option.label,
        disabled: option.disabled,
      }))}
      className={`h-9 w-full justify-between px-3 text-[13px] ${className}`}
    />
  );
}

export function StatusBadge({
  ok,
  text,
}: {
  ok: boolean;
  text: string;
}) {
  return (
    <Badge variant={ok ? "success" : "warning"} className="gap-1">
      {ok ? (
        <CheckCircleIcon className="h-3.5 w-3.5" />
      ) : (
        <ExclamationCircleIcon className="h-3.5 w-3.5" />
      )}
      {text}
    </Badge>
  );
}
