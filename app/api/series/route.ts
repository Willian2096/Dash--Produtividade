import { NextRequest, NextResponse } from "next/server";
import {
  getContext,
  getOpenDealsForPipelineCached,
  getActivitiesInRange,
  getWonDealsForPipeline,
  getLostDealsForPipeline,
  buildDealIdsInPipeline,
  computeMetrics,
} from "@/lib/pipedrive";
import { buildBuckets } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const granularity = (searchParams.get("granularity") || "day") as "day" | "week" | "month";
    const anchor = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const count = Number(searchParams.get("count") || (granularity === "day" ? 10 : granularity === "week" ? 6 : 3));

    const buckets = buildBuckets(granularity, count, anchor);
    const overallStart = buckets[0].start;
    const overallEnd = buckets[buckets.length - 1].end;

    const baseCtx = await getContext();
    const userIds = [baseCtx.userId, baseCtx.ownerUserId].filter((v): v is number => !!v);
    const [activities, wonDeals, lostDeals, openDeals] = await Promise.all([
      getActivitiesInRange(userIds, overallStart, overallEnd),
      baseCtx.pipelineId ? getWonDealsForPipeline(baseCtx.pipelineId) : Promise.resolve([]),
      baseCtx.pipelineId ? getLostDealsForPipeline(baseCtx.pipelineId) : Promise.resolve([]),
      baseCtx.pipelineId ? getOpenDealsForPipelineCached(baseCtx.pipelineId) : Promise.resolve([]),
    ]);
    const dealIdsInPipeline = buildDealIdsInPipeline(openDeals, wonDeals, lostDeals);

    const ctx = { ...baseCtx, dealIdsInPipeline };
    const series = buckets.map((b) => ({ label: b.label, ...computeMetrics(ctx, activities, wonDeals, b.start, b.end) }));

    return NextResponse.json({ granularity, series }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
