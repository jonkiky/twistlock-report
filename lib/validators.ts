import { z } from "zod";

export const reportFormSchema = z.object({
	projectName: z.string().optional(),
	tpm: z.string().optional(),
	microserviceName: z.string().min(1, "Microservice name is required"),
	imageName: z.string().min(1, "Image name is required"),
	imageTag: z.string().min(1, "Image tag is required"),
	twistlockToken: z.string().min(1, "Twistlock token is required"),
});

export type ReportFormValues = z.infer<typeof reportFormSchema>;
