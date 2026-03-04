import { PenLine, Mic, Link2, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const captureTypes = [
  {
    icon: PenLine,
    title: "Text Note",
    description: "Type or paste text to capture",
  },
  {
    icon: Mic,
    title: "Voice Note",
    description: "Record audio to transcribe",
  },
  {
    icon: Link2,
    title: "URL",
    description: "Save a link for analysis",
  },
  {
    icon: FileText,
    title: "Document",
    description: "Upload a file to process",
  },
];

export default function CapturePage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">Capture</h1>
        <p className="text-muted-foreground mt-1">
          Capture anything — our AI will route it to the right place in your workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {captureTypes.map((type) => (
          <Card
            key={type.title}
            className="cursor-pointer hover-elevate active-elevate-2 transition-colors"
            data-testid={`card-capture-${type.title.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <CardContent className="p-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-md bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
                <type.icon className="w-5 h-5 text-[#1e3a5f]" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">{type.title}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{type.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 border border-dashed border-border rounded-md p-12 text-center">
        <PenLine className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-muted-foreground">
          Select a capture type above or drag and drop files here.
        </p>
      </div>
    </div>
  );
}
