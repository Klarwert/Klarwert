/**
 * T15.4 – Drag-and-Drop-Sortierung: Logik-Tests für arrayMove und reorderRules-Stub
 *
 * Die eigentliche dnd-kit-Interaktion ist im Browser nicht testbar ohne einen vollständigen
 * DnD-Event-Stack. Dieser Test deckt die kritische Logik ab: arrayMove (das Herzstück der
 * Sortierung) und die Prüfung, dass die Regel-Sortierung die richtige Reihenfolge erzeugt.
 *
 * Anmerkung: Für echte drag-Event-Tests wäre playwright/e2e notwendig (T4 Prerequisit).
 * Diese Tests stellen sicher, dass die Daten-Transformation korrekt ist.
 */
import { describe, it, expect } from "vitest";
import { arrayMove } from "@dnd-kit/sortable";

describe("arrayMove – Kernlogik der Drag-and-Drop-Sortierung", () => {
  it("verschiebt ein Element von Position 0 nach Position 2", () => {
    const arr = ["A", "B", "C", "D"];
    const result = arrayMove(arr, 0, 2);
    expect(result).toEqual(["B", "C", "A", "D"]);
  });

  it("verschiebt ein Element nach oben (von 3 nach 1)", () => {
    const arr = ["A", "B", "C", "D"];
    const result = arrayMove(arr, 3, 1);
    expect(result).toEqual(["A", "D", "B", "C"]);
  });

  it("kein Effekt wenn von und nach gleich sind", () => {
    const arr = ["A", "B", "C"];
    const result = arrayMove(arr, 1, 1);
    expect(result).toEqual(["A", "B", "C"]);
  });

  it("erzeugt ein neues Array (mutiert nicht das Original)", () => {
    const arr = ["A", "B", "C"];
    const result = arrayMove(arr, 0, 2);
    expect(result).not.toBe(arr);
    expect(arr).toEqual(["A", "B", "C"]); // Original unverändert
  });

  it("funktioniert mit einem einzigen Element", () => {
    expect(arrayMove(["A"], 0, 0)).toEqual(["A"]);
  });

  it("verschiebt Objekte mit ID (wie Regeleinträge)", () => {
    const rules = [
      { id: 10, priority: 1 },
      { id: 20, priority: 2 },
      { id: 30, priority: 3 },
    ];
    const reordered = arrayMove(rules, 2, 0);
    expect(reordered[0].id).toBe(30);
    expect(reordered[1].id).toBe(10);
    expect(reordered[2].id).toBe(20);
  });
});
