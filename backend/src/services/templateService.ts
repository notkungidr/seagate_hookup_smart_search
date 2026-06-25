import { dbSeagateDev } from "../db/client";
import { queryTemplates } from "../db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export class TemplateService {
  /**
   * Run a DDL statement to verify or create the table on startup.
   * Leverages TEXT columns to support JSON arrays in MySQL 5.0.0.
   */
  async ensureTableExists(): Promise<void> {
    try {
      await dbSeagateDev.execute(sql`
        CREATE TABLE IF NOT EXISTS query_templates (
          id VARCHAR(100) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          root_table VARCHAR(100) NOT NULL,
          root_column VARCHAR(100) NOT NULL,
          root_operator VARCHAR(20) NOT NULL DEFAULT 'like',
          root_conditions TEXT,
          hops TEXT,
          steps_chain TEXT,
          favorite_columns TEXT,
          created_at VARCHAR(50) NOT NULL,
          updated_at VARCHAR(50) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8
      `);
      console.log("✅ MySQL database (SeagateDev): checked/created 'query_templates' table.");

      // Self-healing migration: Add 'favorite_columns' to existing tables if missing
      try {
        await dbSeagateDev.execute(sql`
          ALTER TABLE query_templates ADD COLUMN favorite_columns TEXT
        `);
        console.log("✅ MySQL database (SeagateDev): added 'favorite_columns' column to 'query_templates' table.");
      } catch (colErr) {
        // Ignored if column already exists
      }
    } catch (err) {
      console.error("❌ Failed to verify/create 'query_templates' table on SeagateDev:", err);
    }
  }

  /**
   * Fetch all templates, parsing stored JSON arrays from TEXT fields.
   */
  async getAll() {
    const rows = await dbSeagateDev.select().from(queryTemplates);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || "",
      rootTable: r.rootTable,
      rootColumn: r.rootColumn,
      rootOperator: r.rootOperator,
      rootConditions: r.rootConditions ? JSON.parse(r.rootConditions) : [],
      hops: r.hops ? JSON.parse(r.hops) : [],
      stepsChain: r.stepsChain ? JSON.parse(r.stepsChain) : [],
      favoriteColumns: r.favoriteColumns ? JSON.parse(r.favoriteColumns) : [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Save (Insert/Upsert) a new template.
   */
  async save(tpl: any) {
    if (!tpl.id) throw new Error("Template id is required");

    const existing = await dbSeagateDev
      .select()
      .from(queryTemplates)
      .where(eq(queryTemplates.id, tpl.id))
      .limit(1);

    const record = {
      id: tpl.id,
      name: tpl.name,
      description: tpl.description || "",
      rootTable: tpl.rootTable,
      rootColumn: tpl.rootColumn,
      rootOperator: tpl.rootOperator || "like",
      rootConditions: JSON.stringify(tpl.rootConditions || []),
      hops: JSON.stringify(tpl.hops || []),
      stepsChain: JSON.stringify(tpl.stepsChain || []),
      favoriteColumns: JSON.stringify(tpl.favoriteColumns || []),
      createdAt: tpl.createdAt,
      updatedAt: tpl.updatedAt,
    };

    if (existing.length > 0) {
      await dbSeagateDev.update(queryTemplates).set(record).where(eq(queryTemplates.id, tpl.id));
    } else {
      await dbSeagateDev.insert(queryTemplates).values(record);
    }
    return tpl;
  }

  /**
   * Update existing template (e.g. name, description, etc.).
   */
  async update(id: string, patch: any) {
    const existing = await dbSeagateDev
      .select()
      .from(queryTemplates)
      .where(eq(queryTemplates.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new Error(`Template not found: ${id}`);
    }

    const current = existing[0];

    const parsedConditions = current.rootConditions ? JSON.parse(current.rootConditions) : [];
    const parsedHops = current.hops ? JSON.parse(current.hops) : [];
    const parsedStepsChain = current.stepsChain ? JSON.parse(current.stepsChain) : [];
    const parsedFavoriteColumns = current.favoriteColumns ? JSON.parse(current.favoriteColumns) : [];

    const updated = {
      id,
      name: patch.name !== undefined ? patch.name : current.name,
      description: patch.description !== undefined ? patch.description : (current.description || ""),
      rootTable: patch.rootTable !== undefined ? patch.rootTable : current.rootTable,
      rootColumn: patch.rootColumn !== undefined ? patch.rootColumn : current.rootColumn,
      rootOperator: patch.rootOperator !== undefined ? patch.rootOperator : current.rootOperator,
      rootConditions: patch.rootConditions !== undefined ? patch.rootConditions : parsedConditions,
      hops: patch.hops !== undefined ? patch.hops : parsedHops,
      stepsChain: patch.stepsChain !== undefined ? patch.stepsChain : parsedStepsChain,
      favoriteColumns: patch.favoriteColumns !== undefined ? patch.favoriteColumns : parsedFavoriteColumns,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    // Automatically recalculate stepsChain if root or hops are updated
    if (patch.hops || patch.rootTable) {
      updated.stepsChain = [updated.rootTable, ...updated.hops.map((h: any) => h.targetTable)];
    }

    await dbSeagateDev
      .update(queryTemplates)
      .set({
        name: updated.name,
        description: updated.description,
        rootTable: updated.rootTable,
        rootColumn: updated.rootColumn,
        rootOperator: updated.rootOperator,
        rootConditions: JSON.stringify(updated.rootConditions),
        hops: JSON.stringify(updated.hops),
        stepsChain: JSON.stringify(updated.stepsChain),
        favoriteColumns: JSON.stringify(updated.favoriteColumns),
        updatedAt: updated.updatedAt,
      })
      .where(eq(queryTemplates.id, id));

    return updated;
  }

  /**
   * Delete a template by id.
   */
  async delete(id: string) {
    await dbSeagateDev.delete(queryTemplates).where(eq(queryTemplates.id, id));
    return true;
  }
}

