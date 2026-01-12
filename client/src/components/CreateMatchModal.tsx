import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateMatch, useCourses } from "@/hooks/use-matches";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trophy, MapPin } from "lucide-react";
import { insertMatchSchema } from "@shared/schema";
import { format } from "date-fns";

interface CreateMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Frontend validation schema
const formSchema = insertMatchSchema.pick({ name: true, courseName: true });
type FormData = z.infer<typeof formSchema>;

export function CreateMatchModal({ isOpen, onClose }: CreateMatchModalProps) {
  const [, setLocation] = useLocation();
  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: format(new Date(), "MMMM d, yyyy"),
      courseName: "",
    },
  });

  const createMatch = useCreateMatch();
  const { data: courses } = useCourses();

  const onSubmit = (data: FormData) => {
    createMatch.mutate(data, {
      onSuccess: (newMatch) => {
        reset();
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
                  <label className="text-sm font-semibold text-foreground/80">Event Name</label>
                  <input
                    {...register("name")}
                    placeholder="e.g. Sunday Morning Round"
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
