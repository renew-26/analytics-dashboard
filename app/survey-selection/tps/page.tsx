import { SurveySelectionCatalog } from "@/app/components/tps/SurveySelectionCatalog";

// 크론(revalidatePath)이 실제 무효화를 담당하고,
// 이 값은 크론이 실패해도 캐시가 영구히 얼지 않게 하는 안전망이다.
export const revalidate = 86400;

export default function TpsSurveySelectionPage() {
  return (
    <div className="px-12 py-6 mx-auto">
      <SurveySelectionCatalog category="tps" />
    </div>
  );
}
