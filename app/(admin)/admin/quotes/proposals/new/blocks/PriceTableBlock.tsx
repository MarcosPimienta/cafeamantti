'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ProposalBlock, PriceTableItem } from './BlockCard';

interface PriceTableBlockProps {
  block: ProposalBlock;
  onUpdate: (block: ProposalBlock) => void;
}

function calculateMargin(cost: number, pvp: number): string {
  if (pvp <= 0) return '—';
  const margin = ((pvp - cost) / pvp) * 100;
  return `${margin.toFixed(1)}%`;
}

export default function PriceTableBlock({ block, onUpdate }: PriceTableBlockProps) {
  const items = block.items || [{ item: '', cost: 0, pvp: 0 }];

  const updateItem = (index: number, field: keyof PriceTableItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    onUpdate({ ...block, items: newItems });
  };

  const addRow = () => {
    onUpdate({ ...block, items: [...items, { item: '', cost: 0, pvp: 0 }] });
  };

  const removeRow = (index: number) => {
    if (items.length <= 1) return;
    onUpdate({ ...block, items: items.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={block.title}
        onChange={(e) => onUpdate({ ...block, title: e.target.value })}
        placeholder="Título de la tabla..."
        className="w-full text-base font-bold bg-transparent border-none focus:outline-none focus:ring-0 p-0 text-foreground placeholder:text-foreground/25"
      />

      <div className="border border-foreground/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#292524] text-white text-xs">
              <th className="px-4 py-2.5 text-left font-semibold">Producto / Item</th>
              <th className="px-4 py-2.5 text-right font-semibold w-28">Costo</th>
              <th className="px-4 py-2.5 text-right font-semibold w-28">PVP Sugerido</th>
              <th className="px-4 py-2.5 text-right font-semibold w-20">Margen</th>
              <th className="px-2 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-foreground/[0.02]'} group`}>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={row.item}
                    onChange={(e) => updateItem(i, 'item', e.target.value)}
                    placeholder="Ej: Café 250g"
                    className="w-full bg-transparent border-none focus:outline-none text-sm p-0"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={row.cost || ''}
                    onChange={(e) => updateItem(i, 'cost', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-transparent border-none focus:outline-none text-sm text-right p-0 font-mono"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={row.pvp || ''}
                    onChange={(e) => updateItem(i, 'pvp', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-transparent border-none focus:outline-none text-sm text-right p-0 font-mono"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <span className={`text-xs font-bold ${
                    row.pvp > 0 && ((row.pvp - row.cost) / row.pvp * 100) >= 30 
                      ? 'text-green-600' 
                      : row.pvp > 0 ? 'text-amber-600' : 'text-foreground/30'
                  }`}>
                    {calculateMargin(row.cost, row.pvp)}
                  </span>
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded text-red-400 hover:text-red-600 transition-all"
                    title="Eliminar fila"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C59F59] hover:text-[#B38E4D] transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Agregar Fila
      </button>
    </div>
  );
}
