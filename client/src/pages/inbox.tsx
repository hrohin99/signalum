import { Inbox as InboxIcon } from "lucide-react";

export default function InboxPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">Inbox</h1>
        <p className="text-muted-foreground mt-1">
          Items awaiting your review and categorization.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <InboxIcon className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-foreground mb-1">No items in your inbox</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Captured items that need your attention will appear here. Start by capturing something new.
        </p>
      </div>
    </div>
  );
}
