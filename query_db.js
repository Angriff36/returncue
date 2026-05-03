const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const purchases = await p.purchase.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
  console.log("=== PURCHASES ===");
  console.log(JSON.stringify(purchases, null, 2));
  
  const scans = await p.emailScan.findMany({ orderBy: { startedAt: "desc" }, take: 3 });
  console.log("=== EMAIL SCANS ===");
  console.log(JSON.stringify(scans, null, 2));
  
  await p.$disconnect();
}
main();
