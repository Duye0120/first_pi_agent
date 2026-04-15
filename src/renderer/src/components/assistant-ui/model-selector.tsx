"use client";

import {
  memo,
  useState,
  useEffect,
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { type VariantProps } from "class-variance-authority";
import { CheckIcon } from "lucide-react";
import { useAssistantApi } from "@assistant-ui/react";

import { cn } from "@renderer/lib/utils";
import {
  SelectRoot,
  SelectGroup,
  SelectLabel,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectSeparator,
  selectTriggerVariants,
} from "@renderer/components/assistant-ui/select";

export type ModelOption = {
  id: string;
  name: string;
  description?: string;
  groupId?: string;
  groupLabel?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type ModelSelectorContextValue = {
  models: ModelOption[];
  value: string | undefined;
};

const ModelSelectorContext = createContext<ModelSelectorContextValue | null>(
  null,
);

function useModelSelectorContext() {
  const ctx = useContext(ModelSelectorContext);
  if (!ctx) {
    throw new Error(
      "ModelSelector sub-components must be used within ModelSelector.Root",
    );
  }
  return ctx;
}

export type ModelSelectorRootProps = {
  models: ModelOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  children: ReactNode;
};

function ModelSelectorRoot({
  models,
  defaultValue: defaultValueProp,
  children,
  value,
  ...selectProps
}: ModelSelectorRootProps) {
  const defaultValue = defaultValueProp ?? models[0]?.id;
  return (
    <ModelSelectorContext.Provider value={{ models, value }}>
      <SelectRoot
        {...(defaultValue !== undefined ? { defaultValue } : undefined)}
        {...(value !== undefined ? { value } : undefined)}
        {...selectProps}
      >
        {children}
      </SelectRoot>
    </ModelSelectorContext.Provider>
  );
}

export type ModelSelectorTriggerProps = ComponentPropsWithoutRef<
  typeof SelectTrigger
>;

function ModelSelectorTrigger({
  className,
  variant,
  size,
  children,
  ...props
}: ModelSelectorTriggerProps) {
  return (
    <SelectTrigger
      data-slot="model-selector-trigger"
      variant={variant}
      size={size}
      className={cn("aui-model-selector-trigger cursor-pointer", className)}
      {...props}
    >
      {children ?? <ModelSelectorValue />}
    </SelectTrigger>
  );
}

function ModelSelectorValue() {
  const { models, value } = useModelSelectorContext();
  const selectedModel =
    value != null ? models.find((model) => model.id === value) : undefined;

  if (!selectedModel) {
    return <span className="text-muted-foreground truncate font-medium text-[12px]">选择模型...</span>;
  }

  return (
    <span>
      <span className="flex items-center gap-2">
        {selectedModel.icon && (
          <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
            {selectedModel.icon}
          </span>
        )}
        <span className="truncate font-medium text-[12px]">
          {selectedModel.name}
        </span>
      </span>
    </span>
  );
}

export type ModelSelectorContentProps = ComponentPropsWithoutRef<
  typeof SelectContent
>;

function ModelSelectorContent({
  className,
  children,
  ...props
}: ModelSelectorContentProps) {
  const { models } = useModelSelectorContext();
  const groupedModels = models.reduce<
    Array<{ id: string; label: string; models: ModelOption[] }>
  >((groups, model) => {
    const groupId = model.groupId ?? "__default__";
    const existingGroup = groups.find((group) => group.id === groupId);

    if (existingGroup) {
      existingGroup.models.push(model);
      return groups;
    }

    groups.push({
      id: groupId,
      label: model.groupLabel ?? "",
      models: [model],
    });
    return groups;
  }, []);

  return (
    <SelectContent
      data-slot="model-selector-content"
      className={cn("min-w-[180px]", className)}
      {...props}
    >
      {children ??
        groupedModels.map((group, index) => (
          <SelectGroup key={group.id}>
            {group.label ? (
              <SelectLabel className="px-3 pb-1.5 pt-2 text-[11px] font-medium tracking-[0.02em] text-[color:var(--color-text-secondary)]">
                {group.label}
              </SelectLabel>
            ) : null}
            {group.models.map((model) => (
              <ModelSelectorItem
                key={model.id}
                model={model}
                {...(model.disabled ? { disabled: true } : undefined)}
              />
            ))}
            {index < groupedModels.length - 1 ? (
              <SelectSeparator className="my-2" />
            ) : null}
          </SelectGroup>
        ))}
    </SelectContent>
  );
}

export type ModelSelectorItemProps = Omit<
  ComponentPropsWithoutRef<typeof SelectItem>,
  "value" | "children"
> & {
  model: ModelOption;
};

function ModelSelectorItem({
  model,
  className,
  ...props
}: ModelSelectorItemProps) {
  return (
    <SelectPrimitive.Item
      data-slot="model-selector-item"
      value={model.id}
      textValue={model.name}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-[calc(var(--radius-shell)-1px)] py-2 pr-9 pl-3 text-sm text-foreground outline-none transition-colors",
        "data-[state=checked]:bg-[color:var(--color-selection-bg)] data-[state=checked]:text-[color:var(--color-selection-fg)]",
        "data-[highlighted]:bg-[color:var(--color-selection-muted-bg)] data-[highlighted]:text-foreground",
        "data-[highlighted]:data-[state=checked]:bg-[color:var(--color-selection-bg)] data-[highlighted]:data-[state=checked]:text-[color:var(--color-selection-fg)]",
        "focus:bg-[color:var(--color-selection-muted-bg)] focus:text-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute right-3 flex size-4 items-center justify-center text-current">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>
        <span className="flex items-center gap-2">
          {model.icon && (
            <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
              {model.icon}
            </span>
          )}
          <span className="truncate font-medium text-[12px]">{model.name}</span>
        </span>
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export type ModelSelectorProps = Omit<ModelSelectorRootProps, "children"> &
  VariantProps<typeof selectTriggerVariants> & {
    className?: string;
    contentClassName?: string;
  };

const ModelSelectorImpl = ({
  value: controlledValue,
  onValueChange: controlledOnValueChange,
  defaultValue,
  models,
  variant,
  size,
  className,
  contentClassName,
  ...forwardedProps
}: ModelSelectorProps) => {
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(
    () => defaultValue ?? models[0]?.id ?? "",
  );

  const value = isControlled ? controlledValue : internalValue;
  const onValueChange = controlledOnValueChange ?? setInternalValue;

  const api = useAssistantApi();

  useEffect(() => {
    const config = { config: { modelName: value } };
    return api.modelContext().register({
      getModelContext: () => config,
    });
  }, [api, value]);

  return (
    <ModelSelectorRoot
      models={models}
      value={value}
      onValueChange={onValueChange}
      {...forwardedProps}
    >
      <ModelSelectorTrigger
        variant={variant}
        size={size}
        className={className}
      />
      <ModelSelectorContent className={contentClassName} />
    </ModelSelectorRoot>
  );
};

type ModelSelectorComponent = typeof ModelSelectorImpl & {
  displayName?: string;
  Root: typeof ModelSelectorRoot;
  Trigger: typeof ModelSelectorTrigger;
  Content: typeof ModelSelectorContent;
  Item: typeof ModelSelectorItem;
  Value: typeof ModelSelectorValue;
};

const ModelSelector = memo(
  ModelSelectorImpl,
) as unknown as ModelSelectorComponent;

ModelSelector.displayName = "ModelSelector";
ModelSelector.Root = ModelSelectorRoot;
ModelSelector.Trigger = ModelSelectorTrigger;
ModelSelector.Content = ModelSelectorContent;
ModelSelector.Item = ModelSelectorItem;
ModelSelector.Value = ModelSelectorValue;

export {
  ModelSelector,
  ModelSelectorRoot,
  ModelSelectorTrigger,
  ModelSelectorContent,
  ModelSelectorItem,
  ModelSelectorValue,
};
