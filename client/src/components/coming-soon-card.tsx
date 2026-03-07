import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FeatureInterest } from "@shared/schema";

interface ComingSoonCardProps {
  featureName: "ai_visibility" | "email_capture" | "search";
  title: string;
  description: string;
  icon: React.ReactNode;
}

export function ComingSoonCard({ featureName, title, description, icon }: ComingSoonCardProps) {
  const [justClicked, setJustClicked] = useState(false);

  const { data: interestsData } = useQuery<{ interests: FeatureInterest[] }>({
    queryKey: ["/api/feature-interest"],
  });

  const alreadyInterested = interestsData?.interests?.some(i => i.featureName === featureName) || false;
  const isInterested = alreadyInterested || justClicked;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/feature-interest", { featureName });
      return res.json();
    },
    onSuccess: () => {
      setJustClicked(true);
      queryClient.invalidateQueries({ queryKey: ["/api/feature-interest"] });
    },
  });

  return (
    <Card data-testid={`card-coming-soon-${featureName}`}>
      <CardContent className="p-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-foreground">{title}</h3>
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 text-xs" data-testid={`badge-coming-soon-${featureName}`}>
                Coming Soon
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button
          className={isInterested
            ? "w-full bg-green-600 hover:bg-green-600 text-white cursor-default"
            : "w-full bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
          }
          disabled={isInterested || mutation.isPending}
          onClick={() => mutation.mutate()}
          data-testid={`button-interest-${featureName}`}
        >
          {mutation.isPending ? "Saving..." : isInterested ? "✓ Interest noted" : "I'm Interested"}
        </Button>
      </CardContent>
    </Card>
  );
}
