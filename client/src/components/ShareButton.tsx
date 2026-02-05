import { useState, type RefObject } from "react";
import { Share2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { shareElement } from "@/lib/share";

interface ShareButtonProps {
  targetRef: RefObject<HTMLElement>;
  title: string;
  text?: string;
  fileName?: string;
}

export function ShareButton({ targetRef, title, text, fileName }: ShareButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const slugifiedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const handleShare = async () => {
    if (!targetRef.current) {
      toast({
        title: "Error",
        description: "Nothing to share",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await shareElement(targetRef.current, title, text, fileName);
      toast({ title: "Shared", description: "Image ready" });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      toast({
        title: "Share failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleShare}
      disabled={isLoading}
      data-testid={`button-share-${slugifiedTitle}`}
      data-share-exclude
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Share2 className="w-4 h-4" />
      )}
    </Button>
  );
}
