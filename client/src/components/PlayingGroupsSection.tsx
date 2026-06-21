import { useState, useEffect, useRef, useMemo, type CSSProperties } from "react";
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
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  generatePlayingGroups,
  formatGroupsForSharing,
  PlayingGroupsConstraintError,
  computeCartCount,
} from "@shared/playingGroups";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Users,
  Shuffle,
  Share2,
  Copy,
  Flag,
  Lock,
  X,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Merge,
  Plus,
  UserPlus,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Player {
  id: number;
  name: string;
}

interface CartEntry {
  players: string[];
  isMerged?: boolean;
}

interface GroupEntry {
  id: string;
  players: string[];
  lockedPlayerNames: string[];
}

function makeGroupId(): string {
  return `grp-${Math.random().toString(36).slice(2, 9)}`;
}

const STORAGE_KEY_PREFIX = "playing-groups-v1-";

interface PersistedGroups {
  playerIds: number[];
  carts: CartEntry[];
  preview: GroupEntry[] | null;
  cartsPanelOpen: boolean;
}

function loadPersistedGroups(matchId: number, players: Player[]): PersistedGroups | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${matchId}`);
    if (!raw) return null;
    const parsed: PersistedGroups = JSON.parse(raw);
    // Persistence contract: we guard the restore with a strict player-ID set
    // comparison. If the roster changes (player added or removed from the match),
    // the stored state is discarded and the section resets to a clean slate.
    // This is intentional — a changed roster would make the stored group
    // assignments stale (e.g. referencing a player who is no longer in the match).
    const currentIds = [...players.map((p) => p.id)].sort((a, b) => a - b);
    const storedIds = [...(parsed.playerIds ?? [])].sort((a, b) => a - b);
    if (JSON.stringify(currentIds) !== JSON.stringify(storedIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedGroups(
  matchId: number,
  players: Player[],
  carts: CartEntry[],
  preview: GroupEntry[] | null,
  cartsPanelOpen: boolean,
) {
  try {
    const data: PersistedGroups = {
      playerIds: [...players.map((p) => p.id)].sort((a, b) => a - b),
      carts,
      preview,
      cartsPanelOpen,
    };
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${matchId}`, JSON.stringify(data));
  } catch {
  }
}

function DraggablePoolChip({ name }: { name: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `pool::${name}`,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border cursor-grab active:cursor-grabbing select-none touch-none transition-opacity bg-background text-foreground border-border hover:border-primary ${isDragging ? "opacity-20" : "opacity-100"}`}
      data-testid={`chip-pool-${name}`}
    >
      {name}
    </div>
  );
}

function CartPlayerChip({
  cartIdx,
  name,
  onRemove,
}: {
  cartIdx: number;
  name: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `seat::${cartIdx}::${name}`,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium border cursor-grab active:cursor-grabbing select-none touch-none bg-background text-foreground border-border transition-opacity ${isDragging ? "opacity-20" : "opacity-100"}`}
      data-testid={`chip-cart-${cartIdx}-${name}`}
    >
      <span>{name}</span>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 rounded-full hover:bg-muted p-0.5"
        data-testid={`button-remove-cart-${cartIdx}-${name}`}
      >
        <X className="w-2.5 h-2.5 text-muted-foreground" />
      </button>
    </div>
  );
}

function DraggableGroupChip({
  groupId,
  name,
  isLocked,
  onRemove,
}: {
  groupId: string;
  name: string;
  isLocked: boolean;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `gplayer::${groupId}::${name}`,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1 ${onRemove ? "pl-2.5 pr-1" : "px-2.5"} py-1 rounded-full text-xs font-medium border cursor-grab active:cursor-grabbing select-none touch-none transition-opacity ${isLocked ? "bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700" : "bg-background text-foreground border-border"} ${isDragging ? "opacity-20" : "opacity-100"}`}
      data-testid={`chip-group-${groupId}-${name}`}
    >
      {isLocked && <Lock className="w-3 h-3 shrink-0" />}
      <span>{name}</span>
      {onRemove && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full hover:bg-muted p-0.5"
          data-testid={`button-remove-group-player-${groupId}-${name}`}
        >
          <X className="w-2.5 h-2.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

function DraggablePreviewPoolChip({ name }: { name: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `gplayer::__pool__::${name}`,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border cursor-grab active:cursor-grabbing select-none touch-none transition-opacity bg-background text-foreground border-border hover:border-primary ${isDragging ? "opacity-20" : "opacity-100"}`}
      data-testid={`chip-preview-pool-${name}`}
    >
      {name}
    </div>
  );
}

