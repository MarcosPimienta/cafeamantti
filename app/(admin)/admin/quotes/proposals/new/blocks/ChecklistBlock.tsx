'use client';

import React from 'react';
import { Plus, Trash2, Square, CheckSquare as CheckSquareIcon } from 'lucide-react';
import type { ProposalBlock } from './BlockCard';

interface ChecklistBlockProps {
  block: ProposalBlock;
  onUpdate: (block: ProposalBlock) => void;
}

export default function ChecklistBlock({ block, onUpdate }: ChecklistBlockProps) {
  const items = block.checklistItems || [''];

  const updateItem = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    onUpdate({ ...block, checklistItems: newItems });
  };

  const addItem = () => {
    onUpdate({ ...block, checklistItems: [...items, ''] });
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    onUpdate({ ...block, checklistItems: items.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={block.title}
        onChange={(e) => onUpdate({ ...block, title: e.target.value })}
        placeholder="Título del checklist..."
        className="w-full text-base font-bold bg-transparent border-none focus:outline-none focus:ring-0 p-0 text-foreground placeholder:text-foreground/25"
      />

      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 group">
            <CheckSquareIcon className="w-4 h-4 text-[#C59F59] flex-shrink-0" />
            <input
              type="text"
              value={item}
              onChange={(e) => updateItem(i, e.target.value)}
              placeholder="Escribe un punto..."
              className="flex-1 bg-foreground/[0.02] border border-foreground/5 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/10 transition-all"
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition-all"
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addItem}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C59F59] hover:text-[#B38E4D] transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Agregar Item
      </button>
    </div>
  );
}
