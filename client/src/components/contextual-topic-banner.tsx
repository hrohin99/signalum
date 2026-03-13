import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { ProductContext } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface ContextualTopicBannerProps {
  entityId: string;
  entityName: string;
  topicType: string;
  categoryName: string;
  onOpenDateModal?: () => void;
}

function getBannerContent(
  topicType: string,
  hasProductContext: boolean,
): { message: string; actionType: "settings" | "battlecard" | "date" | "none" } {
  switch (topicType) {
    case "competitor":
      if (!hasProductContext) {
        return {
          message: "Signalum can generate a battlecard for this competitor. Add your product details in Settings to unlock personalised competitive intelligence.",
          actionType: "settings",
        };
      }
      return {
        message: "Intelligence is building for this competitor. Keep adding updates to sharpen the picture.",
        actionType: "none",
      };
    case "regulation":
    case "risk":
      return {
        message: "Add the key compliance dates for this topic so Signalum can surface them in your daily brief before they become a deadline crisis.",
        actionType: "date",
      };
    case "trend":
    case "technology":
      return {
        message: "As intelligence builds up here, Signalum will identify patterns and signals across everything you capture. Keep adding updates to sharpen the picture.",
        actionType: "none",
      };
    case "person":
      return {
        message: "Track what this person says and does publicly. Drop in articles, quotes, announcements, or meeting notes and Signalum builds a profile over time.",
        actionType: "none",
      };
    case "project":
    case "event":
      return {
        message: "Add key dates, notes, and updates to keep this topic current. Signalum will surface anything time-sensitive in your daily brief.",
        actionType: "none",
      };
    default:
      return {
        message: "Drop in anything relevant to this topic — articles, notes, links, documents. Signalum connects the dots and keeps you briefed.",
        actionType: "none",
      };
  }
}

export function ContextualTopicBanner({ entityId, entityName, topicType, categoryName, onOpenDateModal }: ContextualTopicBannerProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const storageKey = `onboarding_topic_banner_${entityId}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === "true");

  const { data: prodCtxData } = useQuery<{ productContext: ProductContext | null }>({
    queryKey: ["/api/product-context"],
  });

  const autofillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/battlecard/${encodeURIComponent(entityId)}/autofill`, {
        entityName,
        categoryName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/battlecard", entityId], data);
      toast({ title: "Battlecard generated with AI." });
      handleDismiss();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to generate battlecard", description: err.message, variant: "destructive" });
    },
  });

  if (dismissed) return null;

  const hasProductContext = !!(prodCtxData?.productContext?.productName);
  const { message, actionType } = getBannerContent(topicType, hasProductContext);

  const handleDismiss = () => {
    localStorage.setItem(storageKey, "true");
    setDismissed(true);
  };

  return (
    <div className="bg-[#1e3a5f]/[0.04] border border-[#1e3a5f]/15 rounded-lg p-4 flex items-start gap-3" data-testid="contextual-topic-banner">
      <div className="flex-1">
        <p className="text-sm text-foreground leading-relaxed">
          {message}
          {actionType === "settings" && (
            <>
              {" "}
              <button
                className="text-[#1e3a5f] font-medium underline hover:text-[#1e3a5f]/80"
                onClick={() => navigate("/settings")}
                data-testid="link-banner-settings"
              >
                Go to Settings
              </button>
            </>
          )}
        </p>
        {actionType === "battlecard" && (
          <Button
            className="mt-2 bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white text-sm"
            size="sm"
            onClick={() => autofillMutation.mutate()}
            disabled={autofillMutation.isPending}
            data-testid="button-banner-generate-battlecard"
          >
            {autofillMutation.isPending ? "Generating..." : "Generate Battlecard"}
          </Button>
        )}
        {actionType === "date" && onOpenDateModal && (
          <Button
            className="mt-2 bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white text-sm"
            size="sm"
            onClick={() => { onOpenDateModal(); handleDismiss(); }}
            data-testid="button-banner-add-date"
          >
            Go to Dates
          </Button>
        )}
      </div>
      <button
        className="text-slate-400 hover:text-slate-600 shrink-0 mt-0.5"
        onClick={handleDismiss}
        data-testid="button-dismiss-banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