function PreviewUnassignedPool({ players }: { players: string[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: "preview-pool" });
  if (players.length === 0) return null;
  return (
    <div
      ref={setNodeRef}
      className={`p-3 rounded-xl border-2 border-dashed transition-colors ${isOver ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}
      data-testid="preview-unassigned-pool"
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Unassigned Players
      </p>
      <div className="flex flex-wrap gap-1.5 min-h-8">
        {players.map((name) => (
          <DraggablePreviewPoolChip key={name} name={name} />
        ))}
      </div>
    </div>
  );
}

function UnassignedPool({ players }: { players: Player[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool" });
  return (
    <div
      ref={setNodeRef}
      className={`p-3 rounded-xl border-2 border-dashed transition-colors ${isOver ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}
      data-testid="unassigned-pool"
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Unassigned Players
      </p>
      <div className="flex flex-wrap gap-1.5 min-h-8">
        {players.map((p) => (
          <DraggablePoolChip key={p.id} name={p.name} />
        ))}
        {players.length === 0 && (
          <p className="text-xs text-muted-foreground/60 italic">
            All players assigned to carts
          </p>
        )}
      </div>
    </div>
  );
}

function CartSlotCard({
  cartIdx,
  cart,
  activeDragId,
  onRemovePlayer,
}: {
  cartIdx: number;
  cart: CartEntry;
  activeDragId: string | null;
  onRemovePlayer: (cartIdx: number, playerName: string) => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `cartseat::${cartIdx}` });
  const {
    attributes: handleAttrs,
    listeners: handleListeners,
    setNodeRef: setDragRef,
    isDragging: isCartDragging,
  } = useDraggable({ id: `cartcard::${cartIdx}` });

  const isDraggingPlayer =
    activeDragId !== null && !activeDragId.startsWith("cartcard::");
  const isDraggingCart =
    activeDragId !== null && activeDragId.startsWith("cartcard::");
  const thisCartIsBeingDragged = activeDragId === `cartcard::${cartIdx}`;

  return (
    <div
      ref={setDragRef}
      className={`transition-opacity ${thisCartIsBeingDragged ? "opacity-30" : "opacity-100"}`}
      data-testid={`cart-slot-${cartIdx}`}
    >
      <Card
        ref={setDropRef}
        className={`transition-colors h-full ${isOver && isDraggingPlayer ? "border-primary ring-1 ring-primary bg-primary/5" : ""} ${isOver && isDraggingCart ? "border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" : ""} ${cart.isMerged ? "border-emerald-400 dark:border-emerald-600 bg-emerald-50/30 dark:bg-emerald-900/10" : ""}`}
      >
        <CardHeader className="pb-1 pt-2 px-3">
          <div className="flex items-center gap-1.5">
            {cart.isMerged ? (
              <>
                <Merge className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  Merged
                </span>
              </>
            ) : (
              <span className="text-[10px] font-medium text-muted-foreground/70">
                Cart {cartIdx + 1}
              </span>
            )}
            <div
              {...handleAttrs}
              {...handleListeners}
              className="ml-auto cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted touch-none"
              title="Drag to merge with another cart"
              data-testid={`cart-drag-handle-${cartIdx}`}
            >
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex flex-wrap gap-1.5 min-h-10 items-start content-start">
            {cart.players.map((name) => (
              <CartPlayerChip
                key={name}
                cartIdx={cartIdx}
                name={name}
                onRemove={() => onRemovePlayer(cartIdx, name)}
              />
            ))}
            {cart.players.length === 0 && (
              <span className="text-xs text-muted-foreground/60 italic self-center">
                {isDraggingPlayer ? "Drop here" : "Empty"}
              </span>
            )}
            {cart.players.length === 1 && !cart.isMerged && (
              <div className="px-2 py-1 rounded-full text-xs border-2 border-dashed border-muted-foreground/30 text-muted-foreground/50 italic">
                + 1 seat
              </div>
            )}
            {isDraggingCart && !thisCartIsBeingDragged && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 italic self-center">
                Drop to merge
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SortableGroupCard({
  group,
  groupIndex,
  ungroupedPlayers,
  onAddPlayer,
  onDelete,
  onRemovePlayer,
  activePlayerId,
}: {
  group: GroupEntry;
  groupIndex: number;
  ungroupedPlayers: string[];
  onAddPlayer: (groupId: string, playerName: string) => void;
  onDelete: (groupId: string) => void;
  onRemovePlayer: (groupId: string, playerName: string) => void;
  activePlayerId: string | null;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging, isOver } =
    useSortable({ id: group.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const [showAdd, setShowAdd] = useState(false);
  const [addInput, setAddInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lockedSet = new Set(group.lockedPlayerNames);

  const filteredSuggestions = ungroupedPlayers.filter(
    (p) => !addInput || p.toLowerCase().includes(addInput.toLowerCase()),
  );

  const handleAdd = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddPlayer(group.id, trimmed);
    setAddInput("");
    setShowAdd(false);
  };

  useEffect(() => {
    if (showAdd && inputRef.current) inputRef.current.focus();
  }, [showAdd]);

  const playerBeingDropped =
    isOver && activePlayerId !== null && activePlayerId.startsWith("gplayer::");

  return (
    <div ref={setNodeRef} style={style} data-testid={`sortable-group-${group.id}`}>
      <Card
        className={`transition-colors h-full ${playerBeingDropped ? "border-primary ring-1 ring-primary bg-primary/5" : ""}`}
      >
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted touch-none shrink-0"
              title="Drag to reorder group"
              data-testid={`group-drag-handle-${group.id}`}
            >
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
            </div>
            <Flag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span>Group {groupIndex + 1}</span>
            <Badge variant="outline" className="ml-auto text-xs font-normal shrink-0">
              {group.players.length}p
            </Badge>
            {group.players.length === 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(group.id);
                }}
                className="shrink-0 rounded p-0.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Remove empty group"
                data-testid={`button-delete-group-${group.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAdd((v) => !v);
                setAddInput("");
              }}
              className="shrink-0 rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Add player to group"
              data-testid={`button-add-player-${group.id}`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-2">
          <div className="flex flex-wrap gap-1.5 min-h-8">
            {group.players.map((name) => (
              <DraggableGroupChip
                key={name}
                groupId={group.id}
                name={name}
                isLocked={lockedSet.has(name)}
                onRemove={() => onRemovePlayer(group.id, name)}
              />
            ))}
          </div>

          {showAdd && (
            <div className="border border-border rounded-lg p-2 space-y-1.5 bg-muted/30">
              <div className="flex gap-1">
                <Input
                  ref={inputRef}
                  placeholder="Player name…"
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const first = filteredSuggestions[0] ?? addInput;
                      if (first) handleAdd(first);
                    }
                    if (e.key === "Escape") {
                      setShowAdd(false);
                      setAddInput("");
                    }
                  }}
                  className="h-7 text-xs"
                  data-testid={`input-add-player-${group.id}`}
                />
                <Button
                  size="sm"
                  className="h-7 px-2"
                  disabled={!addInput.trim() && filteredSuggestions.length === 0}
                  onClick={() => handleAdd(filteredSuggestions[0] ?? addInput)}
                  data-testid={`button-confirm-add-${group.id}`}
                >
                  <UserPlus className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => {
                    setShowAdd(false);
                    setAddInput("");
                  }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              {filteredSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {filteredSuggestions.map((name) => (
                    <button
                      key={name}
                      onClick={() => handleAdd(name)}
                      className="px-2 py-0.5 rounded-full text-xs border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                      data-testid={`suggestion-add-${name}`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
              {filteredSuggestions.length === 0 && addInput.trim() && (
                <p className="text-xs text-muted-foreground">
                  Press Enter to add "{addInput.trim()}" as a new player
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PlayingGroupsSection({
  players,
  matchName,
  matchId,
}: {
  players: Player[];
  matchName: string;
  matchId: number;
}) {
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [carts, setCarts] = useState<CartEntry[]>([]);
  const [preview, setPreview] = useState<GroupEntry[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [cartsPanelOpen, setCartsPanelOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // Stable signature of the current player roster (sorted IDs joined).
  // Changes when players are added or removed.
  const playerSig = useMemo(
    () => [...players.map((p) => p.id)].sort((a, b) => a - b).join(","),
    [players],
  );

  // Tracks the match+roster context that was last synced so we can detect
  // changes across renders (matchId switch, player add/remove) and avoid
  // restoring stale data when players prop arrives asynchronously.
  const syncedContextRef = useRef<{ matchId: number; playerSig: string } | null>(null);

  // Hydrate from localStorage on mount and whenever matchId or player roster
  // changes. Skips when players haven't loaded yet (empty roster).
  useEffect(() => {
    if (players.length === 0) return;

    const prev = syncedContextRef.current;
    const unchanged = prev?.matchId === matchId && prev?.playerSig === playerSig;
    if (unchanged) return;

    syncedContextRef.current = { matchId, playerSig };

    const persisted = loadPersistedGroups(matchId, players);
    if (persisted) {
      setCarts(persisted.carts);
      setPreview(persisted.preview);
      setCartsPanelOpen(persisted.cartsPanelOpen);
    } else {
      // New match or roster changed — start fresh
      setCarts([]);
      setPreview(null);
      setCartsPanelOpen(false);
    }
  }, [matchId, playerSig]);

  // Save to localStorage whenever the relevant state changes.
  useEffect(() => {
    if (players.length === 0) return;
    savePersistedGroups(matchId, players, carts, preview, cartsPanelOpen);
  }, [carts, preview, cartsPanelOpen, matchId, playerSig]);

  useEffect(() => {
    if (visible && !preview && carts.length === 0) {
      const count = computeCartCount(players.length);
      setCarts(Array.from({ length: count }, () => ({ players: [] })));
    }
  }, [visible]);

  const assignedInCarts = new Set(carts.flatMap((c) => c.players));
  const unassignedPool = players.filter((p) => !assignedInCarts.has(p.name));

  const generate = () => {
    setGroupError(null);
    const lockedSets = carts
      .filter((c) => c.players.length >= 2)
      .map((c) => c.players);
    try {
      const result = generatePlayingGroups(
        players.map((p) => p.name),
        lockedSets,
      );
      setPreview(
        result.map((g) => ({
          id: makeGroupId(),
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

  const reset = () => {
    setPreview(null);
    setGroupError(null);
    const count = computeCartCount(players.length);
    setCarts(Array.from({ length: count }, () => ({ players: [] })));
  };

  const removeFromCart = (cartIdx: number, playerName: string) => {
    setCarts((prev) => {
      const next = prev.map((c) => ({ ...c, players: [...c.players] }));
      next[cartIdx].players = next[cartIdx].players.filter((p) => p !== playerName);
      return next;
    });
  };

  const handleCartDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleCartDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (!event.over) return;
    const activeStr = event.active.id as string;
    const overStr = event.over.id as string;

    if (activeStr.startsWith("cartcard::")) {
      if (!overStr.startsWith("cartseat::")) return;
      const fromIdx = parseInt(activeStr.split("::")[1], 10);
      const toIdx = parseInt(overStr.split("::")[1], 10);
      if (fromIdx === toIdx) return;
      const fromCart = carts[fromIdx];
      const toCart = carts[toIdx];
      if (!fromCart || fromCart.players.length === 0) return;
      const mergedCount = toCart.players.length + fromCart.players.length;
      if (mergedCount > 4) {
        toast({
          title: "Too many players in one group",
          description: `Merging these carts would create a group of ${mergedCount}. Maximum is 4 players per pre-group.`,
          variant: "destructive",
        });
        return;
      }
      setCarts((prev) => {
        const next = prev.map((c) => ({ ...c, players: [...c.players] }));
        const merged: CartEntry = {
          players: [...next[toIdx].players, ...next[fromIdx].players],
          isMerged: true,
        };
        next[toIdx] = merged;
        next.splice(fromIdx, 1);
        return next;
      });
      return;
    }

    let playerName: string;
    let fromCartIdx: number | null = null;

    if (activeStr.startsWith("pool::")) {
      playerName = activeStr.slice(6);
    } else if (activeStr.startsWith("seat::")) {
      const parts = activeStr.split("::");
      fromCartIdx = parseInt(parts[1], 10);
      playerName = parts[2];
    } else {
      return;
    }

    if (overStr === "pool") {
      if (fromCartIdx !== null) {
        setCarts((prev) => {
          const next = prev.map((c) => ({ ...c, players: [...c.players] }));
          next[fromCartIdx!].players = next[fromCartIdx!].players.filter((p) => p !== playerName);
          return next;
        });
      }
      return;
    }

    if (overStr.startsWith("cartseat::")) {
      const toIdx = parseInt(overStr.split("::")[1], 10);
      setCarts((prev) => {
        const next = prev.map((c) => ({ ...c, players: [...c.players] }));
        const maxSeats = next[toIdx]?.isMerged ? 4 : 2;

        if (fromCartIdx !== null && fromCartIdx === toIdx) return prev;
        if (fromCartIdx !== null) {
          next[fromCartIdx].players = next[fromCartIdx].players.filter((p) => p !== playerName);
        }

        const dest = next[toIdx];
        if (!dest || dest.players.includes(playerName)) return next;

        if (dest.players.length >= maxSeats) {
          const displaced = dest.players[dest.players.length - 1];
          dest.players = [...dest.players.slice(0, maxSeats - 1), playerName];
          if (fromCartIdx !== null) {
            next[fromCartIdx].players.push(displaced);
          }
        } else {
          dest.players = [...dest.players, playerName];
        }

        return next;
      });
    }
  };

  const groupIds = preview ? preview.map((g) => g.id) : [];

  const handleGroupDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleGroupDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (!preview || !event.over) return;
    const activeStr = event.active.id as string;
    const overStr = event.over.id as string;

    if (activeStr.startsWith("gplayer::")) {
      const parts = activeStr.split("::");
      const fromGroupId = parts[1];
      const playerName = parts[2];

      // Dropping a group player onto the preview-pool → remove from group
      if (overStr === "preview-pool") {
        if (fromGroupId === "__pool__") return;
        setPreview((prev) => {
          if (!prev) return prev;
          return prev.map((g) =>
            g.id === fromGroupId
              ? {
                  ...g,
                  players: g.players.filter((p) => p !== playerName),
                  lockedPlayerNames: g.lockedPlayerNames.filter((p) => p !== playerName),
                }
              : g,
          );
        });
        return;
      }

      const toGroupId = overStr;
      if (fromGroupId === toGroupId) return;

      setPreview((prev) => {
        if (!prev) return prev;
        const toIdx = prev.findIndex((g) => g.id === toGroupId);
        if (toIdx === -1) return prev;

        // Dragging from pool → just add to target group (pool is auto-computed)
        if (fromGroupId === "__pool__") {
          const next = prev.map((g) => ({ ...g, players: [...g.players], lockedPlayerNames: [...g.lockedPlayerNames] }));
          if (!next[toIdx].players.includes(playerName)) {
            next[toIdx].players = [...next[toIdx].players, playerName];
          }
          return next;
        }

        // Dragging from one group to another
        const fromIdx = prev.findIndex((g) => g.id === fromGroupId);
        if (fromIdx === -1) return prev;
        const next = prev.map((g) => ({
          ...g,
          players: [...g.players],
          lockedPlayerNames: [...g.lockedPlayerNames],
        }));
        next[fromIdx].players = next[fromIdx].players.filter((p) => p !== playerName);
        next[fromIdx].lockedPlayerNames = next[fromIdx].lockedPlayerNames.filter(
          (p) => p !== playerName,
        );
        if (!next[toIdx].players.includes(playerName)) {
          next[toIdx].players = [...next[toIdx].players, playerName];
        }
        return next;
      });
      return;
    }

    const fromIdx = preview.findIndex((g) => g.id === activeStr);
    const toIdx = preview.findIndex((g) => g.id === overStr);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    setPreview((prev) => (prev ? arrayMove(prev, fromIdx, toIdx) : prev));
  };

  const deleteGroup = (groupId: string) => {
    setPreview((prev) => (prev ? prev.filter((g) => g.id !== groupId) : prev));
  };

  const addPlayerToGroup = (groupId: string, playerName: string) => {
    setPreview((prev) => {
      if (!prev) return prev;
      return prev.map((g) =>
        g.id === groupId && !g.players.includes(playerName)
          ? { ...g, players: [...g.players, playerName] }
          : g,
      );
    });
  };

  const removePlayerFromGroup = (groupId: string, playerName: string) => {
    setPreview((prev) => {
      if (!prev) return prev;
      return prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              players: g.players.filter((p) => p !== playerName),
              lockedPlayerNames: g.lockedPlayerNames.filter((p) => p !== playerName),
            }
          : g,
      );
    });
  };

  // Unassigned-pool persistence contract:
  // The unassigned pool is intentionally NOT stored as a separate field in
  // localStorage. Instead it is derived at render time as the set of all match
  // players whose names do not appear in any `preview` group. Because `preview`
  // IS persisted, the pool is implicitly preserved across page reloads:
  //   1. User removes player X from a group  → X disappears from preview groups
  //   2. State saved  → preview (without X in any group) written to localStorage
  //   3. User refreshes → preview restored → ungroupedPlayers includes X again ✓
  // The playerIds guard in loadPersistedGroups ensures this derivation is only
  // applied when the roster matches, so there is no silent re-appearance risk
  // caused by a stale preview referencing a different roster.
  const ungroupedPlayers = preview
    ? players
        .map((p) => p.name)
        .filter((name) => !preview.some((g) => g.players.includes(name)))
    : [];

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
          toast({
            title: "Error",
            description: "Could not copy to clipboard",
            variant: "destructive",
          }),
        );
    }
  };

  const copyPairings = () => {
    const filledCarts = carts.filter((c) => c.players.length > 0);
    const text = filledCarts
      .map((c, i) => `Cart ${i + 1}: ${c.players.join(", ")}`)
      .join("\n");
    const title = `${matchName} — Cart Pairings`;
    if (navigator.share) {
      navigator.share({ title, text }).catch(() => {});
    } else {
      navigator.clipboard
        .writeText(text)
        .then(() => toast({ title: "Copied to clipboard!" }))
        .catch(() =>
          toast({
            title: "Error",
            description: "Could not copy to clipboard",
            variant: "destructive",
          }),
        );
    }
  };

  const activePlayerName =
    activeId?.startsWith("pool::") ? activeId.slice(6)
    : activeId?.startsWith("seat::") ? activeId.split("::")[2]
    : activeId?.startsWith("gplayer::") ? activeId.split("::")[2]
    : null;

  const activeCartLabel =
    activeId?.startsWith("cartcard::")
      ? (() => {
          const idx = parseInt(activeId.split("::")[1], 10);
          const cart = carts[idx];
          return cart
            ? `Cart ${idx + 1}${cart.players.length ? ": " + cart.players.join(" + ") : ""}`
            : null;
        })()
      : null;

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
          {preview && (
            <button
              onClick={() => setCartsPanelOpen((v) => !v)}
              className="flex items-center gap-2 w-full text-left py-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-toggle-cart-pairings"
            >
              <Merge className="w-3.5 h-3.5" />
              Cart Pairings
              {cartsPanelOpen ? (
                <ChevronUp className="w-3.5 h-3.5 ml-auto" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 ml-auto" />
              )}
            </button>
          )}

          {(!preview || cartsPanelOpen) && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleCartDragStart}
              onDragEnd={handleCartDragEnd}
            >
              <div className="space-y-3">
                <UnassignedPool players={unassignedPool} />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                    Cart Pairings
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Drag players into carts · Drag a cart's{" "}
                    <GripVertical className="inline w-3 h-3" /> handle onto another cart to merge
                    into a pre-group
                  </p>
                  <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                    {carts.map((cart, idx) => (
                      <CartSlotCard
                        key={idx}
                        cartIdx={idx}
                        cart={cart}
                        activeDragId={activeId}
                        onRemovePlayer={removeFromCart}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <DragOverlay dropAnimation={null}>
                {activePlayerName && (
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-primary-foreground shadow-lg cursor-grabbing">
                    {activePlayerName}
                  </div>
                )}
                {activeCartLabel && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white shadow-lg cursor-grabbing opacity-80">
                    <Merge className="w-3 h-3" />
                    {activeCartLabel}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}

          <div className="flex gap-2">
            <Button onClick={generate} className="flex-1" data-testid="button-generate-groups">
              <Shuffle className="w-4 h-4 mr-2" />
              {preview ? "Reshuffle" : "Generate Groups"}
            </Button>
            {carts.some((c) => c.players.length > 0) && !preview && (
              <Button variant="outline" onClick={copyPairings} data-testid="button-copy-pairings">
                <Copy className="w-4 h-4 mr-1" />
                Copy Pairings
              </Button>
            )}
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
                onClick={reset}
                title="Clear groups"
                data-testid="button-clear-groups"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {groupError && <p className="text-sm text-destructive px-1">{groupError}</p>}

          {preview && (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleGroupDragStart}
                onDragEnd={handleGroupDragEnd}
              >
                <PreviewUnassignedPool players={ungroupedPlayers} />
                <SortableContext items={groupIds} strategy={rectSortingStrategy}>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {preview.map((group, idx) => (
                      <SortableGroupCard
                        key={group.id}
                        group={group}
                        groupIndex={idx}
                        ungroupedPlayers={ungroupedPlayers}
                        onAddPlayer={addPlayerToGroup}
                        onDelete={deleteGroup}
                        onRemovePlayer={removePlayerFromGroup}
                        activePlayerId={activeId}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activeId && !activeId.startsWith("gplayer::") && (
                    <div className="opacity-80">
                      <Card className="shadow-lg border-primary">
                        <CardHeader className="pb-2 pt-3 px-3">
                          <CardTitle className="text-sm flex items-center gap-1.5">
                            <Flag className="w-3.5 h-3.5 text-muted-foreground" />
                            Group
                          </CardTitle>
                        </CardHeader>
                      </Card>
                    </div>
                  )}
                  {activePlayerName && activeId?.startsWith("gplayer::") && (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-primary-foreground shadow-lg cursor-grabbing">
                      {activePlayerName}
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
              <p className="text-xs text-center text-muted-foreground">
                Drag{" "}
                <GripVertical className="inline w-3 h-3" /> handles to reorder groups · Drag player
                chips between groups to adjust · {players.length} players
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
