import { describe, it, expect } from "vitest";
import { computeMerchantReleaseDiff } from "./merchantReleaseDiff";
import type { Merchant, Category } from "@/db/types";
import type { MerchantDataRelease } from "@/db/repositories/merchants";

describe("computeMerchantReleaseDiff", () => {
  const mockCategories: Category[] = [
    {
      id: 1,
      name: "Lebensmittel",
      color: "#000",
      icon: "food",
      template_key: "lebenshaltung.lebensmittel",
      parent_id: null,
      is_deleted: 0,
      direction: "ausgabe",
      is_template: 0,
      is_system: 0,
      is_hidden: 0,
      sort_order: 1,
    },
  ];

  it("findet neue Händler", () => {
    const currentMerchants: Merchant[] = [];
    const release: MerchantDataRelease = {
      schema_version: 1,
      source_version: "test-1",
      merchants: [
        {
          canonical_name: "new_merchant",
          display_name: "Neuer Händler",
          default_category_template_key: null,
          status: "active",
          aliases: [],
        },
      ],
    };

    const diff = computeMerchantReleaseDiff(currentMerchants, mockCategories, release);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toEqual({
      canonical_name: "new_merchant",
      display_name: "Neuer Händler",
      status: "new",
      localModified: false,
    });
  });

  it("findet geänderte Händler (Name oder Kategorie geändert)", () => {
    const currentMerchants: Merchant[] = [
      {
        id: 1,
        canonical_name: "existing",
        display_name: "Alt",
        default_category_id: null,
        is_active: 1,
        is_builtin: 1,
        is_modified: 0,
        source: "community",
        source_version: "v1",
        country: "",
      },
    ];
    const release: MerchantDataRelease = {
      schema_version: 1,
      source_version: "test-2",
      merchants: [
        {
          canonical_name: "existing",
          display_name: "Neu",
          default_category_template_key: "lebenshaltung.lebensmittel",
          status: "active",
          aliases: [],
        },
      ],
    };

    const diff = computeMerchantReleaseDiff(currentMerchants, mockCategories, release);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toEqual({
      canonical_name: "existing",
      display_name: "Neu",
      status: "changed",
      localModified: false,
    });
  });

  it("erkennt lokale Modifikationen", () => {
    const currentMerchants: Merchant[] = [
      {
        id: 1,
        canonical_name: "existing",
        display_name: "Alt",
        default_category_id: null,
        is_active: 1,
        is_builtin: 1,
        is_modified: 1, // !
        source: "community",
        source_version: "v1",
        country: "",
      },
    ];
    const release: MerchantDataRelease = {
      schema_version: 1,
      source_version: "test-3",
      merchants: [
        {
          canonical_name: "existing",
          display_name: "Neu",
          default_category_template_key: null,
          status: "active",
          aliases: [],
        },
      ],
    };

    const diff = computeMerchantReleaseDiff(currentMerchants, mockCategories, release);
    expect(diff[0].localModified).toBe(true);
  });

  it("ignoriert identische Händler", () => {
    const currentMerchants: Merchant[] = [
      {
        id: 1,
        canonical_name: "existing",
        display_name: "Gleich",
        default_category_id: 1,
        is_active: 1,
        is_builtin: 1,
        is_modified: 0,
        source: "community",
        source_version: "v1",
        country: "",
      },
    ];
    const release: MerchantDataRelease = {
      schema_version: 1,
      source_version: "test-4",
      merchants: [
        {
          canonical_name: "existing",
          display_name: "Gleich",
          default_category_template_key: "lebenshaltung.lebensmittel",
          status: "active",
          aliases: [],
        },
      ],
    };

    const diff = computeMerchantReleaseDiff(currentMerchants, mockCategories, release);
    expect(diff).toHaveLength(0);
  });

  it("markiert zurückgezogene Händler, wenn sie lokal noch aktiv sind", () => {
    const currentMerchants: Merchant[] = [
      {
        id: 1,
        canonical_name: "deprecated_merchant",
        display_name: "Alt",
        default_category_id: null,
        is_active: 1,
        is_builtin: 1,
        is_modified: 0,
        source: "community",
        source_version: "v1",
        country: "",
      },
    ];
    const release: MerchantDataRelease = {
      schema_version: 1,
      source_version: "test-5",
      merchants: [
        {
          canonical_name: "deprecated_merchant",
          display_name: "Alt",
          default_category_template_key: null,
          status: "deprecated",
          aliases: [],
        },
      ],
    };

    const diff = computeMerchantReleaseDiff(currentMerchants, mockCategories, release);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toEqual({
      canonical_name: "deprecated_merchant",
      display_name: "Alt",
      status: "deprecated",
      localModified: false,
    });
  });
});
