import { useState, useRef, useCallback, useEffect } from "react";
import { PenLine, Mic, Link2, FileText, Loader2, Check, X, ArrowRight, Square, Circle, Upload, Tag, FolderOpen, Plus, ChevronDown, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import type { ExtractedCategory } from "@shared/schema";

type CaptureType = "text" | "voice" | "url" | "document" | null;

interface ClassificationMatch {
  matched: true;
  confidence: number;
  matchedEntity: string;
  matchedCategory: string;
  reason: string;
  suggested_type_change?: string | null;
}

interface ClassificationNewCategory {
  matched: false;
  confidence: number;
  reason: string;
  suggestedCategory: {
    name: string;
    description: string;
  };
  suggestedEntity: {
    name: string;
    type: string;
    topic_type?: string;
  };
}

interface ClassificationUserIntent {
  user_intent: true;
  message: string;
}

type ClassificationResult = ClassificationMatch | ClassificationNewCategory | ClassificationUserIntent;

const topicTypeDisplayNames: Record<string, string> = {
  competitor: "Competitor",
  project: "Project",
  regulation: "Regulation or Policy",
  person: "Person to Watch",
  trend: "Market Trend",
  account: "Account",
  technology: "Technology",
  event: "Event",
  deal: "Deal",
  risk: "Risk",
  general: "General",
};

const captureTypes = [
  { key: "text" as const, icon: PenLine, title: "Text Note", description: "Type or paste text to capture" },
  { key: "voice" as const, icon: Mic, title: "Voice Note", description: "Record audio to transcribe" },
  { key: "url" as const, icon: Link2, title: "URL", description: "Save a link for analysis" },
  { key: "document" as const, icon: FileText, title: "Document", description: "Upload a file to process" },
];

export default function CapturePage() {
  const { toast } = useToast();
  const [activeType, setActiveType] = useState<CaptureType>(null);
  const [textContent, setTextContent] = useState("");
  const [urlContent, setUrlContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcribedText, setTranscribedText] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [pendingContent, setPendingContent] = useState("");
  const [pendingType, setPendingType] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [selectedManualCategory, setSelectedManualCategory] = useState<string>("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: workspaceData } = useQuery<{ exists: boolean; workspace: { categories: ExtractedCategory[] } }>({
    queryKey: ["/api/workspace/current"],
    enabled: showManualPicker,
  });

  const resetState = useCallback(() => {
    setTextContent("");
    setUrlContent("");
    setSelectedFile(null);
    setTranscribedText("");
    setIsTranscribing(false);
    setClassification(null);
    setPendingContent("");
    setPendingType("");
    setRecordingTime(0);
    setShowManualPicker(false);
    setSelectedManualCategory("");
    setIsCreatingCategory(false);
  }, []);

  const handleSelectType = (type: CaptureType) => {
    if (activeType === type) {
      setActiveType(null);
      resetState();
    } else {
      setActiveType(type);
      resetState();
    }
  };

  const handleTypeChangeAccept = async (entityName: string, categoryName: string, newType: string) => {
    try {
      await apiRequest("PATCH", "/api/entity", {
        categoryName,
        entityName,
        topic_type: newType,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace"] });
      toast({ title: "Topic type updated." });
    } catch {
      toast({ title: "Failed to update type", variant: "destructive" });
    }
  };

  const classifyContent = async (content: string, type: string) => {
    setIsClassifying(true);
    setPendingContent(content);
    setPendingType(type);
    setClassification(null);
    setShowManualPicker(false);

    try {
      const res = await apiRequest("POST", "/api/classify", { content, type });
      const data = await res.json();
      if (data.user_intent === true) {
        setClassification(data as ClassificationUserIntent);
      } else if (typeof data.matched === "undefined") {
        const legacyData = data as any;
        setClassification({
          matched: true,
          confidence: 100,
          matchedEntity: legacyData.matchedEntity,
          matchedCategory: legacyData.matchedCategory,
          reason: legacyData.reason,
        });
      } else {
        setClassification(data as ClassificationResult);
        if (data.matched && data.suggested_type_change) {
          const suggestedType = data.suggested_type_change;
          const displayName = topicTypeDisplayNames[suggestedType] || suggestedType;
          toast({
            title: `This looks like a ${displayName}. Want to update the topic type?`,
            action: (
              <ToastAction
                altText="Update topic type"
                onClick={() => handleTypeChangeAccept(data.matchedEntity, data.matchedCategory, suggestedType)}
                data-testid="button-accept-type-change"
              >
                Yes
              </ToastAction>
            ),
          });
        }
      }
    } catch (err: any) {
      toast({
        title: "Classification failed",
        description: err.message || "Could not classify this content.",
        variant: "destructive",
      });
    } finally {
      setIsClassifying(false);
    }
  };

  const handleConfirmCapture = async (entity?: string, category?: string) => {
    if (!pendingContent) return;
    const matchedEntity = entity || (classification?.matched ? classification.matchedEntity : "");
    const matchedCategory = category || (classification?.matched ? classification.matchedCategory : "");
    const reason = classification?.reason || "";

    setIsSaving(true);

    try {
      await apiRequest("POST", "/api/captures", {
        type: pendingType,
        content: pendingContent,
        matchedEntity,
        matchedCategory,
        matchReason: reason,
      });

      toast({
        title: "Captured",
        description: `Saved to ${matchedEntity} in ${matchedCategory}.`,
      });

      resetState();
      setActiveType(null);
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err.message || "Could not save capture.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCategoryAndConfirm = async () => {
    if (!classification || classification.matched) return;
    setIsCreatingCategory(true);

    try {
      await apiRequest("POST", "/api/add-category", {
        categoryName: classification.suggestedCategory.name,
        categoryDescription: classification.suggestedCategory.description,
        entityName: classification.suggestedEntity.name,
        entityType: classification.suggestedEntity.type,
        topicType: classification.suggestedEntity.topic_type || 'general',
      });

      queryClient.invalidateQueries({ queryKey: ["/api/workspace/current"] });

      await handleConfirmCapture(
        classification.suggestedEntity.name,
        classification.suggestedCategory.name
      );

      toast({
        title: "New category created and note filed",
        description: `Created "${classification.suggestedCategory.name}" with topic "${classification.suggestedEntity.name}".`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to create category",
        description: err.message || "Could not create the category.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleManualCategorySelect = async () => {
    if (!selectedManualCategory || !pendingContent) return;

    const categories = workspaceData?.workspace?.categories || [];
    const category = categories.find(c => c.name === selectedManualCategory);

    if (!category?.entities?.length) {
      toast({
        title: "No topics in this category",
        description: "This category has no topics yet. Please choose a category with existing topics or create a new category instead.",
        variant: "destructive",
      });
      return;
    }

    await handleConfirmCapture(category.entities[0].name, selectedManualCategory);
  };

  const handleTextSubmit = () => {
    if (textContent.trim().length < 3) return;
    classifyContent(textContent.trim(), "text");
  };

  const handleUrlSubmit = () => {
    if (!urlContent.trim()) return;
    classifyContent(urlContent.trim(), "url");
  };

  const handleDocumentSubmit = async () => {
    if (!selectedFile) return;

    const text = await selectedFile.text();
    const content = `[File: ${selectedFile.name}]\n${text.slice(0, 5000)}`;
    classifyContent(content, "document");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (timerRef.current) clearInterval(timerRef.current);

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

        setIsTranscribing(true);
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;

          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");

          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText);
          }

          const data = await res.json();
          setTranscribedText(data.transcription);
        } catch (err: any) {
          toast({
            title: "Transcription failed",
            description: err.message || "Could not transcribe audio.",
            variant: "destructive",
          });
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to record voice notes.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleVoiceSubmit = () => {
    if (!transcribedText.trim()) return;
    classifyContent(transcribedText.trim(), "voice");
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

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
            key={type.key}
            className={`cursor-pointer hover-elevate active-elevate-2 transition-colors ${
              activeType === type.key ? "ring-2 ring-[#1e3a5f]" : ""
            }`}
            onClick={() => handleSelectType(type.key)}
            data-testid={`card-capture-${type.key}`}
          >
            <CardContent className="p-6 flex items-start gap-4">
              <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
                activeType === type.key ? "bg-[#1e3a5f] text-white" : "bg-[#1e3a5f]/10"
              }`}>
                <type.icon className={`w-5 h-5 ${activeType === type.key ? "text-white" : "text-[#1e3a5f]"}`} />
              </div>
              <div>
                <h3 className="font-medium text-foreground">{type.title}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{type.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {activeType && !classification && !isClassifying && (
        <div className="mt-6 border border-border rounded-md p-6 space-y-4">
          {activeType === "text" && (
            <>
              <Textarea
                placeholder="Type or paste your text here..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                className="min-h-[140px] text-base resize-none"
                data-testid="input-capture-text"
                autoFocus
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleTextSubmit}
                  disabled={textContent.trim().length < 3}
                  className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                  data-testid="button-submit-text"
                >
                  Submit
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}

          {activeType === "voice" && (
            <>
              {!transcribedText && !isTranscribing && (
                <div className="flex flex-col items-center py-8 space-y-4">
                  {isRecording && (
                    <div className="text-2xl font-mono text-foreground" data-testid="text-recording-time">
                      {formatTime(recordingTime)}
                    </div>
                  )}
                  <Button
                    onClick={isRecording ? stopRecording : startRecording}
                    size="lg"
                    className={isRecording
                      ? "bg-destructive text-destructive-foreground border-destructive"
                      : "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                    }
                    data-testid="button-record"
                  >
                    {isRecording ? (
                      <>
                        <Square className="w-4 h-4 mr-2" />
                        Stop Recording
                      </>
                    ) : (
                      <>
                        <Circle className="w-4 h-4 mr-2 fill-current" />
                        Start Recording
                      </>
                    )}
                  </Button>
                  {isRecording && (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                      <span className="text-sm text-muted-foreground">Recording...</span>
                    </div>
                  )}
                </div>
              )}

              {isTranscribing && (
                <div className="flex flex-col items-center py-8 space-y-3">
                  <Loader2 className="w-6 h-6 text-[#1e3a5f] animate-spin" />
                  <p className="text-sm text-muted-foreground">Transcribing your audio...</p>
                </div>
              )}

              {transcribedText && !isTranscribing && (
                <>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Transcription:</p>
                    <div className="bg-muted/50 rounded-md p-4 text-foreground" data-testid="text-transcription">
                      {transcribedText}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => { setTranscribedText(""); setRecordingTime(0); }}
                      data-testid="button-re-record"
                    >
                      Re-record
                    </Button>
                    <Button
                      onClick={handleVoiceSubmit}
                      className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      data-testid="button-submit-voice"
                    >
                      Submit
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {activeType === "url" && (
            <>
              <Input
                type="url"
                placeholder="https://example.com/article"
                value={urlContent}
                onChange={(e) => setUrlContent(e.target.value)}
                className="h-11"
                data-testid="input-capture-url"
                autoFocus
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleUrlSubmit}
                  disabled={!urlContent.trim()}
                  className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                  data-testid="button-submit-url"
                >
                  Submit
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}

          {activeType === "document" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.csv,.json,.pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                data-testid="input-capture-file"
              />
              <div
                className="border-2 border-dashed border-border rounded-md p-8 text-center cursor-pointer transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="area-file-upload"
              >
                {selectedFile ? (
                  <div className="space-y-2">
                    <FileText className="w-8 h-8 text-[#1e3a5f] mx-auto" />
                    <p className="font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 text-muted-foreground/50 mx-auto" />
                    <p className="text-muted-foreground">Click to select a file</p>
                    <p className="text-xs text-muted-foreground">.txt, .md, .csv, .json, .pdf, .doc, .docx</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleDocumentSubmit}
                  disabled={!selectedFile}
                  className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                  data-testid="button-submit-document"
                >
                  Submit
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {isClassifying && (
        <div className="mt-6 border border-border rounded-md p-8">
          <div className="flex flex-col items-center space-y-3">
            <Loader2 className="w-6 h-6 text-[#1e3a5f] animate-spin" />
            <p className="text-muted-foreground">AI is classifying your capture...</p>
          </div>
        </div>
      )}

      {classification && !isClassifying && 'user_intent' in classification && classification.user_intent && (
        <div className="mt-6 border border-border rounded-md p-6 space-y-5" data-testid="card-user-intent">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Not a capture</p>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 mt-0.5">
                <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground" data-testid="text-user-intent-title">
                  This looks like a request, not intelligence
                </p>
                <p className="text-sm text-muted-foreground" data-testid="text-user-intent-message">
                  {classification.message}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setClassification(null);
                setPendingContent("");
                setPendingType("");
              }}
              data-testid="button-dismiss-intent"
            >
              Got it
            </Button>
          </div>
        </div>
      )}

      {classification && !isClassifying && !('user_intent' in classification) && classification.matched && (
        <div className="mt-6 border border-border rounded-md p-6 space-y-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">AI Classification</p>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-md bg-[#1e3a5f]/10 flex items-center justify-center shrink-0 mt-0.5">
                <FolderOpen className="w-5 h-5 text-[#1e3a5f]" />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    <Tag className="w-3 h-3 mr-1" />
                    {classification.matchedEntity}
                  </Badge>
                  <span className="text-sm text-muted-foreground">in</span>
                  <Badge variant="outline">{classification.matchedCategory}</Badge>
                </div>
                <p className="text-sm text-foreground" data-testid="text-classification-reason">
                  {classification.reason}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setClassification(null);
                setPendingContent("");
                setPendingType("");
              }}
              data-testid="button-cancel-capture"
            >
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button
              onClick={() => handleConfirmCapture()}
              disabled={isSaving}
              className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
              data-testid="button-confirm-capture"
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Confirm
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {classification && !isClassifying && !('user_intent' in classification) && !classification.matched && !showManualPicker && (
        <div className="mt-6 border border-border rounded-md p-6 space-y-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">AI Classification</p>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-md bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
                <Plus className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground" data-testid="text-no-category-match">
                  No existing category fits this note
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">We suggest creating a new category:</span>
                  <Badge className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90" data-testid="badge-suggested-category">
                    {classification.suggestedCategory.name}
                  </Badge>
                </div>
                {classification.suggestedEntity?.name && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">With topic:</span>
                    <Badge variant="secondary" data-testid="badge-suggested-entity">
                      <Tag className="w-3 h-3 mr-1" />
                      {classification.suggestedEntity.name}
                    </Badge>
                  </div>
                )}
                <p className="text-sm italic text-muted-foreground" data-testid="text-classification-reason">
                  {classification.reason}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowManualPicker(true)}
              data-testid="button-choose-different"
            >
              <ChevronDown className="w-4 h-4 mr-1" />
              Choose different category
            </Button>
            <Button
              onClick={handleCreateCategoryAndConfirm}
              disabled={isCreatingCategory || isSaving}
              className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
              data-testid="button-create-category-confirm"
            >
              {isCreatingCategory || isSaving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create category and confirm
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {showManualPicker && (
        <div className="mt-6 border border-border rounded-md p-6 space-y-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Choose a category</p>
            <p className="text-sm text-muted-foreground mb-4">Select an existing category to file this note under.</p>
            <select
              value={selectedManualCategory}
              onChange={(e) => setSelectedManualCategory(e.target.value)}
              className="w-full h-11 px-3 rounded-md border border-border bg-background text-foreground text-sm"
              data-testid="select-manual-category"
            >
              <option value="">Select a category...</option>
              {(workspaceData?.workspace?.categories || []).map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowManualPicker(false)}
              data-testid="button-back-to-suggestion"
            >
              Back
            </Button>
            <Button
              onClick={handleManualCategorySelect}
              disabled={!selectedManualCategory || isSaving}
              className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
              data-testid="button-confirm-manual-category"
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Confirm
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {!activeType && (
        <div className="mt-8 border border-dashed border-border rounded-md p-12 text-center">
          <PenLine className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">
            Select a capture type above to get started.
          </p>
        </div>
      )}
    </div>
  );
}
