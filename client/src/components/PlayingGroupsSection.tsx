import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { generatePlayingGroups, formatGroupsForSharing, PlayingGroupsConstraintError } from "@shared/playingGroups";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Shuffle, Share2, Flag, Lock, X, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Player {
  id: number;
  name: string;
}

interface GroupEntry {
  players: string[];
  lockedPlayerNames: string[];
}

function DraggablePlayer({ id, name, isLocked }: { id: string; name: string; isLocked: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium border cursor-grab active:cursor-grabbing select-none touch-none transition-opacity
        ${isDragging ? "opacity-20" : "opacity-100"}
        ${isLocked
          ? "bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700"
          : "bg-background text-foreground border-border"
        }
      `}
      data-testid={`draggable-player-${id}`}
    >
      {isLocked && <Lock className="w-3 h-3 shrink-0" />}
      <span>{name}</span>
    </div>
  );
}

function DroppableGroup({
  groupIdx,
  group,
  activePlayer,
}: {
  groupIdx: number;
  group: GroupEntry;
  activePlayer: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-${groupIdx}` });
  const lockedSet = new Set(group.lockedPlayerNames);

  return (
    <Card
      ref={setNodeRef}
      className={`transition-colors ${isOver ? "border-primary ring-1 ring-primary bg-primary/5" : ""}`}
      data-testid={`card-group-${groupIdx + 1}`}
    >
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Flag className="w-3.5 h-3.5 text-muted-foreground" />
          Group {groupIdx + 1}
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            {group.players.length} players
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="flex flex-wrap gap-1.5 min-h-8">
          {group.players.map((playerName) => (
            <DraggablePlayer
              key={playerName}
              id={`${groupIdx}::${playerName}`}
              name={playerName}
              isLocked={lockedSet.has(playerName)}
            />
          ))}
          {isOver && activePlayer && !group.players.includes(activePlayer) && (
            <div className="px-2.5 py-1 rounded-full text-sm border-2 border-dashed border-primary text-primary opacity-60">
              Drop here
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PlayingGroupsSection({
  players,
  matchName,
}: {
  players: Player[];
  matchName: string;
}) {
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [lockedSets, setLockedSets] = useState<string[][]>([]);
  const [lockingSelection, setLockingSelection] = useState<string[]>([]);
  const [preview, setPreview] = useState<GroupEntry[] | null>(null);
  const [activePlayer, setActivePlayer] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const lockedPlayerSet = new Set(lockedSets.flat());
  const atMaxLock = lockingSelection.length >= 4;

  const generate = () => {
    setGroupError(null);
    try {
      const result = generatePlayingGroups(
        players.map((p) => p.name),
        lockedSets,
      );
      setPreview(
        result.map((g) => ({
          players: g.players,
          lockedPlayerNames: [...g.lockedPlayerNames],
        })),
      );
    } catch (e) {
      setGroupError(
        e instanceof PlayingGroupsConstraintError
          ? e.message
          : "Failed to generate groups. Please try again.",
      );
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const [, playerName] = (event.active.id as string).split("::");
    setActivePlayer(playerName);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActivePlayer(null);
    if (!preview || !event.over) return;
    const [fromGroupStr, playerName] = (event.active.id as string).split("::");
    const fromGroupIdx = parseInt(fromGroupStr, 10);
    const toId = event.over.id as string;
    if (!toId.startsWith("group-")) return;
    const toGroupIdx = parseInt(toId.replace("group-", ""), 10);
    if (fromGroupIdx === toGroupIdx) return;

    setPreview((prev) => {
      if (!prev) return prev;
      const next = prev.map((g) => ({
        ...g,
        players: [...g.players],
        lockedPlayerNames: [...g.lockedPlayerNames],
      }));
      next[fromGroupIdx].players = next[fromGroupIdx].players.filter((p) => p !== playerName);
      next[toGroupIdx].players = [...next[toGroupIdx].players, playerName];
      next[fromGroupIdx].lockedPlayerNames = next[fromGroupIdx].lockedPlayerNames.filter(
        (p) => p !== playerName,
      );
      return next;
    });
  };

  const share = () => {
    if (!preview) return;
    const text = formatGroupsForSharing(preview);
    const title = `${matchName} — Playing Groups`;
    if (navigator.share) {
      navigator.share({ title, text }).catch(() => {});
    } else {
      navigator.clipboard
        .writeText(text)
        .then(() => toast({ title: "Copied to clipboard!" }))
        .catch(() =>
          toast({ title: "Error", description: "Could not copy to clipboard", variant: "destructive" }),
        );
    }
  };

  if (players.length === 0) return null;

  return (
    <div className="mt-4 border-t border-border pt-4">
      <button
        onClick={() => setVisible((v) => !v)}
        className="flex items-center gap-2 w-full text-left py-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        data-testid="button-toggle-playing-groups"
      >
        <Users className="w-4 h-4" />
        Playing Groups
        {visible ? (
          <ChevronUp className="w-4 h-4 ml-auto" />
        ) : (
          <ChevronDown className="w-4 h-4 ml-auto" />
        )}
      </button>

      {visible && (
        <div className="space-y-4 mt-3">
          {/* Lock panel */}
          <div className="p-3 rounded-xl border border-border bg-muted/30 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Lock players together
              </p>
              {atMaxLock && (
                <p className="text-xs text-muted-foreground">Max 4 per lock</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {players.map((p) => {
                const isInLock = lockedPlayerSet.has(p.name);
                const isSelected = lockingSelection.includes(p.name);
                const isDisabled = isInLock || (atMaxLock && !isSelected);
                return (
                  <button
                    key={p.id}
                    disabled={isDisabled}
                    onClick={() => {
                      if (isSelected) {
                        setLockingSelection((sel) => sel.filter((n) => n !== p.name));
                      } else if (!isDisabled) {
                        setLockingSelection((sel) => [...sel, p.name]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                      ${isInLock ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-600 opacity-60 cursor-not-allowed" : ""}
                      ${isSelected ? "bg-primary text-primary-foreground border-primary" : ""}
                      ${!isInLock && !isSelected ? "bg-background text-foreground border-border hover:border-primary" : ""}
                      ${isDisabled && !isInLock ? "opacity-40 cursor-not-allowed" : ""}
                    `}
                    data-testid={`button-lock-player-${p.id}`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>

            {lockingSelection.length >= 2 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setLockedSets((sets) => [...sets, [...lockingSelection]]);
                  setLockingSelection([]);
                }}
                data-testid="button-confirm-lock"
              >
                <Lock className="w-3.5 h-3.5 mr-1.5" />
                Lock {lockingSelection.join(" + ")}
              </Button>
            )}

            {lockedSets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {lockedSets.map((set, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-600"
                  >
                    <Lock className="w-3 h-3 shrink-0" />
                    {set.join(" + ")}
                    <button
                      onClick={() => setLockedSets((sets) => sets.filter((_, j) => j !== i))}
                      className="ml-0.5 hover:text-red-500"
                      data-testid={`button-remove-lock-${i}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Generate / Share row */}
          <div className="flex gap-2">
            <Button
              onClick={generate}
              className="flex-1"
              data-testid="button-generate-groups"
            >
              <Shuffle className="w-4 h-4 mr-2" />
              {preview ? "Reshuffle" : "Generate Groups"}
            </Button>
            {preview && (
              <Button variant="outline" onClick={share} data-testid="button-share-groups">
                <Share2 className="w-4 h-4 mr-1" />
                Share
              </Button>
            )}
            {preview && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setPreview(null);
                  setLockedSets([]);
                  setLockingSelection([]);
                }}
                title="Clear groups"
                data-testid="button-clear-groups"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {groupError && (
            <p className="text-sm text-destructive px-1">{groupError}</p>
          )}

          {/* Groups grid — drag & drop */}
          {preview && (
            <>
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {preview.map((group, gIdx) => (
                    <DroppableGroup
                      key={gIdx}
                      groupIdx={gIdx}
                      group={group}
                      activePlayer={activePlayer}
                    />
                  ))}
                </div>
                <DragOverlay dropAnimation={null}>
                  {activePlayer && (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium bg-primary text-primary-foreground shadow-lg cursor-grabbing">
                      {activePlayer}
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
              <p className="text-xs text-center text-muted-foreground">
                Drag players between groups to adjust · {players.length} players
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
