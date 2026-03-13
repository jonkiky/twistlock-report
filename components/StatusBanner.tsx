"use client";

import { useEffect } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";

type StatusBannerProps = {
	type: "success" | "error";
	message: string;
	onDismiss?: () => void;
};

export default function StatusBanner({ type, message, onDismiss }: StatusBannerProps) {
	useEffect(() => {
		if (type !== "success" || !onDismiss) {
			return;
		}

		const timeoutId = window.setTimeout(onDismiss, 5 * 60 * 1000);
		return () => window.clearTimeout(timeoutId);
	}, [type, onDismiss]);

	const styles =
		type === "success"
			? "border-green-200 bg-green-50 text-green-900"
			: "border-red-200 bg-red-50 text-red-900";

	return (
		<Alert className={styles}>
			<AlertDescription>{message}</AlertDescription>
		</Alert>
	);
}
