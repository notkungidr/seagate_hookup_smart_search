import mysql from "mysql2/promise";

async function inspectHost(host: string) {
  console.log(`\n=== Inspecting Host: ${host} ===`);
  try {
    const conn = await mysql.createConnection({
      host: host,
      port: 3306,
      user: "appsupport8",
      password: "It-development2006Bit",
    });
    console.log(`✅ Connected to ${host}`);
    
    // Use raw query to avoid prepared statement issues
    const [tables] = await conn.query("SHOW TABLES FROM BIT");
    const tableList = (tables as any[]).map(t => Object.values(t)[0]);
    console.log("Tables in BIT:", tableList);
    
    const acaBondingExists = tableList.some(t => String(t).toUpperCase() === "ACA_BONDING_DATA");
    console.log(`Does ACA_BONDING_DATA exist in BIT?`, acaBondingExists);

    if (acaBondingExists) {
      // Find the exact table name casing
      const exactName = tableList.find(t => String(t).toUpperCase() === "ACA_BONDING_DATA");
      console.log(`Exact table name:`, exactName);
      
      // Try to query it using query (not execute)
      try {
        const [rows] = await conn.query(`SELECT * FROM BIT.${exactName} WHERE customer = 'Seagate:ACA' LIMIT 1`);
        console.log(`✅ SELECT * successful! Found ${(rows as any[]).length} rows.`);
        console.log(`Sample row:`, (rows as any[])[0]);
      } catch (err: any) {
        console.log(`❌ SELECT failed:`, err.message);
      }
    }
    
    await conn.end();
  } catch (err: any) {
    console.log(`❌ Inspection Failed on ${host}:`, err.message);
  }
}

async function run() {
  await inspectHost("bitintra-db02.th.belton.corp");
  await inspectHost("bitintra-db01.th.belton.corp");
}

run();
