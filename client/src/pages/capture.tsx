import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { PenLine, Mic, Link2, FileText, Loader2, Check, X, ArrowRight, Square, Circle, Upload, Tag, FolderOpen, Plus, ChevronDown, Calendar, Pencil, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
  entity_name: string;
  topic_type: string;
  description: string;
}

interface MultiMatchItem {
  entity_id: string | null;
  category: string | null;
  relevant_excerpt: string;
  confidence: number;
  reasoning: string;
  suggested_entity_name: string | null;
  suggested_category: { name: string; description: string } | null;
  suggested_topic_type: string | null;
}

interface ClassificationMultiMatch {
  multi_match: true;
  matches: MultiMatchItem[];
}

type ClassificationResult = ClassificationMatch | ClassificationNewCategory | ClassificationUserIntent | ClassificationMultiMatch;

interface ExtractedDate {
  date: string;
  label: string;
  date_type: "hard_deadline" | "soft_deadline" | "watch_date";
}

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
  const [, navigate] = useLocation();
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
  const [newCatName, setNewCatName] = useState("");
  const [newCatFocus, setNewCatFocus] = useState("");

  const [intentTopicName, setIntentTopicName] = useState("");
  const [intentCategory, setIntentCategory] = useState("");
  const [intentNewCategoryName, setIntentNewCategoryName] = useState("");
  const [intentNewCategoryFocus, setIntentNewCategoryFocus] = useState("");
  const [intentTopicType, setIntentTopicType] = useState("general");
  const [isCreatingIntentTopic, setIsCreatingIntentTopic] = useState(false);

  const [extractionInfo, setExtractionInfo] = useState<{ filename: string; characterCount: number } | null>(null);

  const [multiMatchSkipped, setMultiMatchSkipped] = useState<Set<number>>(new Set());
  const [multiMatchConfirmed, setMultiMatchConfirmed] = useState<Set<number>>(new Set());
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [savingCards, setSavingCards] = useState<Set<number>>(new Set());
  const [multiMatchCategoryOverrides, setMultiMatchCategoryOverrides] = useState<Record<number, string>>({});
  const [multiMatchSaveMode, setMultiMatchSaveMode] = useState<Record<number, 'excerpt' | 'full'>>({});
  const [changingCategoryIndex, setChangingCategoryIndex] = useState<number | null>(null);

  const [showPostCreateDateModal, setShowPostCreateDateModal] = useState(false);
  const [postCreateEntityName, setPostCreateEntityName] = useState("");
  const [postCreateTopicType, setPostCreateTopicType] = useState("");
  const [postDateLabel, setPostDateLabel] = useState("");
  const [postDateValue, setPostDateValue] = useState("");
  const [postDateType, setPostDateType] = useState<string>("hard_deadline");
  const [postDateNotes, setPostDateNotes] = useState("");
  const [isAddingDate, setIsAddingDate] = useState(false);

  const [extractedDates, setExtractedDates] = useState<ExtractedDate[]>([]);
  const [trackedDateIndices, setTrackedDateIndices] = useState<Set<number>>(new Set());
  const [dismissedDateIndices, setDismissedDateIndices] = useState<Set<number>>(new Set());
  const [trackingDateIndex, setTrackingDateIndex] = useState<number | null>(null);

  const [capabilityPrompt, setCapabilityPrompt] = useState<{ capabilityName: string; capabilityId: string; entityName: string } | null>(null);

  const [pricingPrompt, setPricingPrompt] = useState<{ entityName: string; content: string } | null>(null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [pricingFormDate, setPricingFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [pricingFormPlan, setPricingFormPlan] = useState("");
  const [pricingFormPrice, setPricingFormPrice] = useState("");
  const [pricingFormInclusions, setPricingFormInclusions] = useState("");
  const [pricingFormSource, setPricingFormSource] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasIntentClassification = classification !== null && 'user_intent' in classification && classification.user_intent;
  const hasMultiMatch = classification !== null && 'multi_match' in classification && classification.multi_match;
  const hasClassification = classification !== null;
  const { data: workspaceData } = useQuery<{ exists: boolean; workspace: { categories: ExtractedCategory[] } }>({
    queryKey: ["/api/workspace/current"],
    enabled: showManualPicker || hasIntentClassification || hasMultiMatch || hasClassification,
  });

  const { data: recentCapturesData } = useQuery<any[]>({
    queryKey: ["/api/captures"],
  });
  const recentCaptures = useMemo(() => {
    if (!Array.isArray(recentCapturesData)) return [];
    return [...recentCapturesData]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [recentCapturesData]);

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
    setExtractionInfo(null);
    setMultiMatchSkipped(new Set());
    setMultiMatchConfirmed(new Set());
    setIsConfirmingAll(false);
    setSavingCards(new Set());
    setMultiMatchCategoryOverrides({});
    setMultiMatchSaveMode({});
    setChangingCategoryIndex(null);
    setExtractedDates([]);
    setTrackedDateIndices(new Set());
    setDismissedDateIndices(new Set());
    setTrackingDateIndex(null);
    setCapabilityPrompt(null);
  }, []);

  const getResolvedCategoryForMatch = useCallback((match: MultiMatchItem, index: number): string | null => {
    if (multiMatchCategoryOverrides[index]) return multiMatchCategoryOverrides[index];
    if (match.suggested_category?.name) return match.suggested_category.name;
    if (match.category) return match.category;
    const categories = workspaceData?.workspace?.categories || [];
    const competitorCategory = categories.find(c => c.name.toLowerCase() === "competitor landscape");
    if (competitorCategory) return competitorCategory.name;
    if (categories.length > 0) return categories[0].name;
    return null;
  }, [multiMatchCategoryOverrides, workspaceData]);

  const datePromptTypeLabel = (type: string) => {
    if (type === "regulation") return "regulation";
    if (type === "risk") return "risk";
    if (type === "event") return "event";
    return "topic";
  };

  const closePostCreateDateModal = () => {
    setShowPostCreateDateModal(false);
    setPostCreateEntityName("");
    setPostCreateTopicType("");
    setPostDateLabel("");
    setPostDateValue("");
    setPostDateType("hard_deadline");
    setPostDateNotes("");
  };

  const handlePostCreateAddDate = async () => {
    if (!postDateLabel.trim() || !postDateValue || !postCreateEntityName) return;
    setIsAddingDate(true);
    try {
      const payload: { label: string; date: string; dateType: string; notes?: string } = {
        label: postDateLabel.trim(),
        date: postDateValue,
        dateType: postDateType,
      };
      if (postDateNotes.trim()) payload.notes = postDateNotes.trim();
      await apiRequest("POST", `/api/topics/${encodeURIComponent(postCreateEntityName)}/dates`, payload);
      queryClient.invalidateQueries({ queryKey: ["/api/topics", postCreateEntityName, "dates"] });
      toast({ title: "Date added", description: `Key date added to ${postCreateEntityName}.` });
      closePostCreateDateModal();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not add date.", variant: "destructive" });
    } finally {
      setIsAddingDate(false);
    }
  };

  const getRoutedEntityName = (): string | null => {
    if (!classification) return null;
    if ('user_intent' in classification && classification.user_intent) return classification.entity_name || null;
    if ('multi_match' in classification && classification.multi_match) {
      const confirmed = classification.matches.find((_, i) => multiMatchConfirmed.has(i));
      return confirmed?.entity_id || confirmed?.suggested_entity_name || null;
    }
    if ('matched' in classification && classification.matched) return classification.matchedEntity;
    return null;
  };

  const handleTrackDate = async (dateItem: ExtractedDate, index: number) => {
    const entityName = getRoutedEntityName();
    if (!entityName) {
      toast({ title: "No topic selected", description: "Confirm a topic first before tracking dates.", variant: "destructive" });
      return;
    }
    setTrackingDateIndex(index);
    try {
      await apiRequest("POST", `/api/topics/${encodeURIComponent(entityName)}/dates`, {
        label: dateItem.label,
        date: dateItem.date,
        dateType: dateItem.date_type,
        source: "ai_extracted",
      });
      setTrackedDateIndices(prev => new Set(prev).add(index));
      queryClient.invalidateQueries({ queryKey: ["/api/topics", entityName, "dates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-dates/all"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not track date.", variant: "destructive" });
    } finally {
      setTrackingDateIndex(null);
    }
  };

  const handleDismissDate = (index: number) => {
    setDismissedDateIndices(prev => new Set(prev).add(index));
  };

  const handleSelectType = (type: CaptureType) => {
    if (activeType === type) {
      setActiveType(null);
      resetState();
    } else {
      resetState();
      setActiveType(type);
    }
  };

  const handleComposerSubmit = () => {
    if (activeType === "text" || activeType === null) {
      if (textContent.trim().length < 3) return;
      classifyContent(textContent.trim(), "text");
    } else if (activeType === "url") {
      if (!urlContent.trim()) return;
      const content = urlContent.trim();
      setUrlContent(content);
      classifyContent(content, "url");
    } else if (activeType === "document") {
      handleDocumentSubmit();
    } else if (activeType === "voice") {
      handleVoiceSubmit();
    }
  };

  const isComposerSubmitDisabled = () => {
    if (isClassifying) return true;
    if (activeType === "voice") return !transcribedText.trim();
    if (activeType === "document") return !selectedFile;
    if (activeType === "url") return !urlContent.trim();
    return textContent.trim().length < 3;
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
      setExtractedDates(Array.isArray(data.extracted_dates) ? data.extracted_dates : []);
      setTrackedDateIndices(new Set());
      setDismissedDateIndices(new Set());
      if (data.user_intent === true) {
        setClassification(data as ClassificationUserIntent);
        setIntentTopicName(data.entity_name || "");
        setIntentTopicType(data.topic_type || "general");
        setIntentCategory("");
        setIntentNewCategoryName("");
        setIntentNewCategoryFocus("");
      } else if (data.multi_match === true) {
        setClassification(data as ClassificationMultiMatch);
        setMultiMatchSkipped(new Set());
        setMultiMatchConfirmed(new Set());
        setMultiMatchSaveMode({});
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
        if (!data.matched && data.suggestedCategory) {
          setNewCatName(data.suggestedCategory.name || "");
          setNewCatFocus("");
        }
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

  const checkCapabilityMention = async (content: string, entityName: string) => {
    try {
      const res = await apiRequest("POST", "/api/capabilities/detect", { content });
      const data = await res.json();
      if (data.matches && data.matches.length > 0) {
        const firstMatch = data.matches[0];
        setCapabilityPrompt({ capabilityName: firstMatch.name, capabilityId: firstMatch.id, entityName });
      }
    } catch (err) {
    }
  };

  const handleCapabilityStatusSelect = async (status: string) => {
    if (!capabilityPrompt) return;
    try {
      await apiRequest("PUT", `/api/competitor-capabilities/${encodeURIComponent(capabilityPrompt.entityName)}`, {
        capabilityId: capabilityPrompt.capabilityId,
        status,
      });
      toast({
        title: "Capability updated",
        description: `${capabilityPrompt.capabilityName} set to ${status} for ${capabilityPrompt.entityName}.`,
        className: "bg-green-50 border-green-200 text-green-800",
      });
    } catch (err) {
    }
    setCapabilityPrompt(null);
  };

  const PRICING_KEYWORDS = /\b(price|pricing|plan|tier|cost|per month|per year|enterprise|free trial)\b/i;

  const checkPricingContent = (content: string, entityName: string) => {
    if (PRICING_KEYWORDS.test(content)) {
      setPricingModalEntityName(entityName);
      setPricingFormDate(new Date().toISOString().split("T")[0]);
      setPricingFormPlan("");
      setPricingFormPrice("");
      setPricingFormInclusions("");
      setPricingFormSource("");
      setPricingPrompt({ entityName, content });
    }
  };

  const handlePricingPromptAccept = () => {
    setShowPricingModal(true);
    setPricingPrompt(null);
  };

  const handlePricingSave = async () => {
    if (!pricingFormPlan.trim() || !pricingFormPrice.trim() || !pricingModalEntityName) return;
    try {
      await apiRequest("POST", `/api/competitor-pricing/${encodeURIComponent(pricingModalEntityName)}`, {
        capturedDate: pricingFormDate,
        planName: pricingFormPlan.trim(),
        price: pricingFormPrice.trim(),
        inclusions: pricingFormInclusions.trim() || undefined,
        sourceUrl: pricingFormSource.trim() || undefined,
      });
      toast({ title: "Pricing entry added", description: `Pricing info saved for ${pricingModalEntityName}.` });
      setShowPricingModal(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not save pricing.", variant: "destructive" });
    }
  };

  const [pricingModalEntityName, setPricingModalEntityName] = useState("");

  const [captureEmail, setCaptureEmail] = useState<string>(() => {
    const token = localStorage.getItem("ws_capture_token");
    return token ? `${token}@postmark.rohin.co` : "Loading...";
  });
  const [emailCopied, setEmailCopied] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(captureEmail);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const isCompetitorTopic = (entityName: string) => {
    const categories = workspaceData?.workspace?.categories || [];
    for (const cat of categories) {
      const entity = cat.entities.find(e => e.name === entityName);
      if (entity && (entity.topic_type || "general").toLowerCase() === "competitor") {
        return true;
      }
    }
    return false;
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

      if (matchedEntity && isCompetitorTopic(matchedEntity)) {
        await checkCapabilityMention(pendingContent, matchedEntity);
        checkPricingContent(pendingContent, matchedEntity);
      }

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

  const handleConfirmMultiMatchItem = async (match: MultiMatchItem, index: number) => {
    if (!pendingContent || !match.entity_id || !match.category) return;
    const saveMode = multiMatchSaveMode[index] ?? 'full';
    const contentToSave = saveMode === 'excerpt' ? match.relevant_excerpt : pendingContent;
    setSavingCards(prev => new Set(prev).add(index));
    try {
      await apiRequest("POST", "/api/captures", {
        type: pendingType,
        content: contentToSave,
        matchedEntity: match.entity_id,
        matchedCategory: match.category,
        matchReason: match.reasoning,
      });
      setMultiMatchConfirmed(prev => new Set(prev).add(index));
      toast({
        title: "Captured",
        description: `Saved to ${match.entity_id} in ${match.category}.`,
      });
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err.message || "Could not save capture.",
        variant: "destructive",
      });
    } finally {
      setSavingCards(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleSkipMultiMatchItem = (index: number) => {
    setMultiMatchSkipped(prev => new Set(prev).add(index));
  };

  const handleCreateAndConfirmMultiMatchItem = async (match: MultiMatchItem, index: number) => {
    const entityName = match.suggested_entity_name;
    if (!entityName) return;
    const saveMode = multiMatchSaveMode[index] ?? 'full';
    const contentToSave = saveMode === 'excerpt' ? match.relevant_excerpt : pendingContent;

    let categoryName = getResolvedCategoryForMatch(match, index);

    if (!categoryName) {
      categoryName = "Competitor Landscape";
    }

    const isOverridden = !!multiMatchCategoryOverrides[index];
    const hasSuggestedCategory = !!match.suggested_category && !isOverridden;
    const categories = workspaceData?.workspace?.categories || [];
    const categoryExists = categories.some(c => c.name === categoryName);

    setSavingCards(prev => new Set(prev).add(index));
    try {
      if (hasSuggestedCategory || !categoryExists) {
        const categoryDescription = hasSuggestedCategory ? (match.suggested_category?.description || "") : "";
        await apiRequest("POST", "/api/add-category", {
          categoryName,
          categoryDescription,
          entityName,
          entityType: "topic",
          topicType: match.suggested_topic_type || "general",
        });
      } else {
        await apiRequest("POST", "/api/add-entity", {
          categoryName,
          entityName,
          entityType: "topic",
          topicType: match.suggested_topic_type || "general",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/current"] });

      await apiRequest("POST", "/api/captures", {
        type: pendingType,
        content: contentToSave,
        matchedEntity: entityName,
        matchedCategory: categoryName,
        matchReason: match.reasoning,
      });
      setMultiMatchConfirmed(prev => new Set(prev).add(index));
      toast({
        title: "Topic created and captured",
        description: `Created "${entityName}" in "${categoryName}".`,
      });
    } catch (err: any) {
      toast({
        title: "Failed",
        description: err.message || "Could not create topic and save capture.",
        variant: "destructive",
      });
    } finally {
      setSavingCards(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleConfirmAllMultiMatch = async () => {
    if (!classification || !('multi_match' in classification) || !classification.multi_match) return;
    setIsConfirmingAll(true);
    const pendingMatches = classification.matches
      .map((m, i) => ({ match: m, index: i }))
      .filter(({ index }) => !multiMatchSkipped.has(index) && !multiMatchConfirmed.has(index));

    let successCount = 0;
    let failCount = 0;
    const confirmedCategories = new Set<string>();

    for (const { match, index } of pendingMatches) {
      try {
        const isNewTopic = !match.entity_id;
        if (isNewTopic && match.suggested_entity_name) {
          let catName = getResolvedCategoryForMatch(match, index);
          if (!catName) {
            catName = "Competitor Landscape";
          }
          const isOverridden = !!multiMatchCategoryOverrides[index];
          const hasSuggestedCategory = !!match.suggested_category && !isOverridden;
          const allCategories = workspaceData?.workspace?.categories || [];
          const categoryExists = allCategories.some(c => c.name === catName);

          if (hasSuggestedCategory || !categoryExists) {
            const categoryDescription = hasSuggestedCategory ? (match.suggested_category?.description || "") : "";
            await apiRequest("POST", "/api/add-category", {
              categoryName: catName,
              categoryDescription,
              entityName: match.suggested_entity_name,
              entityType: "topic",
              topicType: match.suggested_topic_type || "general",
            });
          } else {
            await apiRequest("POST", "/api/add-entity", {
              categoryName: catName,
              entityName: match.suggested_entity_name,
              entityType: "topic",
              topicType: match.suggested_topic_type || "general",
            });
          }
          queryClient.invalidateQueries({ queryKey: ["/api/workspace/current"] });
          const saveMode = multiMatchSaveMode[index] ?? 'full';
          const contentToSave = saveMode === 'excerpt' ? match.relevant_excerpt : pendingContent;
          await apiRequest("POST", "/api/captures", {
            type: pendingType,
            content: contentToSave,
            matchedEntity: match.suggested_entity_name,
            matchedCategory: catName,
            matchReason: match.reasoning,
          });
          confirmedCategories.add(catName);
        } else if (match.entity_id && match.category) {
          const saveMode = multiMatchSaveMode[index] ?? 'full';
          const contentToSave = saveMode === 'excerpt' ? match.relevant_excerpt : pendingContent;
          await apiRequest("POST", "/api/captures", {
            type: pendingType,
            content: contentToSave,
            matchedEntity: match.entity_id,
            matchedCategory: match.category,
            matchReason: match.reasoning,
          });
          confirmedCategories.add(match.category);
        } else {
          failCount++;
          continue;
        }
        setMultiMatchConfirmed(prev => new Set(prev).add(index));
        successCount++;
      } catch (err: any) {
        failCount++;
        toast({
          title: "Save failed",
          description: `Could not save to ${match.entity_id || match.suggested_entity_name}: ${err.message || "Unknown error"}`,
          variant: "destructive",
        });
      }
    }

    setIsConfirmingAll(false);

    const allDone = classification.matches.every(
      (_, i) => multiMatchSkipped.has(i) || multiMatchConfirmed.has(i) || pendingMatches.some(p => p.index === i)
    );
    if (allDone && failCount === 0 && successCount > 0) {
      toast({
        title: "All done",
        description: `${successCount} topic${successCount !== 1 ? "s" : ""} updated across ${confirmedCategories.size} categor${confirmedCategories.size !== 1 ? "ies" : "y"}.`,
        className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300",
      });
      resetState();
      setActiveType(null);
      navigate("/map");
    } else if (successCount > 0) {
      toast({
        title: "Partially saved",
        description: `${successCount} saved, ${failCount} failed.`,
        variant: "destructive",
      });
    }
  };

  const handleCreateCategoryAndConfirm = async () => {
    if (!classification || ('matched' in classification && classification.matched) || ('multi_match' in classification)) return;
    if (!newCatName.trim()) return;
    setIsCreatingCategory(true);

    try {
      await apiRequest("POST", "/api/add-category", {
        categoryName: newCatName.trim(),
        categoryDescription: classification.suggestedCategory.description,
        categoryFocus: newCatFocus.trim() || undefined,
        entityName: classification.suggestedEntity.name,
        entityType: classification.suggestedEntity.type,
        topicType: classification.suggestedEntity.topic_type || 'general',
      });

      queryClient.invalidateQueries({ queryKey: ["/api/workspace/current"] });

      await handleConfirmCapture(
        classification.suggestedEntity.name,
        newCatName.trim()
      );

      toast({
        title: "New category created and note filed",
        description: `Created "${newCatName.trim()}" with topic "${classification.suggestedEntity.name}".`,
      });

      const createdTopicType = (classification.suggestedEntity.topic_type || "general").toLowerCase();
      if (createdTopicType === "regulation" || createdTopicType === "risk" || createdTopicType === "event") {
        setPostCreateEntityName(classification.suggestedEntity.name);
        setPostCreateTopicType(createdTopicType);
        setShowPostCreateDateModal(true);
      }
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

  const handleCreateIntentTopic = async () => {
    if (!intentTopicName.trim()) return;
    const isNewCategory = intentCategory === "__new__";
    const categoryName = isNewCategory ? intentNewCategoryName.trim() : intentCategory;
    if (!categoryName) return;

    setIsCreatingIntentTopic(true);
    try {
      if (isNewCategory) {
        await apiRequest("POST", "/api/add-category", {
          categoryName,
          categoryDescription: "",
          categoryFocus: intentNewCategoryFocus.trim() || undefined,
          entityName: intentTopicName.trim(),
          entityType: "topic",
          topicType: intentTopicType,
        });
      } else {
        await apiRequest("POST", "/api/add-entity", {
          categoryName,
          entityName: intentTopicName.trim(),
          entityType: "topic",
          topicType: intentTopicType,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/workspace/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspace"] });

      toast({
        title: "Topic created",
        description: `Signalum will start tracking ${intentTopicName.trim()}.`,
      });

      const datePromptTypes = ["regulation", "risk", "event"];
      if (datePromptTypes.includes(intentTopicType.toLowerCase())) {
        setPostCreateEntityName(intentTopicName.trim());
        setPostCreateTopicType(intentTopicType.toLowerCase());
        setShowPostCreateDateModal(true);
      }

      setClassification(null);
      resetState();
      setActiveType(null);
      navigate("/map");
    } catch (err: any) {
      toast({
        title: "Failed to create topic",
        description: err.message || "Could not create the topic.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingIntentTopic(false);
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

    setIsClassifying(true);
    setExtractionInfo(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: "Not authenticated", variant: "destructive" });
        setIsClassifying(false);
        return;
      }

      console.log("[document-upload] File received on frontend:", { name: selectedFile.name, type: selectedFile.type, size: selectedFile.size });

      const formData = new FormData();
      formData.append("file", selectedFile);

      console.log("[document-upload] Sending file to backend via FormData");
      const extractRes = await fetch("/api/extract-document", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      const extractData = await extractRes.json();
      console.log("[document-upload] Extraction result from backend:", { ok: extractRes.ok, characterCount: extractData.characterCount, filename: extractData.filename });

      if (!extractRes.ok) {
        toast({ title: "Document error", description: extractData.message, variant: "destructive" });
        setIsClassifying(false);
        return;
      }

      setExtractionInfo({ filename: extractData.filename, characterCount: extractData.characterCount });

      const content = `[File: ${extractData.filename}]\n${extractData.text.slice(0, 9800)}`;
      classifyContent(content, "document");
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message || "Could not extract text from document.", variant: "destructive" });
      setIsClassifying(false);
    }
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
      <div className="mb-6">
        <h1 className="text-xl font-medium text-foreground" data-testid="text-page-title">Capture</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste text, drop a URL, or forward an email — Signalum routes it automatically.
        </p>
      </div>

      {!classification && !isClassifying && (
        <div
          className="bg-white rounded-xl overflow-hidden"
          style={{ border: "0.5px solid #e2e2e2" }}
          data-testid="card-composer"
        >
          {activeType === "voice" ? (
            <div className="px-5 pt-5 pb-3">
              {!transcribedText && !isTranscribing && (
                <div className="flex flex-col items-center py-6 space-y-4">
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
                      : "bg-[#534AB7] text-white border-[#534AB7] hover:bg-[#534AB7]/90"
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
                <div className="flex flex-col items-center py-6 space-y-3">
                  <Loader2 className="w-6 h-6 text-[#534AB7] animate-spin" />
                  <p className="text-sm text-muted-foreground">Transcribing your audio...</p>
                </div>
              )}
              {transcribedText && !isTranscribing && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Transcription:</p>
                  <div className="bg-muted/50 rounded-md p-3 text-sm text-foreground" data-testid="text-transcription">
                    {transcribedText}
                  </div>
                  <button
                    onClick={() => { setTranscribedText(""); setRecordingTime(0); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-re-record"
                  >
                    Re-record
                  </button>
                </div>
              )}
            </div>
          ) : activeType === "document" ? (
            <div className="px-5 pt-5 pb-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.csv,.json,.pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                data-testid="input-capture-file"
              />
              <div
                className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center cursor-pointer transition-colors hover:border-slate-300"
                onClick={() => fileInputRef.current?.click()}
                data-testid="area-file-upload"
              >
                {selectedFile ? (
                  <div className="space-y-1.5">
                    <FileText className="w-6 h-6 text-[#534AB7] mx-auto" />
                    <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Upload className="w-6 h-6 text-muted-foreground/50 mx-auto" />
                    <p className="text-sm text-muted-foreground">Click to select a file</p>
                    <p className="text-xs text-muted-foreground">.txt, .md, .csv, .json, .pdf, .doc, .docx</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="px-5 pt-5 pb-3">
              <textarea
                placeholder={activeType === "url"
                  ? "https://example.com/article"
                  : "Paste an article, type a note, or drop a URL\u2026"
                }
                value={activeType === "url" ? urlContent : textContent}
                onChange={(e) => {
                  if (activeType === "url") {
                    setUrlContent(e.target.value);
                  } else {
                    setTextContent(e.target.value);
                  }
                }}
                rows={4}
                className="w-full resize-none text-sm text-foreground placeholder:text-muted-foreground bg-transparent outline-none"
                data-testid={activeType === "url" ? "input-capture-url" : "input-capture-text"}
                autoFocus
              />
            </div>
          )}

          <div className="px-5 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5" data-testid="pills-capture-type">
              {([
                { key: "text" as CaptureType, label: "Note", icon: PenLine },
                { key: "url" as CaptureType, label: "URL", icon: Link2 },
                { key: "document" as CaptureType, label: "Document", icon: FileText },
                { key: "voice" as CaptureType, label: "Voice", icon: Mic },
              ]).map((pill) => {
                const isActive = activeType === pill.key || (activeType === null && pill.key === "text");
                return (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => handleSelectType(pill.key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      isActive
                        ? "bg-[#EEEDFE] text-[#534AB7] border-[#AFA9EC]"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                    data-testid={`pill-capture-type-${pill.key}`}
                  >
                    <pill.icon className="w-3.5 h-3.5" />
                    {pill.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleComposerSubmit}
              disabled={isComposerSubmitDisabled()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium text-white bg-[#534AB7] hover:bg-[#534AB7]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              data-testid="button-capture-submit"
            >
              Capture
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div
        className="mt-4 bg-white rounded-xl overflow-hidden flex items-center gap-3 px-4 py-3"
        style={{ border: "0.5px solid #e2e2e2" }}
        data-testid="card-email-forwarding"
      >
        <Mail className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="text-sm text-slate-600">Your capture address</span>
        <span className="text-sm font-mono text-slate-800 flex-1 select-all truncate" data-testid="text-capture-email">{captureEmail || "Loading..."}</span>
        <button
          onClick={handleCopyEmail}
          className="text-xs font-medium text-[#534AB7] hover:text-[#534AB7]/80 transition-colors shrink-0 px-2 py-1 rounded hover:bg-[#EEEDFE]"
          data-testid="button-copy-capture-email"
        >
          {emailCopied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-1.5 px-1">
        Forward any newsletter or announcement here — Signalum routes it automatically.
      </p>

      {recentCaptures.length > 0 && !classification && !isClassifying && (
        <div className="mt-8" data-testid="recent-captures-section">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Recent Captures</p>
          <div className="divide-y divide-slate-100">
            {recentCaptures.map((cap: any) => {
              const categoryColors: Record<string, { bg: string; text: string }> = {
                "Competitors": { bg: "#FFF1EE", text: "#C4320A" },
                "Competitor Landscape": { bg: "#FFF1EE", text: "#C4320A" },
                "Standards & Regulations": { bg: "#EFF6FF", text: "#1D4ED8" },
                "Industry Topics": { bg: "#F0FDF4", text: "#15803D" },
                "Threat Intelligence": { bg: "#FFF7ED", text: "#C2410C" },
              };
              const colors = (cap.matchedCategory && categoryColors[cap.matchedCategory]) || { bg: "#F3F4F6", text: "#4B5563" };
              const truncated = cap.content.length > 100 ? cap.content.slice(0, 100).trimEnd() + "\u2026" : cap.content;
              const dateStr = new Date(cap.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div
                  key={cap.id}
                  className="flex items-center gap-3 py-3"
                  data-testid={`recent-capture-${cap.id}`}
                >
                  {cap.matchedEntity && (
                    <span
                      className="text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                      data-testid={`badge-entity-${cap.id}`}
                    >
                      {cap.matchedEntity}
                    </span>
                  )}
                  <p className="text-sm text-foreground flex-1 min-w-0 truncate">{truncated}</p>
                  <span className="text-xs text-muted-foreground shrink-0">{dateStr}</span>
                </div>
              );
            })}
          </div>
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

      {extractionInfo && classification && !isClassifying && (
        <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-md bg-[#1e3a5f]/5 border border-[#1e3a5f]/15" data-testid="text-extraction-info">
          <FileText className="w-4 h-4 text-[#1e3a5f] shrink-0" />
          <p className="text-sm text-[#1e3a5f]">
            Extracted {extractionInfo.characterCount.toLocaleString()} characters from {extractionInfo.filename}
          </p>
        </div>
      )}

      {classification && !isClassifying && 'user_intent' in classification && classification.user_intent && (
        <div className="mt-6 border border-border rounded-md p-6 space-y-5" data-testid="card-user-intent">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-foreground" data-testid="text-user-intent-title">
              Want to start tracking this?
            </h3>
            <p className="text-sm text-muted-foreground" data-testid="text-user-intent-message">
              {classification.description
                ? `It looks like you want to track ${classification.entity_name}${classification.description ? `, ${classification.description.charAt(0).toLowerCase()}${classification.description.slice(1).replace(/\.$/, '')}` : ''}.`
                : `It looks like you want to track ${classification.entity_name}.`}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Topic name</label>
              <Input
                value={intentTopicName}
                onChange={(e) => setIntentTopicName(e.target.value)}
                placeholder="Enter topic name"
                className="h-10"
                data-testid="input-intent-topic-name"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Category</label>
              <select
                value={intentCategory}
                onChange={(e) => {
                  setIntentCategory(e.target.value);
                  if (e.target.value !== "__new__") {
                    setIntentNewCategoryName("");
                    setIntentNewCategoryFocus("");
                  }
                }}
                className="w-full h-10 px-3 rounded-md border border-border bg-background text-foreground text-sm"
                data-testid="select-intent-category"
              >
                <option value="">Select a category...</option>
                {(workspaceData?.workspace?.categories || []).map((cat) => (
                  <option key={cat.name} value={cat.name}>{cat.name}</option>
                ))}
                <option value="__new__">+ Create new category</option>
              </select>
              {intentCategory && intentCategory !== "__new__" && (() => {
                const selectedCat = (workspaceData?.workspace?.categories || []).find(c => c.name === intentCategory);
                return selectedCat?.focus ? (
                  <p className="text-xs text-muted-foreground mt-1" data-testid="text-selected-category-focus">
                    Focus: {selectedCat.focus}
                  </p>
                ) : null;
              })()}
              {intentCategory === "__new__" && (
                <div className="mt-2 space-y-2">
                  <Input
                    value={intentNewCategoryName}
                    onChange={(e) => setIntentNewCategoryName(e.target.value)}
                    placeholder="Category name"
                    className="h-10"
                    data-testid="input-intent-new-category"
                    autoFocus
                  />
                  <Textarea
                    value={intentNewCategoryFocus}
                    onChange={(e) => {
                      if (e.target.value.length <= 300) setIntentNewCategoryFocus(e.target.value);
                    }}
                    placeholder="What should we pay attention to within this category? e.g. Digital ID policy, UK government procurement"
                    className="min-h-[60px] text-sm"
                    maxLength={300}
                    data-testid="input-intent-new-category-focus"
                  />
                  <p className="text-xs text-muted-foreground text-right mt-1" data-testid="text-intent-focus-char-count">
                    {intentNewCategoryFocus.length}/300
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Topic type</label>
              <div className="flex flex-wrap gap-2" data-testid="pills-intent-topic-type">
                {(["competitor", "regulation", "project", "person", "trend", "technology", "event", "general"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setIntentTopicType(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      intentTopicType === t
                        ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                        : "bg-background text-foreground border-border hover:border-[#1e3a5f]/40"
                    }`}
                    data-testid={`pill-intent-type-${t}`}
                  >
                    {topicTypeDisplayNames[t] || t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                setClassification(null);
                setPendingContent("");
                setPendingType("");
                setIntentTopicName("");
                setIntentCategory("");
                setIntentNewCategoryName("");
                setIntentNewCategoryFocus("");
                setIntentTopicType("general");
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-dismiss-intent"
            >
              Dismiss
            </button>
            <Button
              onClick={handleCreateIntentTopic}
              disabled={isCreatingIntentTopic || !intentTopicName.trim() || (!intentCategory || (intentCategory === "__new__" && !intentNewCategoryName.trim()))}
              className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
              data-testid="button-create-intent-topic"
            >
              {isCreatingIntentTopic ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create topic
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {classification && !isClassifying && !('user_intent' in classification) && !('multi_match' in classification) && classification.matched && (
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

      {classification && !isClassifying && 'multi_match' in classification && classification.multi_match && (
        <div className="mt-6 space-y-3" data-testid="multi-match-container">
          <p className="text-sm font-medium text-muted-foreground">
            AI found {classification.matches.length} topics in this content
          </p>
          {classification.matches.map((match, index) => {
            const isSkipped = multiMatchSkipped.has(index);
            const isConfirmedItem = multiMatchConfirmed.has(index);
            const isNewTopic = !match.entity_id;

            if (isSkipped) {
              return (
                <div key={index} className="border border-border rounded-md p-4 opacity-50" data-testid={`multi-match-card-skipped-${index}`}>
                  <div className="flex items-center gap-2">
                    <X className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground line-through">
                      {match.entity_id || match.suggested_entity_name || "New topic"}
                    </span>
                    <Badge variant="outline" className="text-xs">Skipped</Badge>
                  </div>
                </div>
              );
            }

            if (isConfirmedItem) {
              const displayEntity = match.entity_id || match.suggested_entity_name || "topic";
              const displayCategory = multiMatchCategoryOverrides[index] || match.category || match.suggested_category?.name || getResolvedCategoryForMatch(match, index) || "category";
              return (
                <div key={index} className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-md p-4" data-testid={`multi-match-card-confirmed-${index}`}>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">
                      Saved to {displayEntity} in {displayCategory}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div key={index} className="border border-border rounded-md p-6 space-y-4" data-testid={`multi-match-card-${index}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-md bg-[#1e3a5f]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <FolderOpen className="w-5 h-5 text-[#1e3a5f]" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isNewTopic ? (
                        <>
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-100">
                            <Plus className="w-3 h-3 mr-1" />
                            {match.suggested_entity_name || "New topic"}
                          </Badge>
                          {(() => {
                            const resolvedCategory = getResolvedCategoryForMatch(match, index);
                            const displayCat = resolvedCategory || "Competitor Landscape";
                            const isSuggested = !!match.suggested_category && !multiMatchCategoryOverrides[index];
                            return (
                              <>
                                <span className="text-sm text-muted-foreground">
                                  {isSuggested ? "in new category" : "in"}
                                </span>
                                {changingCategoryIndex === index ? (
                                  <div className="flex items-center gap-2" data-testid={`select-category-change-${index}`}>
                                    <Select
                                      value={multiMatchCategoryOverrides[index] || displayCat}
                                      onValueChange={(value) => {
                                        setMultiMatchCategoryOverrides(prev => ({ ...prev, [index]: value }));
                                        setChangingCategoryIndex(null);
                                      }}
                                    >
                                      <SelectTrigger className="h-7 text-xs w-auto min-w-[140px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(workspaceData?.workspace?.categories || []).map(cat => (
                                          <SelectItem key={cat.name} value={cat.name}>
                                            <div>
                                              <span>{cat.name}</span>
                                              {cat.focus && (
                                                <p className="text-xs text-muted-foreground">Focus: {cat.focus}</p>
                                              )}
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <button
                                      className="text-xs text-muted-foreground hover:text-foreground"
                                      onClick={() => setChangingCategoryIndex(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <Badge variant="outline" data-testid={`badge-category-${index}`}>{displayCat}</Badge>
                                    <button
                                      className="text-xs text-[#1e3a5f] hover:underline flex items-center gap-0.5"
                                      onClick={() => setChangingCategoryIndex(index)}
                                      data-testid={`button-change-category-${index}`}
                                    >
                                      <Pencil className="w-3 h-3" />
                                      Change
                                    </button>
                                  </>
                                )}
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        <>
                          <Badge variant="secondary">
                            <Tag className="w-3 h-3 mr-1" />
                            {match.entity_id}
                          </Badge>
                          <span className="text-sm text-muted-foreground">in</span>
                          <Badge variant="outline">{match.category}</Badge>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-foreground" data-testid={`text-multi-match-reasoning-${index}`}>
                      {match.reasoning}
                    </p>
                    <div className="bg-muted/50 rounded-md p-3 mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Relevant excerpt</p>
                      <p className="text-sm text-foreground" data-testid={`text-multi-match-excerpt-${index}`}>
                        {match.relevant_excerpt}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      <p className="text-xs text-muted-foreground mr-1">Save:</p>
                      <button
                        className={`text-xs px-2 py-1 rounded border transition-colors ${(multiMatchSaveMode[index] ?? 'full') === 'excerpt' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-background text-muted-foreground border-border hover:border-foreground'}`}
                        onClick={() => setMultiMatchSaveMode(prev => ({ ...prev, [index]: 'excerpt' }))}
                        data-testid={`button-save-mode-excerpt-${index}`}
                      >
                        Excerpt only
                      </button>
                      <button
                        className={`text-xs px-2 py-1 rounded border transition-colors ${(multiMatchSaveMode[index] ?? 'full') === 'full' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-background text-muted-foreground border-border hover:border-foreground'}`}
                        onClick={() => setMultiMatchSaveMode(prev => ({ ...prev, [index]: 'full' }))}
                        data-testid={`button-save-mode-full-${index}`}
                      >
                        Full text
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSkipMultiMatchItem(index)}
                    data-testid={`button-skip-multi-match-${index}`}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Skip
                  </Button>
                  {isNewTopic ? (
                    <Button
                      size="sm"
                      onClick={() => handleCreateAndConfirmMultiMatchItem(match, index)}
                      disabled={savingCards.has(index)}
                      className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      data-testid={`button-create-multi-match-${index}`}
                    >
                      {savingCards.has(index) ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Plus className="w-4 h-4" />
                          Create &amp; confirm
                        </span>
                      )}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleConfirmMultiMatchItem(match, index)}
                      disabled={savingCards.has(index)}
                      className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      data-testid={`button-confirm-multi-match-${index}`}
                    >
                      {savingCards.has(index) ? (
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
                  )}
                </div>
              </div>
            );
          })}

          {(() => {
            const remainingCount = classification.matches.filter(
              (m, i) => m.entity_id && m.category && !multiMatchSkipped.has(i) && !multiMatchConfirmed.has(i)
            ).length;
            const allDone = classification.matches.every(
              (_, i) => multiMatchSkipped.has(i) || multiMatchConfirmed.has(i)
            );

            if (allDone) {
              const confirmedMatches = classification.matches.filter((_, i) => multiMatchConfirmed.has(i));
              const confirmedCount = confirmedMatches.length;
              const uniqueCategories = new Set(confirmedMatches.map(m => m.category || m.suggested_category?.name).filter(Boolean));
              const categoryCount = uniqueCategories.size;
              return (
                <div className="flex items-center justify-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      toast({
                        title: "All done",
                        description: `${confirmedCount} topic${confirmedCount !== 1 ? "s" : ""} updated across ${categoryCount} categor${categoryCount !== 1 ? "ies" : "y"}.`,
                        className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300",
                      });
                      resetState();
                      setActiveType(null);
                      navigate("/map");
                    }}
                    data-testid="button-multi-match-done"
                  >
                    Done
                  </Button>
                </div>
              );
            }

            return remainingCount > 1 ? (
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setClassification(null);
                    setPendingContent("");
                    setPendingType("");
                    setMultiMatchSkipped(new Set());
                    setMultiMatchConfirmed(new Set());
                    setMultiMatchSaveMode({});
                  }}
                  data-testid="button-cancel-multi-match"
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancel all
                </Button>
                <Button
                  onClick={handleConfirmAllMultiMatch}
                  disabled={isConfirmingAll || savingCards.size > 0}
                  className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                  data-testid="button-confirm-all-multi-match"
                >
                  {isConfirmingAll ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Confirming...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      Confirm all ({remainingCount})
                    </span>
                  )}
                </Button>
              </div>
            ) : null;
          })()}
        </div>
      )}

      {classification && !isClassifying && !('user_intent' in classification) && !('multi_match' in classification) && !classification.matched && !showManualPicker && (
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

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Category name</label>
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Category name"
                className="h-10"
                data-testid="input-new-category-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Focus <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea
                value={newCatFocus}
                onChange={(e) => {
                  if (e.target.value.length <= 300) setNewCatFocus(e.target.value);
                }}
                placeholder="What should we pay attention to within this category? e.g. Digital ID policy, UK government procurement"
                className="min-h-[60px] text-sm"
                maxLength={300}
                data-testid="input-new-category-focus"
              />
              <p className="text-xs text-muted-foreground text-right mt-1" data-testid="text-new-cat-focus-char-count">
                {newCatFocus.length}/300
              </p>
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
              disabled={isCreatingCategory || isSaving || !newCatName.trim()}
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
            {selectedManualCategory && (() => {
              const selectedCat = (workspaceData?.workspace?.categories || []).find(c => c.name === selectedManualCategory);
              return selectedCat?.focus ? (
                <p className="text-xs text-muted-foreground mt-1" data-testid="text-manual-category-focus">
                  Focus: {selectedCat.focus}
                </p>
              ) : null;
            })()}
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

      {extractedDates.length > 0 && classification && !isClassifying && (
        <div className="mt-6 space-y-3" data-testid="extracted-dates-section">
          <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            Dates detected
          </p>
          {extractedDates.map((dateItem, index) => {
            if (dismissedDateIndices.has(index)) return null;

            if (trackedDateIndices.has(index)) {
              return (
                <div key={index} className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-md p-4" data-testid={`extracted-date-tracked-${index}`}>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">
                      Date tracked: {dateItem.label} ({dateItem.date})
                    </span>
                  </div>
                </div>
              );
            }

            const dateTypeColors: Record<string, string> = {
              hard_deadline: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
              soft_deadline: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
              watch_date: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
            };
            const dateTypeLabels: Record<string, string> = {
              hard_deadline: "Hard deadline",
              soft_deadline: "Soft deadline",
              watch_date: "Watch date",
            };

            return (
              <div key={index} className="border border-border rounded-md p-4 flex items-center justify-between gap-3" data-testid={`extracted-date-card-${index}`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="shrink-0">
                    <Calendar className="w-4 h-4 text-[#1e3a5f]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{dateItem.label}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{dateItem.date}</span>
                      <Badge className={`text-xs px-1.5 py-0 ${dateTypeColors[dateItem.date_type] || dateTypeColors.watch_date}`}>
                        {dateTypeLabels[dateItem.date_type] || "Watch date"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDismissDate(index)}
                    data-testid={`button-ignore-date-${index}`}
                  >
                    Ignore
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleTrackDate(dateItem, index)}
                    disabled={trackingDateIndex === index}
                    className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                    data-testid={`button-track-date-${index}`}
                  >
                    {trackingDateIndex === index ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "Track this"
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {capabilityPrompt && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-border shadow-xl rounded-xl p-4 max-w-md w-full animate-in slide-in-from-bottom-4" data-testid="capability-detection-prompt">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-foreground">
              This capture mentions <span className="font-semibold text-[#1e3a5f]">{capabilityPrompt.capabilityName}</span>. Update <span className="font-semibold">{capabilityPrompt.entityName}</span>'s capability status?
            </p>
            <button
              onClick={() => setCapabilityPrompt(null)}
              className="text-slate-400 hover:text-slate-600 ml-2 shrink-0"
              data-testid="button-dismiss-capability-prompt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            {([
              { status: "yes", emoji: "\u2705", label: "Yes", bgClass: "bg-green-100 hover:bg-green-200 text-green-800" },
              { status: "no", emoji: "\u274C", label: "No", bgClass: "bg-red-100 hover:bg-red-200 text-red-800" },
              { status: "partial", emoji: "\u26A0\uFE0F", label: "Partial", bgClass: "bg-amber-100 hover:bg-amber-200 text-amber-800" },
              { status: "unknown", emoji: "\u2753", label: "Unknown", bgClass: "bg-slate-100 hover:bg-slate-200 text-slate-600" },
            ] as const).map((opt) => (
              <button
                key={opt.status}
                onClick={() => handleCapabilityStatusSelect(opt.status)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${opt.bgClass}`}
                data-testid={`button-capability-status-${opt.status}`}
              >
                {opt.emoji} {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {pricingPrompt && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-border shadow-xl rounded-xl p-4 max-w-md w-full animate-in slide-in-from-bottom-4" data-testid="pricing-detection-prompt">
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm text-foreground">
              This looks like pricing information. Want to add it to <span className="font-semibold">{pricingPrompt.entityName}</span>'s Pricing table?
            </p>
            <button
              onClick={() => setPricingPrompt(null)}
              className="text-slate-400 hover:text-slate-600 ml-2 shrink-0"
              data-testid="button-dismiss-pricing-prompt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
              onClick={handlePricingPromptAccept}
              data-testid="button-accept-pricing-prompt"
            >
              Yes, add pricing
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPricingPrompt(null)}
              data-testid="button-skip-pricing-prompt"
            >
              Skip
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showPricingModal} onOpenChange={(open) => { if (!open) setShowPricingModal(false); }}>
        <DialogContent className="max-w-md" data-testid="modal-capture-pricing">
          <DialogHeader>
            <DialogTitle>Add Pricing Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Date</label>
              <Input
                type="date"
                value={pricingFormDate}
                onChange={(e) => setPricingFormDate(e.target.value)}
                data-testid="input-capture-pricing-date"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Plan / Tier</label>
              <Input
                placeholder="e.g. Pro, Enterprise, Free"
                value={pricingFormPlan}
                onChange={(e) => setPricingFormPlan(e.target.value)}
                data-testid="input-capture-pricing-plan"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Price</label>
              <Input
                placeholder="e.g. $49/mo, $499/yr, Custom"
                value={pricingFormPrice}
                onChange={(e) => setPricingFormPrice(e.target.value)}
                data-testid="input-capture-pricing-price"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Key inclusions</label>
              <Input
                placeholder="e.g. 10 seats, unlimited projects"
                value={pricingFormInclusions}
                onChange={(e) => setPricingFormInclusions(e.target.value)}
                data-testid="input-capture-pricing-inclusions"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Source URL</label>
              <Input
                placeholder="https://..."
                value={pricingFormSource}
                onChange={(e) => setPricingFormSource(e.target.value)}
                data-testid="input-capture-pricing-source"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPricingModal(false)} data-testid="button-cancel-capture-pricing">
              Cancel
            </Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
              disabled={!pricingFormPlan.trim() || !pricingFormPrice.trim()}
              onClick={handlePricingSave}
              data-testid="button-save-capture-pricing"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPostCreateDateModal} onOpenChange={(open) => { if (!open) closePostCreateDateModal(); }}>
        <DialogContent className="sm:max-w-md" data-testid="modal-post-create-date">
          <DialogHeader>
            <DialogTitle className="text-[#1e3a5f]" data-testid="text-post-create-date-title">
              Add a key date
            </DialogTitle>
          </DialogHeader>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-2" data-testid="text-post-create-date-prompt">
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-700">
                Would you like to add a key date for this {datePromptTypeLabel(postCreateTopicType)}? You can always add one later.
              </p>
            </div>
          </div>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Label</label>
              <Input
                placeholder="e.g. Compliance enforcement begins, Project kickoff, Expected launch"
                value={postDateLabel}
                onChange={(e) => setPostDateLabel(e.target.value)}
                className="text-sm"
                data-testid="input-post-date-label"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Date</label>
              <Input
                type="date"
                value={postDateValue}
                onChange={(e) => setPostDateValue(e.target.value)}
                className="text-sm"
                data-testid="input-post-date-value"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Type</label>
              <div className="flex gap-2" data-testid="select-post-date-type">
                {([
                  { value: "hard_deadline", label: "Hard deadline", selectedClass: "border-red-400 bg-red-50 text-red-700", ringClass: "ring-red-200" },
                  { value: "soft_deadline", label: "Soft deadline", selectedClass: "border-amber-400 bg-amber-50 text-amber-700", ringClass: "ring-amber-200" },
                  { value: "watch_date", label: "Watch date", selectedClass: "border-blue-400 bg-blue-50 text-blue-700", ringClass: "ring-blue-200" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPostDateType(opt.value)}
                    className={`flex-1 rounded-lg border-2 px-3 py-2 text-left transition-all ${
                      postDateType === opt.value
                        ? `${opt.selectedClass} ring-2 ${opt.ringClass}`
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                    data-testid={`pill-post-date-type-${opt.value}`}
                  >
                    <span className="text-xs font-semibold block">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Notes</label>
              <textarea
                placeholder="Any additional context about this date"
                value={postDateNotes}
                onChange={(e) => setPostDateNotes(e.target.value)}
                className="w-full min-h-[70px] rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f]/50 resize-none"
                data-testid="input-post-date-notes"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={closePostCreateDateModal}
              data-testid="button-post-date-skip"
            >
              Skip for now
            </Button>
            <Button
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white"
              onClick={handlePostCreateAddDate}
              disabled={!postDateLabel.trim() || !postDateValue || isAddingDate}
              data-testid="button-post-date-save"
            >
              {isAddingDate ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : null}
              Add Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
