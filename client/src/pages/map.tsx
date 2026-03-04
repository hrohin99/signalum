import { Network } from "lucide-react";

export default function MapPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">Intelligence Map</h1>
        <p className="text-muted-foreground mt-1">
          Visualize connections between your tracked entities.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Network className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-foreground mb-1">Your intelligence map is being built</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          As you capture more information, your intelligence map will reveal relationships and patterns across your tracked entities.
        </p>
      </div>
    </div>
  );
}
