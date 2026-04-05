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
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[var(--radius-shell)] border border-[color:var(--color-border-light)] bg-shell-panel",
        className,
      )}
    >
      <div className={cn("px-5 py-4", headerClassName)}>
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
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
    <div className="flex flex-col gap-3 border-t border-[color:var(--color-border-light)] px-5 py-4 first:border-t-0 md:flex-row md:items-start md:justify-between md:gap-6">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {hint ? (
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      <div className="w-full md:max-w-[320px]">{children}</div>
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
      className={`h-9 w-full rounded-[var(--radius-shell)] border border-[color:var(--color-border-light)] bg-shell-panel-contrast px-3 text-[13px] text-foreground transition-colors outline-none focus:border-ring/40 ${mono ? "font-mono text-[12px]" : ""} ${className}`}
    />
  );
}

export function FieldSelect(props: {
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  className?: string;
}) {
  const { options, className = "", value, onChange } = props;

  return (
    <Select
      value={value}
      onValueChange={onChange}
      options={options.map((option) => ({
        value: option.value,
        label: option.label,
        textValue: option.label,
        disabled: option.disabled,
      }))}
      className={`h-9 w-full justify-between rounded-[var(--radius-shell)] border border-[color:var(--color-border-light)] bg-shell-panel-contrast px-3 text-[13px] text-foreground hover:bg-shell-panel-contrast ${className}`}
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
