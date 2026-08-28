export interface SavedScenario {
  id: string;
  type: "fire" | "zinseszins" | "entnahme";
  name: string;
  inputsJson: string;
  createdAt: string;
}

const STORAGE_KEY = "klarwert_rechner_scenarios";

export function listSavedScenarios(type?: "fire" | "zinseszins" | "entnahme"): SavedScenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SavedScenario[];
    if (type) return list.filter((s) => s.type === type);
    return list;
  } catch {
    return [];
  }
}

export function saveScenario(type: "fire" | "zinseszins" | "entnahme", name: string, inputs: unknown): SavedScenario {
  const list = listSavedScenarios();
  const newItem: SavedScenario = {
    id: `scen_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    type,
    name: name.trim(),
    inputsJson: JSON.stringify(inputs),
    createdAt: new Date().toISOString(),
  };
  const updated = [newItem, ...list];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newItem;
}

export function deleteScenario(id: string): void {
  const list = listSavedScenarios();
  const updated = list.filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
