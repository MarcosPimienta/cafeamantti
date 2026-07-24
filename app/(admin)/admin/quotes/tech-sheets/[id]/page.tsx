import React from 'react';
import { notFound } from 'next/navigation';
import { getTechSheetById } from '../../actions';
import TechSheetForm from '../new/TechSheetForm';

export default async function EditTechSheetPage({ params }: { params: { id: string } }) {
  const sheet = await getTechSheetById(params.id);

  if (!sheet) {
    notFound();
  }

  return <TechSheetForm initialData={sheet} />;
}
