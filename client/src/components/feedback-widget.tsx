import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const moods = [
  { value: "loving_it", label: "😊 Loving it" },
  { value: "its_okay", label: "😐 It's okay" },
  { value: "struggling", label: "😕 Struggling" },
] as const;

export function FeedbackWidget() {
  const feedbackEnabled = import.meta.env.VITE_FEEDBACK_ENABLED !== "false";
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<string>("");
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/feedback", { mood, message });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Thanks — your feedback goes directly to the founder.",
        className: "bg-green-50 border-green-200 text-green-800",
      });
      setOpen(false);
      setMood("");
      setMessage("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (!feedbackEnabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white rounded-full shadow-lg hover:bg-[#1e3a5f]/90 transition-colors text-sm font-medium"
        data-testid="button-feedback"
      >
        <MessageCircle className="w-4 h-4" />
        Feedback
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="modal-feedback">
          <DialogHeader>
            <DialogTitle>Share your thoughts</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <Textarea
              placeholder="What's working? What's missing? What's confusing?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              data-testid="input-feedback-message"
            />

            <div className="flex gap-2" data-testid="mood-pills">
              {moods.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(m.value)}
                  className={`flex-1 px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
                    mood === m.value
                      ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                  }`}
                  data-testid={`button-mood-${m.value}`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <Button
              className="w-full bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
              disabled={!message.trim() || !mood || mutation.isPending}
              onClick={() => mutation.mutate()}
              data-testid="button-send-feedback"
            >
              {mutation.isPending ? "Sending..." : "Send"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
