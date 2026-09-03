/**
 * Zentrale Referenz auf den ausgelieferten Stand des Klarwert-Community-Rules-Repos - siehe
 * docs/adr/009-community-daten-aus-tag.md: bewusst ein getaggtes Release, nie `main`, damit ein
 * fehlerhafter Merge dort nicht sofort bei allen Nutzern ankommt. Bei einem neuen Tag: NUR hier
 * ändern, nicht mehr an zwei Stellen synchron halten.
 */
const COMMUNITY_RULES_TAG = "v2026-09-04";

const COMMUNITY_RULES_BASE = `https://raw.githubusercontent.com/Klarwert/Klarwert-Community-Rules/${COMMUNITY_RULES_TAG}/dist`;

export const COMMUNITY_MERCHANTS_URL = `${COMMUNITY_RULES_BASE}/haendler.json`;
export const COMMUNITY_BANK_PROFILES_URL = `${COMMUNITY_RULES_BASE}/bankprofile.json`;
