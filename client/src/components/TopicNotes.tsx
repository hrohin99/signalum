import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Bold, Italic, Underline, List, Link, Heading2, Check } from "lucide-react";

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      style={{
        padding: "3px 7px",
        border: "1px solid #e2e8f0",
        borderRadius: 5,
        background: "#fff",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#475569",
      }}
      data-testid={`notes-toolbar-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {children}
    </button>
  );
}

export function TopicNotes({ entityName }: { entityName: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState(false);

  const { data } = useQuery<{ content: string }>({
    queryKey: ["/api/topic-notes", entityName],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/topic-notes/${encodeURIComponent(entityName)}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data?.content !== undefined && editorRef.current) {
      editorRef.current.innerHTML = data.content;
    }
  }, [data?.content]);

  const saveMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("PUT", `/api/topic-notes/${encodeURIComponent(entityName)}`, { content });
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const scheduleAutosave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (editorRef.current) {
        saveMutation.mutate(editorRef.current.innerHTML);
      }
    }, 1000);
  }, [saveMutation]);

  const execCmd = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    scheduleAutosave();
  };

  const handleAddLink = () => {
    const url = window.prompt("Enter URL:");
    if (url) execCmd("createLink", url);
  };

  return (
    <div data-testid="topic-notes">
      <div
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          marginBottom: 8,
          padding: "6px 8px",
          background: "#f8fafc",
          borderRadius: 7,
          border: "1px solid #e2e8f0",
        }}
      >
        <ToolbarButton onClick={() => execCmd("bold")} title="Bold">
          <Bold size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCmd("italic")} title="Italic">
          <Italic size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCmd("underline")} title="Underline">
          <Underline size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCmd("insertUnorderedList")} title="Bullet list">
          <List size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={() => execCmd("formatBlock", "h3")} title="Heading">
          <Heading2 size={13} />
        </ToolbarButton>
        <ToolbarButton onClick={handleAddLink} title="Link">
          <Link size={13} />
        </ToolbarButton>
        {saved && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#22c55e",
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Check size={11} /> Saved
          </span>
        )}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={scheduleAutosave}
        style={{
          minHeight: 120,
          padding: "10px 12px",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          fontSize: 13,
          color: "#1e293b",
          lineHeight: 1.6,
          outline: "none",
          background: "#fff",
        }}
        data-testid="notes-editor"
        data-placeholder="Add your notes here…"
      />
      <style>{`
        [data-testid="notes-editor"]:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
