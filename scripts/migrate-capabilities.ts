import { db } from "../server/storage";
import { sql } from "drizzle-orm";

const WORKSPACE_ID = "5a13e507-4524-4c56-ae58-6f455d6c0315";

function mapOurStatus(status: string | null): string {
  if (status === "yes") return "yes";
  if (status === "partial") return "partial";
  if (status === "no") return "no";
  return "na";
}

async function main() {
  console.log("=== Capability Migration Script ===");
  console.log(`Workspace: ${WORKSPACE_ID}`);
  console.log("");

  // 1. Read all workspace_capabilities for the workspace
  const capsResult = await db.execute(sql`
    SELECT id, workspace_id, name, display_order, our_status
    FROM workspace_capabilities
    WHERE workspace_id = ${WORKSPACE_ID}
    ORDER BY display_order ASC
  `);

  const capabilities = capsResult.rows;
  console.log(`Found ${capabilities.length} workspace capabilities`);

  if (capabilities.length === 0) {
    console.log("No capabilities to migrate. Exiting.");
    process.exit(0);
  }

  // 2. Read entrust_capabilities for this workspace to get our_status overrides
  const entrustResult = await db.execute(sql`
    SELECT id, workspace_id, capability_id, entity_name, status
    FROM entrust_capabilities
    WHERE workspace_id = ${WORKSPACE_ID}
  `);

  const entrustRows = entrustResult.rows;
  console.log(`Found ${entrustRows.length} entrust_capabilities rows`);

  // Build a map: capability_id -> status
  const entrustByCapId: Record<string, string> = {};
  for (const row of entrustRows) {
    entrustByCapId[String(row.capability_id)] = String(row.status || "unknown");
  }

  // 3. Build items array for the dimension
  const items = capabilities.map((cap) => {
    const capId = String(cap.id);
    const entrustStatus = entrustByCapId[capId] ?? String(cap.our_status ?? "unknown");
    return {
      name: String(cap.name),
      our_status: mapOurStatus(entrustStatus),
    };
  });

  console.log(`\nBuilt ${items.length} items for "Legacy capabilities" dimension`);

  // 4. Insert one competitive_dimensions row
  const dimResult = await db.execute(sql`
    INSERT INTO competitive_dimensions (workspace_id, name, source, priority, display_order, items)
    VALUES (
      ${WORKSPACE_ID}::uuid,
      'Legacy capabilities',
      'custom',
      'medium',
      0,
      ${JSON.stringify(items)}::jsonb
    )
    RETURNING id, name
  `);

  const dimension = dimResult.rows[0];
  const dimensionId = String(dimension.id);
  console.log(`\nInserted competitive_dimensions row:`);
  console.log(`  id: ${dimensionId}`);
  console.log(`  name: ${dimension.name}`);

  // 5. Read competitor_capabilities for this workspace
  const compCapsResult = await db.execute(sql`
    SELECT id, workspace_id, capability_id, entity_name, status, assessment
    FROM competitor_capabilities
    WHERE workspace_id = ${WORKSPACE_ID}
  `);

  const compCaps = compCapsResult.rows;
  console.log(`\nFound ${compCaps.length} competitor_capabilities rows`);

  // Build a map: capability_id -> capability name
  const capNameById: Record<string, string> = {};
  for (const cap of capabilities) {
    capNameById[String(cap.id)] = String(cap.name);
  }

  // 6. Insert competitor_dimension_status rows
  let statusesInserted = 0;
  let skipped = 0;

  for (const comp of compCaps) {
    const capId = String(comp.capability_id);
    const itemName = capNameById[capId];

    if (!itemName) {
      console.warn(`  WARN: capability_id ${capId} not found in workspace_capabilities — skipping`);
      skipped++;
      continue;
    }

    const entityName = String(comp.entity_name || "");
    const status = String(comp.status || "unknown");

    await db.execute(sql`
      INSERT INTO competitor_dimension_status (dimension_id, entity_name, item_name, status, source)
      VALUES (
        ${dimensionId}::uuid,
        ${entityName},
        ${itemName},
        ${status},
        'manual'
      )
    `);
    statusesInserted++;
  }

  console.log(`\nInserted ${statusesInserted} competitor_dimension_status rows`);
  if (skipped > 0) {
    console.log(`Skipped ${skipped} rows (capability not found in workspace_capabilities)`);
  }

  // 7. Summary
  console.log("\n=== Migration Summary ===");
  console.log(`Capabilities migrated as items: ${capabilities.length}`);
  console.log(`Competitor statuses created:    ${statusesInserted}`);

  // 8. Verification
  console.log("\n=== Verification ===");
  const verifyDims = await db.execute(sql`
    SELECT COUNT(*) AS count FROM competitive_dimensions WHERE workspace_id = ${WORKSPACE_ID}
  `);
  const verifyStatuses = await db.execute(sql`
    SELECT COUNT(*) AS count FROM competitor_dimension_status WHERE dimension_id = ${dimensionId}::uuid
  `);

  console.log(`competitive_dimensions rows (this workspace): ${verifyDims.rows[0].count}`);
  console.log(`competitor_dimension_status rows (this dimension): ${verifyStatuses.rows[0].count}`);
  console.log("\nMigration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
