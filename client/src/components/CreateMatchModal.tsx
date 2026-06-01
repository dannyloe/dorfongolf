import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateMatch, useCourses, useGroups, useCreateGroup } from "@/hooks/use-matches";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { X, Trophy, MapPin, Users, Plus } from "lucide-react";
import { insertMatchSchema } from "@shared/schema";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RyderCupContext {
  eventId: number;
  dayNumber: number;
  courseName?: string;
  courseId?: number;
}

interface CreateMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  ryderCupContext?: RyderCupContext;
}

const formSchema = insertMatchSchema.pick({ name: true, courseName: true }).extend({
  name: z.string().optional(),
  groupId: z.number().nullable().optional(),
  ryderCupEventId: z.number().nullable().optional(),
  ryderCupDayNumber: z.number().nullable().optional(),
  courseId: z.number().nullable().optional(),
});
type FormData = z.infer<typeof formSchema>;

export function CreateMatchModal({ isOpen, onClose, ryderCupContext }: CreateMatchModalProps) {
  const [, setLocation] = useLocation();
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: ryderCupContext ? `Day ${ryderCupContext.dayNumber} Side Match` : "",
      courseName: ryderCupContext?.courseName || "",
      groupId: null,
    },
  });

  const selectedGroupId = watch("groupId");
  const createMatch = useCreateMatch();
  const { data: courses } = useCourses();
  const { data: groups } = useGroups();
  const createGroup = useCreateGroup();

  useEffect(() => {
    if (isOpen) {
      reset({
        name: ryderCupContext ? `Day ${ryderCupContext.dayNumber} Side Match` : "",
        courseName: ryderCupContext?.courseName || "",
        groupId: null,
      });
      setShowNewGroupInput(false);
      setNewGroupName("");
    }
  }, [isOpen, ryderCupContext, reset]);

  const handleAddNewGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const newGroup = await createGroup.mutateAsync(newGroupName.trim());
      setValue("groupId", newGroup.id);
      setNewGroupName("");
      setShowNewGroupInput(false);
    } catch (err) {
      console.error("Failed to create group:", err);
    }
  };

  const onSubmit = (data: FormData) => {
    const matchData = {
      ...data,
      ...(ryderCupContext && {
        ryderCupEventId: ryderCupContext.eventId,
        ryderCupDayNumber: ryderCupContext.dayNumber,
        courseId: ryderCupContext.courseId,
      }),
    };

    createMatch.mutate(matchData, {
      onSuccess: (newMatch) => {
        reset();
        setShowNewGroupInput(false);
        setNewGroupName("");
        if (ryderCupContext) {
          queryClient.invalidateQueries({
            queryKey: ["/api/ryder-cup", String(ryderCupContext.eventId), "matches"]
          });
        }
        onClose();
        setLocation(`/match/${newMatch.id}`);
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="p-6 border-b border-border/50 bg-primary/5">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-display text-primary flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              {ryderCupContext ? "Add Side Match" : "New Event"}
            </DialogTitle>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground/80">
              Event Name <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              {...register("name")}
              placeholder="Leave blank to use date only"
              className="input-field"
            />
            {errors.name && (
              <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground/80">Course Name</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <select
                {...register("courseName")}
                className="input-field pl-10 appearance-none cursor-pointer"
                data-testid="select-course-name"
              >
                <option value="">Select a course...</option>
                {courses?.map((course) => (
                  <option key={course.id} value={course.name}>{course.name}</option>
                ))}
              </select>
            </div>
            {errors.courseName && (
              <p className="text-sm text-destructive mt-1">{errors.courseName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground/80">Group (Optional)</label>
            {!showNewGroupInput ? (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <select
                    value={selectedGroupId ?? ""}
                    onChange={(e) => setValue("groupId", e.target.value ? parseInt(e.target.value) : null)}
                    className="input-field pl-10 appearance-none cursor-pointer w-full"
                    data-testid="select-group"
                  >
                    <option value="">No group</option>
                    {groups?.map((group: { id: number; name: string }) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewGroupInput(true)}
                  className="px-3 py-2 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors"
                  title="Add new group"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Enter group name..."
                  className="input-field flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddNewGroup();
                    } else if (e.key === "Escape") {
                      setShowNewGroupInput(false);
                      setNewGroupName("");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddNewGroup}
                  disabled={!newGroupName.trim() || createGroup.isPending}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
                >
                  {createGroup.isPending ? "..." : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewGroupInput(false);
                    setNewGroupName("");
                  }}
                  className="px-3 py-2 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl font-semibold text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMatch.isPending}
              className="flex-1 btn-primary"
            >
              {createMatch.isPending ? "Creating..." : "Create Event"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
