import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const inputStyle: React.CSSProperties = {
  border: "0.5px solid #d1d5db",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "13px",
  width: "100%",
  outline: "none",
  fontFamily: "inherit",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: "72px",
};

interface ProductSectionProps {
  onDirty?: () => void;
}

export function ProductSection({ onDirty }: ProductSectionProps) {
  const { toast } = useToast();
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");

  const { data, isLoading } = useQuery<{ productContext: any }>({
    queryKey: ["/api/product-context"],
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (data?.productContext) {
      const ctx = data.productContext;
      setProductName(ctx.productName || "");
      setDescription(ctx.description || "");
      setTargetCustomer(ctx.targetCustomer || "");
      setStrengths(ctx.strengths || "");
      setWeaknesses(ctx.weaknesses || "");
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/product-context", {
        productName,
        description,
        targetCustomer,
        strengths,
        weaknesses,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-context"] });
      toast({ title: "Product context saved", className: "bg-green-50 border-green-200 text-green-800" });
    },
    onError: (error: Error) => {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    },
  });

  const handleChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setter(e.target.value);
    onDirty?.();
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-gray-400 p-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: "12px" }}>
      <div className="p-6">
        <h3 className="text-base font-semibold mb-1">Your Product</h3>
        <p className="text-sm text-gray-500 mb-5">Describe your product so Signalum can tailor AI suggestions to your competitive context.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Product name</label>
            <input
              style={inputStyle}
              value={productName}
              onChange={handleChange(setProductName)}
              placeholder="e.g. Entrust Identity Suite"
              data-testid="input-product-name-pi"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              style={textareaStyle}
              value={description}
              onChange={handleChange(setDescription)}
              placeholder="Describe your product in plain English"
              data-testid="input-product-description-pi"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Target audience</label>
            <input
              style={inputStyle}
              value={targetCustomer}
              onChange={handleChange(setTargetCustomer)}
              placeholder="e.g. Enterprise banks, government agencies"
              data-testid="input-product-audience-pi"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Key differentiators / strengths</label>
            <textarea
              style={textareaStyle}
              value={strengths}
              onChange={handleChange(setStrengths)}
              placeholder="What does your product do better than anyone else?"
              data-testid="input-product-strengths-pi"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Known weaknesses</label>
            <textarea
              style={textareaStyle}
              value={weaknesses}
              onChange={handleChange(setWeaknesses)}
              placeholder="Where do competitors have an edge?"
              data-testid="input-product-weaknesses-pi"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !productName.trim()}
            style={{ backgroundColor: "#534AB7", color: "#fff" }}
            data-testid="button-save-product-pi"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save product
          </Button>
        </div>
      </div>
    </div>
  );
}
