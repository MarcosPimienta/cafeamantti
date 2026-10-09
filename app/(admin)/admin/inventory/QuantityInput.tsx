"use client";

import React, { useState } from "react";
import { convertWeight, describeIn, formatQty, parseQtyInput, weightUnitOf, type WeightUnit } from "@/utils/units";

/**
 * Quantity field. For items stocked by weight (kg or g) it adds a kg / g
 * switch: the admin types in whichever is handier and `onChange` always
 * receives the value in the item's own unit (`baseUnit`), as a string, so
 * the server and stock never see grams for a kg item. Other units render a
 * plain field.
 */
export default function QuantityInput({
  id,
  value,
  onChange,
  baseUnit,
  placeholder,
  required,
  allowNegative = false,
  className = "",
  ariaLabel,
}: {
  id?: string;
  /** Quantity in `baseUnit`. */
  value: string;
  onChange: (valueInBaseUnit: string) => void;
  /** The item's stock unit ("kg", "g", "unidad"…). */
  baseUnit: string | null | undefined;
  placeholder?: string;
  required?: boolean;
  allowNegative?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const base = weightUnitOf(baseUnit);
  const [unit, setUnit] = useState<WeightUnit | null>(base);
  const [text, setText] = useState(value);
  const [emitted, setEmitted] = useState(value);
  const [lastBase, setLastBase] = useState(base);

  // Follow the item: a new product resets the unit to its own.
  if (lastBase !== base) {
    setLastBase(base);
    setUnit(base);
  }
  const shown = unit ?? base;

  // Follow outside changes (form reset, auto-calculated outputs).
  if (value !== emitted) {
    setEmitted(value);
    const n = parseQtyInput(value);
    setText(n === null || !base || !shown ? value : formatQty(convertWeight(n, base, shown)));
  }

  function emit(nextText: string, inUnit: WeightUnit | null) {
    setText(nextText);
    const n = parseQtyInput(nextText, inUnit);
    const out =
      n === null ? (nextText.trim() === "" ? "" : value) : base && inUnit ? formatQty(convertWeight(n, inUnit, base)) : String(n);
    setEmitted(out);
    onChange(out);
  }

  function switchUnit(next: WeightUnit) {
    if (!shown || next === shown) return;
    const n = parseQtyInput(text, shown);
    setUnit(next);
    if (n !== null) setText(formatQty(convertWeight(n, shown, next)));
  }

  const n = parseQtyInput(text, shown);
  const inputCls =
    "w-full px-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20";

  const input = (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const v = e.target.value;
        if (v !== "" && !(allowNegative ? /^-?[\d.,]*$/ : /^[\d.,]*$/).test(v)) return;
        emit(v, shown);
      }}
      placeholder={placeholder}
      required={required}
      aria-label={ariaLabel}
      className={`${inputCls} ${className}`}
    />
  );

  if (!base || !shown) return input;

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">{input}</div>
        <div className="flex shrink-0 rounded-xl border border-foreground/10 bg-white p-1" role="group" aria-label="Unidad de peso">
          {(["kg", "g"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={shown === u}
              onClick={() => switchUnit(u)}
              className={`px-2.5 rounded-lg text-xs font-bold transition-colors ${
                shown === u ? "bg-[#C59F59] text-white" : "text-foreground/50 hover:bg-foreground/5"
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      {shown !== base && n !== null && (
        <p className="text-[11px] text-foreground/50 mt-1">= {describeIn(convertWeight(n, shown, base), base)} en inventario</p>
      )}
    </div>
  );
}
