import ReportForm from "@/components/ReportForm";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-md">
        <h1 className="mb-6 text-2xl font-semibold">Container Scan Report Generator</h1>
        <ReportForm />
      </div>
    </main>
  );
}
