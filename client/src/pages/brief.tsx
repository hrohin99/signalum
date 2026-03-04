import { Newspaper } from "lucide-react";

export default function BriefPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">Daily Brief</h1>
        <p className="text-muted-foreground mt-1">
          Your AI-generated morning intelligence summary.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Newspaper className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-foreground mb-1">No briefs yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your daily intelligence brief will be generated every morning at 7 AM based on your tracked categories and captured data.
        </p>
      </div>
    </div>
  );
}
