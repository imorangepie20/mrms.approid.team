import { TidalSearch } from "@/components/search/tidal-search";

export default function SearchPage() {
  return (
    <main className="dashboard-page">
      <header className="space-title">
        Search <small>CATALOG</small>
      </header>
      <TidalSearch />
    </main>
  );
}
