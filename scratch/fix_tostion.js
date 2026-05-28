const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://ztpcfcdevjyevaztsxiu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5NDA1MywiZXhwIjoyMDg5NDcwMDUzfQ.xjulwENzR4DElhuOnDDSe2zAhxzaJ91TXKMzbSQCwBw'
);

async function fix() {
  const { data: items } = await supabase
    .from('inventory')
    .select('id, product_code, current_stock')
    .in('product_code', ['CAFT-001', 'CAFT-2K5']);

  const caft001 = items.find(i => i.product_code === 'CAFT-001');
  const caft2k5 = items.find(i => i.product_code === 'CAFT-2K5');
  console.log('Stocks actuales → CAFT-001:', caft001.current_stock, '| CAFT-2K5:', caft2k5.current_stock);

  // Buscar el movimiento de 162kg en CAFT-2K5
  const { data: movs } = await supabase
    .from('inventory_movements')
    .select('id, quantity, reason, movement_date')
    .eq('inventory_id', caft2k5.id)
    .eq('quantity', 162)
    .eq('movement_date', '2026-05-25');

  console.log('Movimiento encontrado:', JSON.stringify(movs));

  if (!movs || movs.length === 0) {
    console.log('No se encontró el movimiento, buscando por fecha...');
    const { data: movs2 } = await supabase
      .from('inventory_movements')
      .select('id, quantity, reason, movement_date')
      .eq('inventory_id', caft2k5.id)
      .gte('movement_date', '2026-05-24');
    console.log('Movimientos CAFT-2K5 recientes:', JSON.stringify(movs2));
    return;
  }

  const mov = movs[0];

  // Reasignar movimiento a CAFT-001
  const { error: movErr } = await supabase
    .from('inventory_movements')
    .update({ inventory_id: caft001.id })
    .eq('id', mov.id);
  if (movErr) { console.error('Error mov:', movErr.message); return; }
  console.log('✅ Movimiento reasignado a CAFT-001');

  // Quitar 162 de CAFT-2K5
  const { error: e1 } = await supabase
    .from('inventory')
    .update({ current_stock: Number(caft2k5.current_stock) - 162 })
    .eq('id', caft2k5.id);
  if (e1) { console.error('Error CAFT-2K5:', e1.message); return; }
  console.log('✅ CAFT-2K5:', caft2k5.current_stock, '->', Number(caft2k5.current_stock) - 162);

  // Sumar 162 a CAFT-001
  const { error: e2 } = await supabase
    .from('inventory')
    .update({ current_stock: Number(caft001.current_stock) + 162 })
    .eq('id', caft001.id);
  if (e2) { console.error('Error CAFT-001:', e2.message); return; }
  console.log('✅ CAFT-001:', caft001.current_stock, '->', Number(caft001.current_stock) + 162);

  // Resultado final
  const { data: after } = await supabase
    .from('inventory')
    .select('product_code, current_stock')
    .in('product_code', ['CAFT-001', 'CAFT-2K5']);
  console.log('\n✅ Corrección completada:');
  after.forEach(i => console.log('  ', i.product_code, '→ stock:', i.current_stock));
}

fix().catch(console.error);
