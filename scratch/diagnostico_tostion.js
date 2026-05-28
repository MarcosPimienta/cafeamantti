const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ztpcfcdevjyevaztsxiu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg5NDA1MywiZXhwIjoyMDg5NDcwMDUzfQ.xjulwENzR4DElhuOnDDSe2zAhxzaJ91TXKMzbSQCwBw'
);

async function run() {
  console.log('\n======================================================');
  console.log('  DIAGNÓSTICO INVENTARIO — TOSTIÓN vs CAFT-001');
  console.log('======================================================\n');

  // ── 1. Stock actual de CAFT-001 y CAFV-001 ────────────────────────────
  const { data: items } = await supabase
    .from('inventory')
    .select('product_code, product_name, current_stock, unit')
    .in('product_code', ['CAFT-001', 'CAFV-001', 'CAPG-001'])
    .order('product_code');

  console.log('=== [1] STOCK ACTUAL (CAFT-001 / CAFV-001 / CAPG-001) ===');
  if (items) {
    for (const it of items) {
      console.log(`  ${it.product_code.padEnd(12)} | ${it.product_name.padEnd(25)} | Stock: ${it.current_stock} ${it.unit}`);
    }
  }

  // ── 2. Todos los lotes de tostión en production_batches ──────────────
  const { data: batches, error: bErr } = await supabase
    .from('production_batches')
    .select(`
      id, process_type, input_quantity_kg, output_quantity_kg,
      weight_loss_pct, rendimiento_pct, movement_date, notes, created_at,
      input_inventory:input_inventory_id ( product_code, product_name ),
      output_inventory:output_inventory_id ( product_code, product_name )
    `)
    .eq('process_type', 'tostion')
    .order('movement_date', { ascending: true });

  console.log('\n=== [2] LOTES DE TOSTIÓN (production_batches) ===');
  if (bErr) {
    console.log('  ERROR:', bErr.message);
  } else if (!batches || batches.length === 0) {
    console.log('  ⚠️  NO HAY lotes de tostión registrados en production_batches.');
  } else {
    let totalInput = 0;
    let totalOutput = 0;
    for (const b of batches) {
      const inp = b.input_inventory;
      const out = b.output_inventory;
      console.log(`  [${b.movement_date || b.created_at?.split('T')[0]}] ` +
        `${inp?.product_code} → ${out?.product_code} | ` +
        `Input: ${b.input_quantity_kg} kg → Output: ${b.output_quantity_kg} kg | ` +
        `Rend: ${(b.rendimiento_pct * 100).toFixed(1)}%` +
        (b.notes ? ` | ${b.notes}` : ''));
      totalInput += Number(b.input_quantity_kg);
      totalOutput += Number(b.output_quantity_kg);
    }
    console.log(`\n  TOTALES → Input: ${totalInput.toFixed(2)} kg Verde | Output esperado: ${totalOutput.toFixed(2)} kg Tostado`);
  }

  // ── 3. Movimientos de inventario ligados a CAFT-001 ───────────────────
  const caftItem = items?.find(i => i.product_code === 'CAFT-001');
  if (!caftItem) {
    console.log('\n  ERROR: CAFT-001 no encontrado en inventory.');
    return;
  }

  const { data: caftMovs } = await supabase
    .from('inventory_movements')
    .select('id, type, quantity, reason, tab_source, movement_date, created_at')
    .eq('inventory_id', (await supabase.from('inventory').select('id').eq('product_code','CAFT-001').single()).data.id)
    .order('movement_date', { ascending: true });

  console.log('\n=== [3] MOVIMIENTOS DE CAFT-001 (inventory_movements) ===');
  if (!caftMovs || caftMovs.length === 0) {
    console.log('  ⚠️  No hay movimientos registrados para CAFT-001.');
  } else {
    let runningBalance = 0;
    for (const m of caftMovs) {
      runningBalance += Number(m.quantity);
      console.log(`  [${m.movement_date || m.created_at?.split('T')[0]}] ` +
        `${m.type.toUpperCase().padEnd(7)} | qty: ${String(m.quantity).padStart(8)} | ` +
        `balance: ${runningBalance.toFixed(2).padStart(8)} | ` +
        `tab: ${(m.tab_source || '-').padEnd(12)} | ${m.reason || ''}`);
    }
    console.log(`\n  ➡️  Balance calculado desde movimientos: ${runningBalance.toFixed(2)} kg`);
    console.log(`  ➡️  Stock actual en DB:                 ${caftItem.current_stock} kg`);
    if (Math.abs(runningBalance - Number(caftItem.current_stock)) > 0.01) {
      console.log(`\n  🚨 DISCREPANCIA: Hay una diferencia de ${(Number(caftItem.current_stock) - runningBalance).toFixed(2)} kg entre el stock y los movimientos.`);
    } else {
      console.log('\n  ✅ Stock consistente con movimientos.');
    }
  }

  // ── 4. Movimientos de tostión (tab_source prod_consumo) con info de producto ──
  const { data: tostMovs } = await supabase
    .from('inventory_movements')
    .select(`
      id, type, quantity, reason, tab_source, movement_date, created_at,
      inventory ( product_code, product_name )
    `)
    .or("tab_source.eq.prod_consumo,reason.ilike.%Tostión%,reason.ilike.%tostion%")
    .order('movement_date', { ascending: true });

  console.log('\n=== [4] MOVIMIENTOS RELACIONADOS CON TOSTIÓN (all products) ===');
  if (!tostMovs || tostMovs.length === 0) {
    console.log('  ⚠️  No se encontraron movimientos de tostión.');
  } else {
    for (const m of tostMovs) {
      const inv = m.inventory;
      console.log(`  [${m.movement_date || m.created_at?.split('T')[0]}] ` +
        `${inv?.product_code?.padEnd(12)} | ${m.type.toUpperCase().padEnd(7)} | ` +
        `qty: ${String(m.quantity).padStart(8)} | tab: ${(m.tab_source||'-').padEnd(12)} | ${m.reason||''}`);
    }
  }

  // ── 5. Diagnóstico del problema ───────────────────────────────────────
  console.log('\n=== [5] DIAGNÓSTICO ===');
  const hasBatches = batches && batches.length > 0;
  const hasCaftMovs = caftMovs && caftMovs.length > 0;
  const entradas = caftMovs?.filter(m => m.type === 'entrada') || [];
  const caftEntradasFromTostion = entradas.filter(
    m => m.reason?.toLowerCase().includes('tostión') || m.reason?.toLowerCase().includes('tostion')
  );

  if (hasBatches && caftEntradasFromTostion.length === 0) {
    console.log('  🚨 PROBLEMA DETECTADO:');
    console.log(`     Hay ${batches.length} lote(s) de tostión en production_batches`);
    console.log('     PERO no hay entradas en inventory_movements para CAFT-001 con razón "Tostión".');
    console.log('');
    console.log('  ❓ Posible causa: el output_inventory_id en los lotes NO apunta a CAFT-001.');
    
    // Verificar a dónde apunta el output
    const wrongOutputs = batches.filter(b => b.output_inventory?.product_code !== 'CAFT-001');
    if (wrongOutputs.length > 0) {
      console.log('\n  🔍 Lotes con output_inventory diferente a CAFT-001:');
      for (const w of wrongOutputs) {
        console.log(`     Lote ${w.id.substring(0,8)}... → output: ${w.output_inventory?.product_code} (${w.output_inventory?.product_name})`);
      }
      console.log('\n  ✅ Este es el bug: en el formulario de tostión, el producto de salida');
      console.log('     está configurado como otro ítem en vez de CAFT-001.');
    }
  } else if (!hasBatches) {
    console.log('  ⚠️  No hay lotes de tostión → el proceso no está completando el registro correctamente.');
  } else if (caftEntradasFromTostion.length > 0) {
    console.log(`  ✅ Hay ${caftEntradasFromTostion.length} entrada(s) de tostión para CAFT-001.`);
    console.log('     El proceso SÍ registra movimientos. Revisar si el stock se actualiza correctamente.');
    
    // Chequear si current_stock coincide
    const sumEntradas = entradas.reduce((s, m) => s + Number(m.quantity), 0);
    const sumSalidas = (caftMovs?.filter(m => m.type === 'salida') || []).reduce((s, m) => s + Number(m.quantity), 0);
    console.log(`\n     Sum entradas: ${sumEntradas.toFixed(2)} kg`);
    console.log(`     Sum salidas:  ${sumSalidas.toFixed(2)} kg`);
    console.log(`     Neto:         ${(sumEntradas + sumSalidas).toFixed(2)} kg`);
  }

  console.log('\n======================================================\n');
}

run().catch(console.error);
