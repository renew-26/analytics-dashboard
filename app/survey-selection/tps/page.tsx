import { SurveySelectionCatalog } from "@/app/components/tps/SurveySelectionCatalog";

export const dynamic = "force-dynamic";

export default function TpsSurveySelectionPage() {
  return (
    <div className="px-12 py-6 mx-auto">
      <SurveySelectionCatalog category="tps" />
    </div>
  );
}
