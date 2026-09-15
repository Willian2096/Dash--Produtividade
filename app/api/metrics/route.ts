import { NextRequest, NextResponse } from "next/server";
import {
  getContext,
  getOpenDealsForPipelineCached,
  getActivitiesInRange,
  getActivitiesForExactRange,
  getWonDealsForPipeline,
  getLostDealsForPipeline,
  getFunnelSnapshot,
  getStagesMapCached,
  buildDealIdsInPipeline,
  buildDealInfo,
  computeMetrics,
} from "@/lib/pipedrive";
import { rangeForPeriod, shiftAnchor } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = (searchParams.get("period") || "day") as "day" | "week" | "month";
    const anchor = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const { start, end } = rangeForPeriod(period, anchor);

    const baseCtx = await getContext();
    const userIds = [baseCtx.userId, baseCtx.ownerUserId].filter((v): v is number => !!v);
    const [activities, wonDeals, lostDeals, openDeals, stagesMap] = await Promise.all([
      getActivitiesInRange(userIds, start, end),
      baseCtx.pipelineId ? getWonDealsForPipeline(baseCtx.pipelineId) : Promise.resolve([]),
      baseCtx.pipelineId ? getLostDealsForPipeline(baseCtx.pipelineId) : Promise.resolve([]),
      baseCtx.pipelineId ? getOpenDealsForPipelineCached(baseCtx.pipelineId) : Promise.resolve([]),
      baseCtx.pipelineId ? getStagesMapCached(baseCtx.pipelineId) : Promise.resolve(new Map<number, string>()),
    ]);
    const dealIdsInPipeline = buildDealIdsInPipeline(openDeals, wonDeals, lostDeals);
    const dealInfo = buildDealInfo(openDeals, wonDeals, lostDeals);

    const metrics = computeMetrics({ ...baseCtx, dealIdsInPipeline, dealInfo, stagesMap }, activities, wonDeals, start, end);

    const funil = baseCtx.pipelineId
      ? await getFunnelSnapshot(baseCtx.pipelineId, openDeals, wonDeals, lostDeals, activities)
      : { noPipe: 0, trabalhados: 0, abertos: 0, perdidos: 0, ganhos: 0 };

    const anteriorAnchor =
      period === "day" ? shiftAnchor(anchor, "day", -1) : period === "week" ? shiftAnchor(anchor, "day", -7) : shiftAnchor(anchor, "month", -1);
    const mesAnteriorAnchor = shiftAnchor(anchor, "month", -1);
    const anoAnteriorAnchor = shiftAnchor(anchor, "year", -1);

    async function metricsFor(compareAnchor: string) {
      const r = rangeForPeriod(period, compareAnchor);
      const acts = await getActivitiesForExactRange(userIds, r.start, r.end);
      return computeMetrics({ ...baseCtx, dealIdsInPipeline, dealInfo, stagesMap }, acts, wonDeals, r.start, r.end);
    }

    const [anterior, mesAnterior, anoAnterior] = await Promise.all([
      metricsFor(anteriorAnchor),
      metricsFor(mesAnteriorAnchor),
      metricsFor(anoAnteriorAnchor),
    ]);

    function pick(m: typeof metrics) {
      return {
        leadsContatados: m.leadsContatados,
        clientesWhatsapp: m.clientesWhatsapp,
        clientesLigacao: m.clientesLigacao,
        reunioesMarcadas: m.reunioesMarcadas,
        reunioesRealizadas: m.reunioesRealizadas,
        reunioesNoShow: m.reunioesNoShow,
        vendasGanhas: m.vendasGanhas,
        valorGanho: m.valorGanho,
      };
    }

    return NextResponse.json(
      {
        period,
        ...metrics,
        funil,
        comparativos: { anterior: pick(anterior), mesAnterior: pick(mesAnterior), anoAnterior: pick(anoAnterior) },
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
