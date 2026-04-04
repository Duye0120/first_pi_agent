import type { InputHTMLAttributes, ReactNode } from "react";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { Select } from "@renderer/components/assistant-ui/select";

export function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-shell)] border border-shell-border bg-shell-panel">
      <div className="px-5 py-4">
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div>{children}</div>
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
    <div className="flex flex-col gap-3 border-t border-shell-border px-5 py-4 first:border-t-0 md:flex-row md:items-start md:justify-between md:gap-6">
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
      className={`h-9 w-full rounded-[var(--radius-shell)] border border-shell-border bg-shell-panel-contrast px-3 text-[13px] text-foreground transition outline-none focus:border-ring/60 ${mono ? "font-mono text-[12px]" : ""} ${className}`}
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
      className={`h-9 w-full justify-between rounded-[var(--radius-shell)] border border-shell-border bg-shell-panel-contrast px-3 text-[13px] text-foreground hover:bg-shell-panel-contrast ${className}`}
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
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] ${
        ok
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {ok ? (
        <CheckCircleIcon className="h-3.5 w-3.5" />
      ) : (
        <ExclamationCircleIcon className="h-3.5 w-3.5" />
      )}
      {text}
    </span>
  );
}
