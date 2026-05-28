const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://ztpcfcdevjyevaztsxiu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5NDA1MywiZXhwIjoyMDg5NDcwMDUzfQ.xjulwENzR4DElhuOnDDSe2zAhxzaJ91TXKMzbSQCwBw'
);

async function run() {
  const { data: batches, error } = await supabase
    .from('production_batches')
    .select(`
      id, input_quantity_kg, output_quantity_kg, movement_date, notes,
      output_inventory_id,
      input_inventory:input_inventory_id(product_code),
      output_inventory:output_inventory_id(product_code, product_name)
    `)
    .eq('process_type', 'tostion')
    .order('movement_date', { ascending: false });

  if (error) { console.error(error); return; }

  // Agrupar por código de salida
  const grouped = {};
  for (const b of batches) {
    const out = Array.isArray(b.output_inventory) ? b.output_inventory[0] : b.output_inventory;
    const code = out ? out.product_code : 'NULL';
    const name = out ? out.product_name : '?';
    if (!grouped[code]) grouped[code] = { count: 0, totalKg: 0, name };
    grouped[code].count++;
    grouped[code].totalKg += Number(b.output_quantity_kg);
  }

  console.log('=== LOTES DE TOSTIÓN agrupados por producto de salida ===');
  for (const [code, info] of Object.entries(grouped)) {
    const status = code === 'CAFT-001' ? '✅' : '⚠️ ';
    console.log(status, code.padEnd(14), '|', String(info.count).padStart(3), 'lotes |',
      info.totalKg.toFixed(2).padStart(10), 'kg |', info.name);
  }

  // Lotes con output != CAFT-001
  const bad = batches.filter(b => {
    const out = Array.isArray(b.output_inventory) ? b.output_inventory[0] : b.output_inventory;
    return !out || out.product_code !== 'CAFT-001';
  });

  console.log('\nLotes correctos (→ CAFT-001):', batches.length - bad.length);
  console.log('Lotes con otro output:        ', bad.length);

  if (bad.length > 0) {
    console.log('\n=== DETALLE lotes con output != CAFT-001 ===');
    for (const b of bad) {
      const out = Array.isArray(b.output_inventory) ? b.output_inventory[0] : b.output_inventory;
      const inp = Array.isArray(b.input_inventory) ? b.input_inventory[0] : b.input_inventory;
      console.log('[' + b.movement_date + ']',
        inp?.product_code, '→', out?.product_code || 'NULL',
        '| output_kg:', b.output_quantity_kg,
        '| notes:', b.notes || '-');
    }
  }

  // Estado actual de stocks relevantes
  const { data: stocks } = await supabase
    .from('inventory')
    .select('product_code, current_stock, unit')
    .in('product_code', ['CAFT-001', 'CAFT-2K5', 'CAFT-500G', 'CAFT-250G', 'CAFT-125G', 'CAFV-001'])
    .order('product_code');

  console.log('\n=== STOCK ACTUAL ===');
  stocks.forEach(s => console.log(' ', s.product_code.padEnd(14), '| stock:', s.current_stock, s.unit));
}

run().catch(console.error);
