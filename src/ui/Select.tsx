import * as Primitive from "@radix-ui/react-select";
import {
  Children,
  isValidElement,
  useRef,
  useState,
  useEffect,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
type Option = { value: string; label: ReactNode; disabled?: boolean };
function optionsOf(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{
        value?: string | number;
        children?: ReactNode;
        disabled?: boolean;
      }>(child)
    )
      return [];
    return child.type === "option"
      ? [
          {
            value: String(child.props.value ?? ""),
            label: child.props.children,
            disabled: child.props.disabled,
          },
        ]
      : optionsOf(child.props.children);
  });
}
/** The native value element owns serialization and dispatches real change events. */
export function Select({
  children,
  value,
  defaultValue,
  onChange,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = optionsOf(children);
  const resetValue = String(defaultValue ?? options[0]?.value ?? "");
  const [internal, setInternal] = useState(
    String(defaultValue ?? options[0]?.value ?? ""),
  );
  const current = value === undefined ? internal : String(value);
  const native = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    const form = native.current?.form;
    const reset = () =>
      queueMicrotask(() => {
        setInternal(resetValue);
        if (native.current) native.current.value = resetValue;
        setInvalid(false);
      });
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [resetValue]);
  return (
    <div className={`select-field ${className}`}>
      <Primitive.Root
        value={"wf:" + current}
        disabled={props.disabled}
        onValueChange={(next) => {
          const el = native.current!;
          el.value = next.slice(3);
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }}
      >
        <Primitive.Trigger
          ref={trigger}
          id={props.id}
          className="select-trigger"
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
          aria-invalid={invalid || undefined}
        >
          <Primitive.Value />
          <Primitive.Icon>
            <ChevronDown size={18} />
          </Primitive.Icon>
        </Primitive.Trigger>
        <Primitive.Portal>
          <Primitive.Content
            position="popper"
            sideOffset={6}
            collisionPadding={8}
            className="choice-popover"
          >
            <Primitive.ScrollUpButton className="choice-scroll">
              <ChevronUp size={18} />
            </Primitive.ScrollUpButton>
            <Primitive.Viewport className="choice-viewport">
              {options.map((o) => (
                <Primitive.Item
                  value={"wf:" + o.value}
                  key={o.value}
                  disabled={o.disabled}
                  className="choice-option"
                >
                  <Primitive.ItemText>{o.label}</Primitive.ItemText>
                  <Primitive.ItemIndicator>
                    <Check size={18} />
                  </Primitive.ItemIndicator>
                </Primitive.Item>
              ))}
            </Primitive.Viewport>
            <Primitive.ScrollDownButton className="choice-scroll">
              <ChevronDown size={18} />
            </Primitive.ScrollDownButton>
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
      <select
        {...props}
        id={undefined}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        ref={native}
        value={current}
        onInvalid={(e) => {
          e.preventDefault();
          setInvalid(true);
          trigger.current?.focus();
        }}
        onChange={(e) => {
          setInternal(e.target.value);
          setInvalid(false);
          onChange?.(e);
        }}
      >
        {children}
      </select>
      {invalid && <span className="field-error">항목을 선택해 주세요.</span>}
    </div>
  );
}
