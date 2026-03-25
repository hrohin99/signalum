import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const textareaStyle: React.CSSProperties = {
  border: "0.5px solid #d1d5db",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "13px",
  width: "100%",
  outline: "none",
  fontFamily: "inherit",
  resize: "vertical",
  minHeight: "72px",
};

interface IntelligencePrioritiesProps {
  onDirty?: () => void;
}

export function IntelligencePriorities({ onDirty }: IntelligencePrioritiesProps) {
  const { toast } = useToast();
  const [winFactors, setWinFactors] = useState("");
  const [vulnerability, setVulnerability] = useState("");
  const [earlyWarningSignal, setEarlyWarningSignal] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/workspace/profile"],
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (data) {
      setWinFactors(data.win_factors || "");
      setVulnerability(data.vulnerability || "");
      setEarlyWarningSignal(data.early_warning_signal || "");
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/workspace/profile", {
        winFactors,
        vulnerability,
        earlyWarningSignal,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/profile"] });
      toast({ title: "Intelligence priorities saved", className: "bg-green-50 border-green-200 text-green-800" });
    },
    onError: (error: Error) => {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    },
  });

  const handleChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setter(e.target.value);
    onDirty?.();
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-gray-400 p-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: "12px" }}>
      <div className="p-6">
        <h3 className="text-base font-semibold mb-1">Intelligence Priorities</h3>
        <p className="text-sm text-gray-500 mb-5">Tell Signalum what matters most for your competitive intelligence.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Win factors</label>
            <textarea
              style={textareaStyle}
              value={winFactors}
              onChange={handleChange(setWinFactors)}
              placeholder="What factors typically drive wins against competitors?"
              data-testid="input-win-factors-pi"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vulnerability</label>
            <textarea
              style={textareaStyle}
              value={vulnerability}
              onChange={handleChange(setVulnerability)}
              placeholder="Where are you most vulnerable to competitive threats?"
              data-testid="input-vulnerability-pi"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Early warning signals</label>
            <textarea
              style={textareaStyle}
              value={earlyWarningSignal}
              onChange={handleChange(setEarlyWarningSignal)}
              placeholder="What signals should Signalum watch for?"
              data-testid="input-early-warning-pi"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            style={{ backgroundColor: "#534AB7", color: "#fff" }}
            data-testid="button-save-intelligence-pi"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save priorities
          </Button>
        </div>
      </div>
    </div>
  );
}
