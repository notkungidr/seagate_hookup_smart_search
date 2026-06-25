import { dbSeagateDev, getRawPool } from "../db/client";
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

      // Self-healing migration: Add 'created_by' and 'visibility' columns
      try {
        await dbSeagateDev.execute(sql`
          ALTER TABLE query_templates ADD COLUMN created_by VARCHAR(50) DEFAULT ''
        `);
        console.log("✅ MySQL database (SeagateDev): added 'created_by' column to 'query_templates' table.");
      } catch (e: any) {
        if (!/duplicate column|Duplicate column/i.test(e?.message || "")) {
          console.warn("⚠️ ALTER query_templates ADD created_by failed:", e?.message || e);
        }
      }

      try {
        await dbSeagateDev.execute(sql`
          ALTER TABLE query_templates ADD COLUMN visibility VARCHAR(50) DEFAULT 'public'
        `);
        console.log("✅ MySQL database (SeagateDev): added 'visibility' column to 'query_templates' table.");
      } catch (e: any) {
        if (!/duplicate column|Duplicate column/i.test(e?.message || "")) {
          console.warn("⚠️ ALTER query_templates ADD visibility failed:", e?.message || e);
        }
      }

      // Check/create template_permissions table
      await dbSeagateDev.execute(sql`
        CREATE TABLE IF NOT EXISTS template_permissions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          template_id VARCHAR(100) NOT NULL,
          user_en VARCHAR(50) NOT NULL,
          assigned_at VARCHAR(50) NOT NULL,
          INDEX idx_template_id (template_id),
          INDEX idx_user_en (user_en)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8
      `);
      console.log("✅ MySQL database (SeagateDev): checked/created 'template_permissions' table.");
    } catch (err) {
      console.error("❌ Failed to verify/create 'query_templates' table on SeagateDev:", err);
    }
  }

  private async fetchAllowedUsers(templateId: string): Promise<string[]> {
    const pool = getRawPool("SeagateDev");
    try {
      const [rows] = await pool.execute(
        "SELECT user_en FROM template_permissions WHERE template_id = ?",
        [templateId]
      ) as [Array<{ user_en: string }>, any];
      return rows.map(r => r.user_en);
    } catch (e) {
      return [];
    }
  }

  private async syncAllowedUsers(templateId: string, allowedUsers: string[]): Promise<void> {
    const pool = getRawPool("SeagateDev");
    await pool.execute("DELETE FROM template_permissions WHERE template_id = ?", [templateId]);
    const now = new Date().toISOString();
    const unique = [...new Set((allowedUsers || []).map(e => String(e).trim()).filter(Boolean))];
    for (const en of unique) {
      await pool.execute(
        "INSERT INTO template_permissions (template_id, user_en, assigned_at) VALUES (?, ?, ?)",
        [templateId, en, now]
      );
    }
  }

  /**
   * Fetch all templates, parsing stored JSON arrays from TEXT fields.
   * Scopes results based on viewer parameter.
   */
  async getAll(viewer?: { en: string; permission: string } | null) {
    const rows = await dbSeagateDev.select().from(queryTemplates);

    // Bulk-load permissions to avoid N+1
    const pool = getRawPool("SeagateDev");
    let permRows: Array<{ template_id: string; user_en: string }> = [];
    try {
      const [res] = await pool.execute(
        "SELECT template_id, user_en FROM template_permissions"
      ) as [Array<{ template_id: string; user_en: string }>, any];
      permRows = res;
    } catch (e) {
      // Swallowed in case table doesn't exist yet
    }

    const permMap = new Map<string, string[]>();
    permRows.forEach(p => {
      if (!permMap.has(p.template_id)) permMap.set(p.template_id, []);
      permMap.get(p.template_id)!.push(p.user_en);
    });

    const all = rows.map(r => ({
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
      createdBy: r.createdBy || "",
      visibility: r.visibility || "public",
      allowedUsers: permMap.get(r.id) || [],
    }));

    if (viewer && viewer.permission === "admin") return all;

    if (!viewer) {
      // Guest: see ONLY public templates
      return all.filter(tpl => tpl.visibility === "public");
    }

    const en = String(viewer.en || "").trim();
    return all.filter(tpl =>
      tpl.visibility === "public" ||
      tpl.createdBy === en ||
      (tpl.allowedUsers || []).includes(en)
    );
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
      createdBy: tpl.createdBy || "",
      visibility: tpl.visibility || "public",
    };

    if (existing.length > 0) {
      await dbSeagateDev.update(queryTemplates).set(record).where(eq(queryTemplates.id, tpl.id));
    } else {
      await dbSeagateDev.insert(queryTemplates).values(record);
    }
    
    await this.syncAllowedUsers(tpl.id, tpl.allowedUsers || []);
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
      createdBy: patch.createdBy !== undefined ? patch.createdBy : (current.createdBy || ""),
      visibility: patch.visibility !== undefined ? patch.visibility : (current.visibility || "public"),
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
        createdBy: updated.createdBy,
        visibility: updated.visibility,
      })
      .where(eq(queryTemplates.id, id));

    if (patch.allowedUsers !== undefined) {
      await this.syncAllowedUsers(id, patch.allowedUsers);
    }

    return updated;
  }

  /**
   * Delete a template by id.
   */
  async delete(id: string) {
    await dbSeagateDev.delete(queryTemplates).where(eq(queryTemplates.id, id));
    
    // Clean up template permissions
    const pool = getRawPool("SeagateDev");
    try {
      await pool.execute("DELETE FROM template_permissions WHERE template_id = ?", [id]);
    } catch (e) {
      // Swallowed
    }
    return true;
  }
}

