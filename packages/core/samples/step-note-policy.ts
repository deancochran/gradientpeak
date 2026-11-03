import { activityPlanStepNoteSchema } from "../activity-plan/authoring";
import type { ActivityPlanStructure } from "../activity-plan/structure-schema";

// Explicit editorial replacements for catalog prose, never a truncation rule.
// Session-purpose sentences removed below already appear in plan descriptions.
const conciseNotes: Readonly<Record<string, string>> = {
  "Start controlled—do not sprint. Ride the hardest even effort you can sustain. At exactly 30:00, lap and record average power for this test interval only, including zeros; do not use normalized power or include warm-up/cool-down.":
    "Start controlled; hold your hardest even effort for 30 minutes. Record the result as described above.",
  "Controlled tempo repetitions that develop sustainable speed below threshold strain. Run tall and controlled; preserve the same mechanics through every repetition.":
    "Run tall at controlled tempo effort; preserve your mechanics through every repetition.",
  "Short hill surges that develop repeatable anaerobic power with full form-focused recovery. Run tall and controlled; preserve the same mechanics through every repetition.":
    "Run tall through each hill surge; preserve your mechanics through every repetition.",
  "Brief relaxed strides that sharpen coordination and leg speed without accumulating lactate. Run tall and controlled; preserve the same mechanics through every repetition.":
    "Keep strides quick and relaxed; run tall and preserve your mechanics through every repetition.",
  "Controlled pull buoy tempo repeats that reinforce a firm catch and steady pressure. Hold the prescribed effort only while stroke length and breathing remain controlled.":
    "Pull with a buoy, a firm catch and steady pressure; maintain controlled breathing and stroke length.",
  "Hard 100-metre repeats that raise aerobic power while preserving stroke length. Hold the prescribed effort only while stroke length and breathing remain controlled.":
    "Swim hard while preserving stroke length and controlled breathing.",
  "Short 50-metre efforts that develop repeatable speed with enough rest to protect technique. Hold the prescribed effort only while stroke length and breathing remain controlled.":
    "Swim fast with repeatable technique; maintain controlled breathing and stroke length.",
  "Brief 25-metre accelerations that sharpen stroke timing with complete quality recovery. Hold the prescribed effort only while stroke length and breathing remain controlled.":
    "Accelerate smoothly; preserve stroke timing, stroke length and controlled breathing.",
  "Aerobic freestyle repeats that rehearse lifting the eyes forward every six to eight strokes without breaking body line. Hold the prescribed effort only while stroke length and breathing remain controlled.":
    "Swim aerobic freestyle; sight every 6–8 strokes without breaking body line. Keep breathing and stroke length controlled.",
  "Tempo repeats that finish faster than they begin, teaching controlled pressure and a patient first half. Hold the prescribed effort only while stroke length and breathing remain controlled.":
    "Start patiently and finish faster; maintain controlled pressure, breathing and stroke length.",
  "Six 45-second stations with 15 seconds complete rest after each: burpee, mountain climbers, squat jumps, push-ups, then repeat burpee and mountain climbers (6 minutes total).":
    "6 min: burpees, mountain climbers, squat jumps, push-ups, burpees, mountain climbers; each station is 45 sec work + 15 sec complete rest.",
  "45 seconds dead bug, bird dog, bicycle crunch, then leg raise; take 15 seconds to transition after each exercise (4 minutes total). Alternate sides on dead bugs, bird dogs, and bicycle crunches.":
    "4 min: dead bug, bird dog, bicycle crunch, leg raise; 45 sec each + 15 sec transition. Alternate sides except on leg raises.",
};

/** Only for built-in source templates; never used to mutate saved user notes. */
export function catalogStepNote(instructions: string | undefined): string | undefined {
  if (!instructions) return undefined;
  const text = instructions
    .split(/\r?\n\r?\n/u)
    .filter(
      (paragraph) => !/^(?:Block context:|Interval:|Context:|Repeat context:)/u.test(paragraph),
    )
    .map((paragraph) => paragraph.replace(/^Notes:\n/u, ""))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  const note = conciseNotes[text] ?? text;
  return note ? activityPlanStepNoteSchema.parse(note) : undefined;
}

export function withCatalogStepNotes(structure: ActivityPlanStructure): ActivityPlanStructure {
  const cleanStep = (step: Extract<ActivityPlanStructure["items"][number], { type: "step" }>) => {
    const { instructions: previous, ...rest } = step;
    const instructions = catalogStepNote(previous);
    return { ...rest, ...(instructions ? { instructions } : {}) };
  };
  return {
    ...structure,
    items: structure.items.map((item) =>
      item.type === "repeat" ? { ...item, steps: item.steps.map(cleanStep) } : cleanStep(item),
    ),
  };
}
