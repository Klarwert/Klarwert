import { Sidebar } from "@/components/Sidebar";
import { Globalbar } from "@/components/Globalbar";
import { useNavigationStore } from "@/stores/navigationStore";
import { VermoegenPage } from "@/features/vermoegen/VermoegenPage";
import { TransaktionenPage } from "@/features/transaktionen/TransaktionenPage";
import { KategorienPage } from "@/features/kategorien/KategorienPage";
import { VertraegePage } from "@/features/vertraege/VertraegePage";
import { SammlungenPage } from "@/features/sammlungen/SammlungenPage";
import { UebersichtPage } from "@/features/uebersicht/UebersichtPage";
import { BudgetsPage } from "@/features/budgets/BudgetsPage";
import { SteuerPage } from "@/features/steuer/SteuerPage";
import { RechnerPage } from "@/features/rechner/RechnerPage";
import { ProfilPage } from "@/features/profil/ProfilPage";

export function AppShell() {
  const currentPage = useNavigationStore((s) => s.currentPage);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-paper">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Globalbar />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          {currentPage === "vermoegen" && <VermoegenPage />}
          {currentPage === "transaktionen" && <TransaktionenPage />}
          {currentPage === "uebersicht" && <UebersichtPage />}
          {currentPage === "kategorien" && <KategorienPage />}
          {currentPage === "vertraege" && <VertraegePage />}
          {currentPage === "sammlungen" && <SammlungenPage />}
          {currentPage === "budgets" && <BudgetsPage />}
          {currentPage === "steuer" && <SteuerPage />}
          {currentPage === "rechner" && <RechnerPage />}
          {currentPage === "profil" && <ProfilPage />}
        </main>
      </div>
    </div>
  );
}
