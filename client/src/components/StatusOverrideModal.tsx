import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface StatusOverrideModalProps {
  open: boolean;
  onClose: () => void;
  entityName: string;
  dimensionId: string;
  itemName: string;
  statusId: string | null;
  currentStatus: string | null;
}

const STATUS_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "partial", label: "Partial" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown" },
];

const statusColors: Record<string, { bg: string; border: string; text: string }> = {
  yes: { bg: "#f0fdf4", border: "#16a34a", text: "#16a34a" },
  partial: { bg: "#fffbeb", border: "#d97706", text: "#d97706" },
  no: { bg: "#fef2f2", border: "#dc2626", text: "#dc2626" },
  unknown: { bg: "#f9fafb", border: "#9ca3af", text: "#6b7280" },
};

export function StatusOverrideModal({
  open,
  onClose,
  entityName,
  dimensionId,
  itemName,
  statusId,
  currentStatus,
}: StatusOverrideModalProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string>(currentStatus ?? "unknown");

  const mutation = useMutation({
    mutationFn: async (status: string) => {
      const id = statusId ?? "new";
      const body: Record<string, string> = { status };
      if (id === "new") {
        body.dimension_id = dimensionId;
        body.entity_name = entityName;
        body.item_name = itemName;
      }
      const res = await apiRequest("PUT", `/api/competitor-dimension-status/${id}`, body);
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitor-dimensions", entityName] });
      toast({ title: "Status saved", description: `${itemName} updated to "${selected}"` });
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save status", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent style={{ maxWidth: 400 }}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: 15, fontWeight: 600 }}>Override status</DialogTitle>
        </DialogHeader>
        <div style={{ padding: "4px 0 8px" }}>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
            Set status for <strong>{itemName}</strong> ({entityName})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {STATUS_OPTIONS.map((opt) => {
              const colors = statusColors[opt.value];
              const isSelected = selected === opt.value;
              return (
                <button
                  key={opt.value}
                  data-testid={`status-option-${opt.value}`}
                  onClick={() => setSelected(opt.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 14px",
                    borderRadius: 8,
                    border: isSelected ? `2px solid ${colors.border}` : "1.5px solid #e5e7eb",
                    background: isSelected ? colors.bg : "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.12s",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: colors.border,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? colors.text : "#374151" }}>
                    {opt.label}
                  </span>
                  {isSelected && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: colors.text, fontWeight: 600 }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            data-testid="button-cancel-override"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate(selected)}
            disabled={mutation.isPending}
            data-testid="button-save-override"
            style={{ background: "#7c3aed", color: "#fff" }}
          >
            {mutation.isPending ? "Saving…" : "Save override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
