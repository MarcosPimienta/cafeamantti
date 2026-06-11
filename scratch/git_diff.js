const { execSync } = require('child_process');
try {
  const diff = execSync('git diff "app/(admin)/admin/cashflow/actions.ts"', { encoding: 'utf8' });
  console.log("DIFF STATUS:");
  console.log(diff);
} catch (e) {
  console.error("Error executing git diff:", e.message);
}
