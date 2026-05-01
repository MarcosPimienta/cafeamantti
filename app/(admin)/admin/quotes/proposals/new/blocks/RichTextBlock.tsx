'use client';

import React, { useRef, useEffect } from 'react';
import type { ProposalBlock } from './BlockCard';

interface RichTextBlockProps {
  block: ProposalBlock;
  onUpdate: (block: ProposalBlock) => void;
}

export default function RichTextBlock({ block, onUpdate }: RichTextBlockProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 100)}px`;
    }
  }, [block.text]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={block.title}
        onChange={(e) => onUpdate({ ...block, title: e.target.value })}
        placeholder="Título de la sección..."
        className="w-full text-base font-bold bg-transparent border-none focus:outline-none focus:ring-0 p-0 text-foreground placeholder:text-foreground/25"
      />
      <textarea
        ref={textareaRef}
        value={block.text || ''}
        onChange={(e) => onUpdate({ ...block, text: e.target.value })}
        placeholder="Escribe el contenido de esta sección..."
        className="w-full p-4 bg-foreground/[0.02] border border-foreground/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/10 transition-all text-sm leading-relaxed resize-none min-h-[100px]"
      />
    </div>
  );
}
