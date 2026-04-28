import { z } from "zod";

export const routeUploadFormSchema = z.object({
  name: z.string().trim().min(1, "Please enter a route name").max(100),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  fileName: z.string().min(1, "Please select a GPX file"),
  fileContent: z.string().min(1, "Please select a GPX file"),
});

export type RouteUploadFormValues = z.infer<typeof routeUploadFormSchema>;
