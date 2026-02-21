import { notFound } from "next/navigation";
import Image from "next/image";
import { getAllCounselors } from "@/lib/counselors";
import SearchBar from "@/components/SearchBar";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ secret: string }>;
}) {
  const { secret } = await params;

  if (secret !== process.env.DASHBOARD_SECRET) {
    notFound();
  }

  const counselors = await getAllCounselors();

  const counselorOptions = counselors.map((c) => ({
    companyName: c.companyName,
    slug: c.slug,
    counselorId: c.counselorId,
    poc: c.poc,
    followUpStatus: c.followUpStatus,
  }));

  return (
    <div className="min-h-screen bg-rise-cream flex flex-col items-center justify-center px-4">
      <div className="text-center mb-10">
        <Image
          src="/rise-logo.png"
          alt="RISE Logo"
          width={80}
          height={80}
          className="mx-auto mb-6 object-contain"
        />
        <h1 className="text-3xl font-bold text-rise-black font-heading">
          Partner Dashboard
        </h1>
        <p className="text-rise-brown mt-2">
          Search for a counselor partner to view their pipeline.
        </p>
      </div>
      <SearchBar counselors={counselorOptions} />
    </div>
  );
}
