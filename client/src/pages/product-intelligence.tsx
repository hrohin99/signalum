import { ProductSection } from "@/components/ProductSection";
import { DimensionEditor } from "@/components/DimensionEditor";
import { IntelligencePriorities } from "@/components/IntelligencePriorities";

export default function ProductIntelligencePage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-gray-900">My Product</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure your product context, competitive dimensions, and intelligence priorities.
        </p>
      </div>
      <div className="space-y-6">
        <ProductSection />
        <DimensionEditor />
        <IntelligencePriorities />
      </div>
    </div>
  );
}
