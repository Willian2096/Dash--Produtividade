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
import { buildWeeksOfMonth } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const anchor = searchParams.get("date") || new Date().toISOString().slice(0, 10);

    const weeks = buildWeeksOfMonth(anchor);
    const overallStart = weeks[0].start;
    const overallEnd = weeks[weeks.length - 1].end;

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
    const semanas = weeks.map((w) => {
      const m = computeMetrics(ctx, activities, wonDeals, w.start, w.end);
      return { label: w.label, start: w.start, end: w.end, ...m };
    });

    const melhorSemana = semanas.reduce(
      (best, s) => (best == null || s.leadsContatados > best.leadsContatados ? s : best),
      null as (typeof semanas)[number] | null
    );

    return NextResponse.json(
      { semanas, melhorSemanaLabel: melhorSemana?.label ?? null },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
