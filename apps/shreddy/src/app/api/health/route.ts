import { NextResponse } from "next/server";
import { checkDependencies } from "@/lib/check-deps";

export async function GET() {
  const deps = await checkDependencies();
  const allRequired = deps.filter((d) => d.required);
  const healthy = allRequired.every((d) => d.installed);

  return NextResponse.json({
    healthy,
    dependencies: deps,
  });
}
