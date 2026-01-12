import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateMatch, useCourses, useGroups, useCreateGroup } from "@/hooks/use-matches";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trophy, MapPin, Users, Plus } from "lucide-react";
import { insertMatchSchema } from "@shared/schema";
import { format } from "date-fns";
import { useState } from "react";

interface CreateMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Frontend validation schema - name is optional
const formSchema = insertMatchSchema.pick({ name: true, courseName: true }).extend({
  name: z.string().optional(),
  groupId: z.number().nullable().optional(),
});
type FormData = z.infer<typeof formSchema>;

export function CreateMatchModal({ isOpen, onClose }: CreateMatchModalProps) {
  const [, setLocation] = useLocation();
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      courseName: "",
      groupId: null,
    },
  });

  const selectedGroupId = watch("groupId");
  const createMatch = useCreateMatch();
  const { data: courses } = useCourses();
  const { data: groups } = useGroups();
  const createGroup = useCreateGroup();

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
    createMatch.mutate(data, {
      onSuccess: (newMatch) => {
        reset();
        setShowNewGroupInput(false);
        setNewGroupName("");
        onClose();
        setLocation(`/match/${newMatch.id}`);
      },
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            {/* Modal */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-border/50 flex justify-between items-center bg-primary/5">
                <h2 className="text-xl font-bold font-display text-primary flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  New Event
                </h2>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors text-muted-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
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
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
