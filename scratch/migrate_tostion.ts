
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ztpcfcdevjyevaztsxiu.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0cGNmY2Rldmp5ZXZhenRzeGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTQwNTMsImV4cCI6MjA4OTQ3MDA1M30.jeIeccI74HxNE2-tPzXHOayhRUkl7Hd158abIYwuGfk";

async function migrateLegacyTostion() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Get CAFT-001 ID
  const { data: caft } = await supabase
    .from('inventory')
    .select('id, product_name, current_stock')
    .eq('product_code', 'CAFT-001')
    .single();

  if (!caft) {
    console.log("Error: No se encontró el producto CAFT-001");
    return;
  }

  // 2. Get legacy movements (salidas from prod_consumo)
  const { data: movs } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('tab_source', 'prod_consumo')
    .eq('type', 'salida')
    .is('production_batch_id', null); // Only those not yet migrated

  if (!movs || movs.length === 0) {
    console.log("No hay movimientos pendientes de migración.");
    return;
  }

  console.log(`Migrando ${movs.length} movimientos a CAFT-001...`);

  let totalKgs = 0;

  for (const m of movs) {
    const qty = Math.abs(Number(m.quantity));
    
    // a. Create production batch
    const { data: batch, error: bErr } = await supabase
      .from('production_batches')
      .insert({
        process_type: 'tostion',
        input_inventory_id: m.inventory_id,
        input_quantity_kg: qty,
        output_inventory_id: caft.id,
        output_quantity_kg: qty,
        rendimiento_pct: 1.0,
        weight_loss_pct: 0.0,
        movement_date: m.movement_date || m.created_at,
        notes: m.reason || 'Migración automática de historial',
        created_by: m.admin_id
      })
      .select()
      .single();

    if (bErr) {
      console.error(`Error creando lote para movimiento ${m.id}:`, bErr.message);
      continue;
    }

    // b. Create Entrada for CAFT-001
    await supabase.from('inventory_movements').insert({
      inventory_id: caft.id,
      type: 'entrada',
      quantity: qty,
      movement_date: m.movement_date || m.created_at,
      reason: `Entrada automática por migración (Lote ${batch.id})`,
      admin_id: m.admin_id,
      tab_source: 'prod_consumo',
      production_batch_id: batch.id
    });

    // c. Link legacy movement to batch
    await supabase.from('inventory_movements')
      .update({ production_batch_id: batch.id })
      .eq('id', m.id);

    totalKgs += qty;
  }

  // 3. Update final stock for CAFT-001
  const newStock = Number(caft.current_stock) + totalKgs;
  await supabase.from('inventory')
    .update({ current_stock: newStock })
    .eq('id', caft.id);

  console.log(`Migración completada. Se sumaron ${totalKgs} kg a CAFT-001. Nuevo stock: ${newStock} kg`);
}

migrateLegacyTostion();
