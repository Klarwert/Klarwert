import { getDb } from "./db/client";
import { BUILTIN_BANK_PROFILES } from "./lib/import/bankProfiles";
import { computeHeaderFingerprint } from "./lib/import/fingerprint";

async function main() {
  const db = await getDb();
  const dkb = BUILTIN_BANK_PROFILES.find(p => p.name === "DKB");
  if (dkb) {
    await db.execute(
      "update import_profiles set header_fingerprint = ?, delimiter = ?, column_map_json = ? where name = 'DKB'",
      [computeHeaderFingerprint(dkb.headers), dkb.delimiter, JSON.stringify(dkb.columnMap)]
    );
    console.log("DKB profile updated");
  }
}
main().catch(console.error);
