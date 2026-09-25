"use client";

import { useState, type ComponentProps } from "react";
import { NumericFormat } from "react-number-format";
import { Input } from "@/components/ui/input";

type CurrencyInputProps = Omit<ComponentProps<typeof Input>, "type" | "inputMode" | "value" | "defaultValue" | "onChange" | "min" | "max" | "step"> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function CurrencyInput({ value, onValueChange, onFocus, onBlur, ref, ...props }: CurrencyInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <NumericFormat
      {...props}
      customInput={Input}
      getInputRef={ref}
      type="text"
      inputMode="decimal"
      value={value}
      valueIsNumericString
      thousandSeparator=","
      decimalSeparator="."
      decimalScale={2}
      fixedDecimalScale={!focused}
      allowNegative={false}
      onValueChange={(values, sourceInfo) => {
        // Keep separators out of form state and numeric API payloads.
        if (sourceInfo.source === "event") onValueChange(values.value);
      }}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); onBlur?.(event); }}
    />
  );
}
