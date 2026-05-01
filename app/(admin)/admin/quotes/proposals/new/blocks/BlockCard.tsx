'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Type, Table, CheckSquare } from 'lucide-react';

export type BlockType = 'rich-text' | 'price-table' | 'checklist';

export interface ProposalBlock {
  id: string;
  type: BlockType;
  title: string;
  text?: string;
  items?: PriceTableItem[];
  checklistItems?: string[];
}

export interface PriceTableItem {
  item: string;
  cost: number;
  pvp: number;
}

const TYPE_OPTIONS: { value: BlockType; label: string; icon: React.ReactNode }[] = [
  { value: 'rich-text', label: 'Texto', icon: <Type className="w-3.5 h-3.5" /> },
  { value: 'price-table', label: 'Tabla de Precios', icon: <Table className="w-3.5 h-3.5" /> },
  { value: 'checklist', label: 'Checklist', icon: <CheckSquare className="w-3.5 h-3.5" /> },
];

interface BlockCardProps {
  block: ProposalBlock;
  onUpdate: (block: ProposalBlock) => void;
  onDelete: () => void;
  children: React.ReactNode;
}

export default function BlockCard({ block, onUpdate, onDelete, children }: BlockCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleTypeChange = (newType: BlockType) => {
    const updated: ProposalBlock = { ...block, type: newType };
    
    // Ensure default data for the new type exists, but DON'T delete existing data of other types
    if (newType === 'rich-text') {
      if (updated.text === undefined) updated.text = '';
    } else if (newType === 'price-table') {
      if (!updated.items || updated.items.length === 0) {
        updated.items = [{ item: '', cost: 0, pvp: 0 }];
      }
    } else if (newType === 'checklist') {
      if (!updated.checklistItems || updated.checklistItems.length === 0) {
        updated.checklistItems = [''];
      }
    }
    
    onUpdate(updated);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-2xl shadow-sm transition-all ${isDragging ? 'opacity-50 shadow-xl border-[#C59F59]/40 scale-[1.02]' : 'border-foreground/10 hover:border-foreground/20'}`}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/5 bg-[#FDFBF7] rounded-t-2xl">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-foreground/5 rounded-lg text-foreground/30 hover:text-foreground/50 transition-colors"
          title="Arrastrar"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1 bg-foreground/[0.04] rounded-lg p-0.5">
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleTypeChange(opt.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                block.type === opt.value
                  ? 'bg-white shadow-sm text-[#C59F59]'
                  : 'text-foreground/40 hover:text-foreground/60'
              }`}
              title={opt.label}
            >
              {opt.icon}
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onDelete}
          className="p-2 hover:bg-red-50 rounded-lg text-foreground/20 hover:text-red-500 transition-colors"
          title="Eliminar bloque"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}
