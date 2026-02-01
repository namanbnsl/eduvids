"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, Loader2, Pencil, Save } from "lucide-react";

type VoiceoverApprovalCardProps = {
  jobId: string;
  voiceoverDraft: string;
  voiceoverStatus?: "pending" | "approved";
  onApproved?: () => void;
  className?: string;
};

export function VoiceoverApprovalCard({
  jobId,
  voiceoverDraft: initialDraft,
  voiceoverStatus,
  onApproved,
  className,
}: VoiceoverApprovalCardProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const lastSavedDraft = useRef(initialDraft);

  const isApproved = voiceoverStatus === "approved";

  useEffect(() => {
    if (initialDraft !== lastSavedDraft.current && !hasUnsavedChanges) {
      setDraft(initialDraft);
      lastSavedDraft.current = initialDraft;
    }
  }, [initialDraft, hasUnsavedChanges]);

  const handleDraftChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      setHasUnsavedChanges(e.target.value !== lastSavedDraft.current);
      setSaveError(null);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/voiceover`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceoverDraft: draft }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      lastSavedDraft.current = draft;
      setHasUnsavedChanges(false);
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [jobId, draft, hasUnsavedChanges]);

  const handleApprove = useCallback(async () => {
    if (hasUnsavedChanges) {
      await handleSave();
    }

    setIsApproving(true);
    setApproveError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/voiceover/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to approve");
      }

      onApproved?.();
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setIsApproving(false);
    }
  }, [jobId, hasUnsavedChanges, handleSave, onApproved]);

  if (isApproved) {
    return (
      <Card
        className={cn(
          "w-full max-w-xl min-w-[min(18rem,100%)] rounded-xl border bg-card text-card-foreground shadow-sm",
          className
        )}
      >
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Check className="size-5 text-green-600" />
            Voiceover Approved
          </CardTitle>
          <CardDescription>
            Your voiceover has been approved. Video generation is in progress.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
            {draft}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "w-full max-w-xl min-w-[min(18rem,100%)] rounded-xl border bg-card text-card-foreground shadow-sm",
        className
      )}
    >
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg font-semibold">
          Review Voiceover Script
        </CardTitle>
        <CardDescription>
          Review and edit the narration before video generation continues.
          Approving will start the rendering process.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditing ? (
          <Textarea
            value={draft}
            onChange={handleDraftChange}
            className="min-h-[200px] font-mono text-sm resize-y"
            placeholder="Enter voiceover script..."
            disabled={isSaving}
          />
        ) : (
          <div
            className="rounded-md bg-muted p-4 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto cursor-pointer hover:bg-muted/80 transition-colors"
            onClick={() => setIsEditing(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setIsEditing(true);
              }
            }}
          >
            {draft || (
              <span className="text-muted-foreground italic">
                No voiceover script yet...
              </span>
            )}
          </div>
        )}
        {saveError && (
          <p className="text-sm text-destructive">{saveError}</p>
        )}
        {approveError && (
          <p className="text-sm text-destructive">{approveError}</p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {isEditing ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDraft(lastSavedDraft.current);
                setHasUnsavedChanges(false);
                setIsEditing(false);
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="size-4 mr-1" />
                  Save Changes
                </>
              )}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="size-4 mr-1" />
            Edit
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={isApproving || isEditing}
          className="ml-auto"
        >
          {isApproving ? (
            <>
              <Loader2 className="size-4 animate-spin mr-1" />
              Approving...
            </>
          ) : (
            <>
              <Check className="size-4 mr-1" />
              Approve & Continue
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
