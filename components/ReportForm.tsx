"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import StatusBanner from "@/components/StatusBanner";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { reportFormSchema, type ReportFormValues } from "@/lib/validators";

type StatusState = {
	type: "success" | "error";
	message: string;
};

const fieldLabels: Array<{
	name: keyof ReportFormValues;
	label: string;
	type?: "text" | "password";
}> = [
	{ name: "projectName", label: "Project Name (optional)" },
	{ name: "tpm", label: "TPM (optional)" },
	{ name: "imageName", label: "Respository (imageName)" },
	{ name: "imageTag", label: "Image Tag" },
	{ name: "twistlockToken", label: "Twistlock Token", type: "password" },
];

export default function ReportForm() {
	const [isLoading, setIsLoading] = useState(false);
	const [status, setStatus] = useState<StatusState | null>(null);

	const form = useForm<ReportFormValues>({
		resolver: zodResolver(reportFormSchema),
		defaultValues: {
			projectName: "",
			tpm: "",
			microserviceName: "",
			imageName: "",
			imageTag: "",
			twistlockToken: "",
		},
	});

	// Sync microserviceName with imageName
	const imageName = form.watch("imageName");
	useEffect(() => {
		form.setValue("microserviceName", imageName);
	}, [imageName, form]);

	async function onSubmit(values: ReportFormValues): Promise<void> {
		setIsLoading(true);
		setStatus(null);

		try {
			const response = await fetch("/api/generate-report", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(values),
			});

			if (!response.ok) {
				let message = "An unexpected error occurred.";
				try {
					const body = (await response.json()) as { error?: string };
					message = body.error ?? message;
				} catch {
					// ignore JSON parse errors and use fallback message
				}

				setStatus({ type: "error", message });
				return;
			}

			const blob = await response.blob();
			const disposition = response.headers.get("Content-Disposition") ?? "";
			const filename = disposition.split("filename=")[1]?.replace(/"/g, "") ?? "ScanReport.docx";
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
			URL.revokeObjectURL(url);

			setStatus({ type: "success", message: `Report generated successfully: ${filename}` });
		} catch {
			setStatus({ type: "error", message: "Network error while generating report." });
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className="space-y-4">
			{status ? (
				<StatusBanner
					type={status.type}
					message={status.message}
					onDismiss={status.type === "success" ? () => setStatus(null) : undefined}
				/>
			) : null}

			<Form {...form}>
				<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
					{fieldLabels.map((field) => (
						<FormField
							key={field.name}
							control={form.control}
							name={field.name}
							render={({ field: controllerField }) => (
								<FormItem>
									<FormLabel>{field.label}</FormLabel>
									<FormControl>
										<Input
											type={field.type ?? "text"}
											autoComplete="off"
											disabled={isLoading}
											{...controllerField}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					))}

					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading ? "Generating..." : "Generate Report"}
					</Button>
				</form>
			</Form>
		</div>
	);
}
