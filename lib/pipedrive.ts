const TOKEN = process.env.PIPEDRIVE_API_TOKEN;
const BASE = "https://api.pipedrive.com/api/v1";

if (!TOKEN) {
  console.warn("PIPEDRIVE_API_TOKEN não configurado. Defina essa variável de ambiente no projeto da Vercel.");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pdFetch(path: string, params: Record<string, string | number> = {}, attempt = 1): Promise<any> {
  const url = new URL(BASE + path);
  url.searchParams.set("api_token", TOKEN || "");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    if (attempt < 2) {
      await sleep(250);
      return pdFetch(path, params, attempt + 1);
    }
    throw new Error(`Pipedrive ${path} não respondeu em JSON após ${attempt} tentativas (status ${res.status}): ${text.slice(0, 200)}`);
  }
  if (res.status === 429 && attempt < 2) {
    await sleep(250);
    return pdFetch(path, params, attempt + 1);
  }
  if (!res.ok || json.success === false) {
    throw new Error(`Pipedrive ${path} falhou (${res.status}): ${json.error || res.statusText}`);
  }
  return json;
}

async function pdFetchV2(path: string, params: Record<string, string | number> = {}, attempt = 1): Promise<any> {
  const url = new URL("https://api.pipedrive.com/api/v2" + path);
  url.searchParams.set("api_token", TOKEN || "");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    if (attempt < 2) {
      await sleep(250);
      return pdFetchV2(path, params, attempt + 1);
    }
    throw new Error(`Pipedrive v2 ${path} não respondeu em JSON após ${attempt} tentativas (status ${res.status}): ${text.slice(0, 200)}`);
  }
  if (res.status === 429 && attempt < 2) {
    await sleep(250);
    return pdFetchV2(path, params, attempt + 1);
  }
  if (!res.ok || json.success === false) {
    throw new Error(`Pipedrive v2 ${path} falhou (${res.status}): ${json.error || res.statusText}`);
  }
  return json;
}

export type ActivityType = { id: number; key_string: string; name: string };

export type OutcomeField = {
  key: string;
  options: Array<{ id: number; label: string }>;
};

export type BaseCtx = {
  userId: number;
  userFound: boolean;
  resolvedUserName?: string;
  candidateCount?: number;
  candidateNames?: string[];
  ownerUserId: number | null;
  ownerUserName?: string;
  callType?: ActivityType;
  whatsappType?: ActivityType;
  meetingType?: ActivityType;
  outcomeField: OutcomeField | null;
  pipelineName: string;
  pipelineId: number | null;
};

export type Ctx = BaseCtx & {
  dealIdsInPipeline: Set<number>;
  dealInfo?: Map<number, { title: string; stageId: number }>;
  stagesMap?: Map<number, string>;
};

const PIPELINE_ID = Number(process.env.PIPEDRIVE_PIPELINE_ID || 38);
const TARGET_USER_NAME = process.env.PIPEDRIVE_TARGET_USER_NAME || "Willian";
const OWNER_USER_NAME = process.env.PIPEDRIVE_OWNER_USER_NAME || "Paulo";

async function getUsers(): Promise<Array<{ id: number; name: string }>> {
  const j = await pdFetch("/users");
  return j.data || [];
}

async function getPipelines(): Promise<Array<{ id: number; name: string }>> {
  const j = await pdFetch("/pipelines");
  return j.data || [];
}

export type DealSummary = { id: number; title: string; stage_id: number };

async function getOpenDealsForPipeline(pipelineId: number, maxItems = 3000): Promise<DealSummary[]> {
  const deals: DealSummary[] = [];
  let cursor: string | undefined;
  const limit = 500;
  while (deals.length < maxItems) {
    const j = await pdFetchV2("/deals", {
      pipeline_id: pipelineId,
      status: "open",
      sort_by: "update_time",
      sort_direction: "desc",
      limit,
      ...(cursor ? { cursor } : {}),
    });
    const batch = j.data || [];
    for (const d of batch) deals.push({ id: d.id, title: d.title, stage_id: d.stage_id });
    const next = j.additional_data?.next_cursor;
    if (!next || batch.length === 0) break;
    cursor = next;
  }
  return deals;
}

async function getStages(pipelineId: number): Promise<Array<{ id: number; name: string }>> {
  const j = await pdFetch("/stages", { pipeline_id: pipelineId });
  return j.data || [];
}

let stagesCache: { pipelineId: number; value: Map<number, string>; expires: number } | null = null;

export async function getStagesMapCached(pipelineId: number): Promise<Map<number, string>> {
  if (stagesCache && stagesCache.pipelineId === pipelineId && stagesCache.expires > Date.now()) {
    return stagesCache.value;
  }
  const stages = await getStages(pipelineId);
  const value = new Map(stages.map((s) => [s.id, s.name]));
  stagesCache = { pipelineId, value, expires: Date.now() + 5 * 60 * 1000 };
  return value;
}

async function getActivityTypes(): Promise<ActivityType[]> {
  const j = await pdFetch("/activityTypes");
  return j.data || [];
}

async function getActivityFields(): Promise<any[]> {
  const j = await pdFetch("/activityFields");
  return j.data || [];
}

function findOutcomeField(fields: any[]): OutcomeField | null {
  const targets = ["concluído", "não compareceu", "reagendado", "cancelado"];
  for (const f of fields) {
    if (!Array.isArray(f.options)) continue;
    const labels = f.options.map((o: any) => String(o.label).toLowerCase());
    const hits = targets.filter((t) => labels.includes(t));
    if (hits.length >= 2) {
      return { key: f.key, options: f.options };
    }
  }
  return null;
}

function findType(types: ActivityType[], defaultKey: string, nameHints: string[]) {
  return (
    types.find((t) => t.key_string === defaultKey) ||
    types.find((t) => nameHints.some((h) => t.name.toLowerCase().includes(h)))
  );
}

let baseCtxCache: { value: BaseCtx; expires: number } | null = null;

export async function getContext(): Promise<BaseCtx> {
  if (baseCtxCache && baseCtxCache.expires > Date.now()) return baseCtxCache.value;

  const [users, types, fields, pipelines] = await Promise.all([
    getUsers(),
    getActivityTypes(),
    getActivityFields(),
    getPipelines(),
  ]);

  const targetUser = users.find((u) => u.name.toLowerCase().includes(TARGET_USER_NAME.toLowerCase()));
  const candidates = users.filter((u) => u.name.toLowerCase().includes(TARGET_USER_NAME.toLowerCase()));
  const ownerUser = users.find((u) => u.name.toLowerCase().includes(OWNER_USER_NAME.toLowerCase()));
  const pipeline = pipelines.find((p) => p.id === PIPELINE_ID);

  const ctx: BaseCtx = {
    userId: targetUser ? targetUser.id : 0,
    userFound: !!targetUser,
    resolvedUserName: targetUser?.name,
    candidateCount: candidates.length,
    candidateNames: candidates.map((c) => `${c.name} (id=${c.id})`),
    ownerUserId: ownerUser ? ownerUser.id : null,
    ownerUserName: ownerUser?.name,
    callType: findType(types, "call", ["liga"]),
    whatsappType: findType(types, "whatsapp", ["whatsapp"]),
    meetingType: findType(types, "meeting", ["reuni"]),
    outcomeField: findOutcomeField(fields),
    pipelineName: pipeline ? pipeline.name : `id ${PIPELINE_ID}`,
    pipelineId: pipeline ? pipeline.id : null,
  };

  baseCtxCache = { value: ctx, expires: Date.now() + 60 * 1000 };
  return ctx;
}

let openDealsCache: { pipelineId: number; value: DealSummary[]; expires: number } | null = null;

export async function getOpenDealsForPipelineCached(pipelineId: number): Promise<DealSummary[]> {
  if (openDealsCache && openDealsCache.pipelineId === pipelineId && openDealsCache.expires > Date.now()) {
    return openDealsCache.value;
  }
  const value = await getOpenDealsForPipeline(pipelineId);
  openDealsCache = { pipelineId, value, expires: Date.now() + 60 * 1000 };
  return value;
}

const LOOKBACK_DAYS = Number(process.env.PIPEDRIVE_LOOKBACK_DAYS || 30);

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchActivitiesRaw(userIds: number[], start: string, end: string) {
  const results: any[] = [];
  for (const userId of userIds) {
    let cursorStart = 0;
    const limit = 500;
    while (true) {
      const j = await pdFetch("/activities", {
        user_id: userId,
        since_timestamp: `${start} 00:00:00`,
        until_timestamp: `${end} 23:59:59`,
        limit,
        start: cursorStart,
      });
      results.push(...(j.data || []));
      const more = j.additional_data?.pagination?.more_items_in_collection;
      if (!more) break;
      cursorStart = j.additional_data.pagination.next_start;
    }
  }
  return results;
}

const ACTIVITIES_WINDOW_DAYS = 150;
const ACTIVITIES_CACHE_TTL = 45 * 1000;
let activitiesCache: {
  key: string;
  value: any[];
  windowStart: string;
  windowEnd: string;
  expires: number;
} | null = null;

export async function getActivitiesInRange(userIds: number[], start: string, end: string) {
  const fetchStart = shiftDate(start, -LOOKBACK_DAYS);
  const key = [...userIds].sort().join(",");
  const now = Date.now();

  if (
    activitiesCache &&
    activitiesCache.key === key &&
    activitiesCache.expires > now &&
    activitiesCache.windowStart <= fetchStart &&
    activitiesCache.windowEnd >= end
  ) {
    return activitiesCache.value;
  }

  const today = new Date().toISOString().slice(0, 10);
  const windowStart = [shiftDate(today, -ACTIVITIES_WINDOW_DAYS), fetchStart].sort()[0];
  const windowEnd = [today, end].sort().reverse()[0];

  const value = await fetchActivitiesRaw(userIds, windowStart, windowEnd);
  activitiesCache = { key, value, windowStart, windowEnd, expires: now + ACTIVITIES_CACHE_TTL };
  return value;
}

const exactRangeCache = new Map<string, { value: any[]; expires: number }>();

export async function getActivitiesForExactRange(userIds: number[], start: string, end: string) {
  const fetchStart = shiftDate(start, -7);
  const key = `${[...userIds].sort().join(",")}_${fetchStart}_${end}`;
  const now = Date.now();
  const cached = exactRangeCache.get(key);
  if (cached && cached.expires > now) return cached.value;
  const value = await fetchActivitiesRaw(userIds, fetchStart, end);
  exactRangeCache.set(key, { value, expires: now + ACTIVITIES_CACHE_TTL });
  return value;
}

let wonDealsCache: { pipelineId: number; value: any[]; expires: number } | null = null;

export async function getWonDealsForPipeline(pipelineId: number, maxItems = 300) {
  const now = Date.now();
  if (wonDealsCache && wonDealsCache.pipelineId === pipelineId && wonDealsCache.expires > now) {
    return wonDealsCache.value;
  }
  const results: any[] = [];
  let cursor: string | undefined;
  const limit = 500;
  while (results.length < maxItems) {
    const j = await pdFetchV2("/deals", {
      status: "won",
      pipeline_id: pipelineId,
      sort_by: "update_time",
      sort_direction: "desc",
      limit,
      ...(cursor ? { cursor } : {}),
    });
    const batch = j.data || [];
    results.push(...batch);
    const next = j.additional_data?.next_cursor;
    if (!next || batch.length === 0) break;
    cursor = next;
  }
  wonDealsCache = { pipelineId, value: results, expires: now + ACTIVITIES_CACHE_TTL };
  return results;
}

let lostDealsCache: { pipelineId: number; value: any[]; expires: number } | null = null;

export async function getLostDealsForPipeline(pipelineId: number, maxItems = 300) {
  const now = Date.now();
  if (lostDealsCache && lostDealsCache.pipelineId === pipelineId && lostDealsCache.expires > now) {
    return lostDealsCache.value;
  }
  const results: any[] = [];
  let cursor: string | undefined;
  const limit = 500;
  while (results.length < maxItems) {
    const j = await pdFetchV2("/deals", {
      status: "lost",
      pipeline_id: pipelineId,
      sort_by: "update_time",
      sort_direction: "desc",
      limit,
      ...(cursor ? { cursor } : {}),
    });
    const batch = j.data || [];
    results.push(...batch);
    const next = j.additional_data?.next_cursor;
    if (!next || batch.length === 0) break;
    cursor = next;
  }
  lostDealsCache = { pipelineId, value: results, expires: now + ACTIVITIES_CACHE_TTL };
  return results;
}

export type FunnelSnapshot = {
  noPipe: number;
  trabalhados: number;
  abertos: number;
  perdidos: number;
  ganhos: number;
};

export async function getFunnelSnapshot(
  pipelineId: number,
  openDeals: DealSummary[],
  wonDeals: any[],
  lostDeals: any[],
  activitiesForWorked: any[]
): Promise<FunnelSnapshot> {
  const workedDealIds = new Set(activitiesForWorked.filter((a) => a.deal_id != null).map((a) => a.deal_id));
  const allDealIds = new Set<number>([
    ...openDeals.map((d) => d.id),
    ...wonDeals.map((d) => d.id),
    ...lostDeals.map((d) => d.id),
  ]);
  let trabalhados = 0;
  for (const id of allDealIds) if (workedDealIds.has(id)) trabalhados++;

  return {
    noPipe: allDealIds.size,
    trabalhados,
    abertos: openDeals.length,
    perdidos: lostDeals.length,
    ganhos: wonDeals.length,
  };
}

export function buildDealIdsInPipeline(openDeals: DealSummary[], wonDeals: any[], lostDeals: any[]): Set<number> {
  const ids = new Set<number>();
  for (const d of openDeals) ids.add(d.id);
  for (const d of wonDeals) ids.add(d.id);
  for (const d of lostDeals) ids.add(d.id);
  return ids;
}

export function buildDealInfo(
  openDeals: DealSummary[],
  wonDeals: any[],
  lostDeals: any[]
): Map<number, { title: string; stageId: number }> {
  const info = new Map<number, { title: string; stageId: number }>();
  for (const d of openDeals) info.set(d.id, { title: d.title, stageId: d.stage_id });
  for (const d of wonDeals) info.set(d.id, { title: d.title, stageId: d.stage_id });
  for (const d of lostDeals) info.set(d.id, { title: d.title, stageId: d.stage_id });
  return info;
}

function idOf(field: any): string | null {
  if (field == null) return null;
  if (typeof field === "object") return String(field.id ?? field.value ?? "");
  return String(field);
}

export type LeadDetalhe = {
  dealId: number;
  empresa: string;
  etapa: string;
  tentativas: number;
  whatsapp: number;
  ligacao: number;
};

export type Metrics = {
  start: string;
  end: string;
  leadsContatados: number;
  clientesWhatsapp: number;
  clientesLigacao: number;
  reunioesAgendadas: number;
  reunioesMarcadas: number;
  reunioesRealizadas: number;
  reunioesNoShow: number;
  vendasGanhas: number;
  valorGanho: number;
  leadsContatadosDetalhe: LeadDetalhe[];
  avisos: string[];
};

function completionDate(a: any): string | null {
  if (a.marked_as_done_time) return String(a.marked_as_done_time).slice(0, 10);
  if (a.done && a.due_date) return a.due_date;
  return null;
}

export function computeMetrics(
  ctx: Ctx,
  allActivities: any[],
  allWonDeals: any[],
  start: string,
  end: string
): Metrics {
  const avisos: string[] = [];
  if (!ctx.userFound) avisos.push(`Usuário "${TARGET_USER_NAME}" não encontrado na conta — nada está sendo contado.`);
  if (!ctx.callType) avisos.push('Tipo de atividade "Ligação" não encontrado na conta.');
  if (!ctx.whatsappType) avisos.push('Tipo de atividade "Whatsapp" não encontrado na conta.');
  if (!ctx.meetingType) avisos.push('Tipo de atividade "Reunião" não encontrado na conta.');
  if (!ctx.outcomeField) avisos.push('Campo "Resultado" da reunião não encontrado — Realizadas/No Show ficam zerados.');
  if (!ctx.pipelineId) avisos.push(`Funil "${ctx.pipelineName}" não encontrado na conta — nada está sendo contado.`);

  const pipelineActs = allActivities.filter((a) => a.deal_id != null && ctx.dealIdsInPipeline.has(a.deal_id));

  const doneActs = pipelineActs.filter((a) => {
    const d = completionDate(a);
    return d != null && d >= start && d <= end;
  });

  function contactsOf(types: (ActivityType | undefined)[]) {
    const seen = new Set<string>();
    for (const a of doneActs) {
      if (!types.some((t) => t && a.type === t.key_string)) continue;
      const key = idOf(a.person_id) || idOf(a.org_id) || `activity-${a.id}`;
      seen.add(key);
    }
    return seen.size;
  }

  function totalOf(types: (ActivityType | undefined)[]) {
    return doneActs.filter((a) => types.some((t) => t && a.type === t.key_string)).length;
  }

  const contactActs = doneActs.filter(
    (a) => (ctx.whatsappType && a.type === ctx.whatsappType.key_string) || (ctx.callType && a.type === ctx.callType.key_string)
  );
  const porNegocio = new Map<number, { whatsapp: number; ligacao: number }>();
  for (const a of contactActs) {
    const cur = porNegocio.get(a.deal_id) || { whatsapp: 0, ligacao: 0 };
    if (ctx.whatsappType && a.type === ctx.whatsappType.key_string) cur.whatsapp++;
    if (ctx.callType && a.type === ctx.callType.key_string) cur.ligacao++;
    porNegocio.set(a.deal_id, cur);
  }
  const leadsContatadosDetalhe: LeadDetalhe[] = Array.from(porNegocio.entries())
    .map(([dealId, c]) => {
      const info = ctx.dealInfo?.get(dealId);
      const etapa = info ? ctx.stagesMap?.get(info.stageId) || `etapa ${info.stageId}` : "?";
      return {
        dealId,
        empresa: info?.title || `Negócio #${dealId}`,
        etapa,
        tentativas: c.whatsapp + c.ligacao,
        whatsapp: c.whatsapp,
        ligacao: c.ligacao,
      };
    })
    .sort((a, b) => b.tentativas - a.tentativas);

  const meetingsScheduled = ctx.meetingType
    ? pipelineActs.filter((a) => a.type === ctx.meetingType!.key_string && a.due_date >= start && a.due_date <= end)
    : [];

  const meetingsMarked = ctx.meetingType
    ? pipelineActs.filter((a) => {
        if (a.type !== ctx.meetingType!.key_string || !a.add_time) return false;
        const day = String(a.add_time).slice(0, 10);
        return day >= start && day <= end;
      })
    : [];

  const meetingsDone = ctx.meetingType ? doneActs.filter((a) => a.type === ctx.meetingType!.key_string) : [];

  let reunioesRealizadas = 0;
  let reunioesNoShow = 0;
  if (ctx.outcomeField) {
    const idToLabel = Object.fromEntries(ctx.outcomeField.options.map((o) => [o.id, o.label.toLowerCase()]));
    for (const a of meetingsDone) {
      const raw = a[ctx.outcomeField.key];
      const label = raw != null ? idToLabel[raw] : null;
      if (label === "concluído") reunioesRealizadas++;
      if (label === "não compareceu") reunioesNoShow++;
    }
  }

  const workedDealIds = new Set(allActivities.filter((a) => a.deal_id != null).map((a) => a.deal_id));

  const wonInRange = allWonDeals.filter((d) => {
    if (!d.won_time) return false;
    if (ctx.pipelineId && d.pipeline_id !== ctx.pipelineId) return false;
    const day = String(d.won_time).slice(0, 10);
    if (day < start || day > end) return false;
    const isOwner = idOf(d.owner_id ?? d.user_id) === String(ctx.userId);
    const wasWorked = workedDealIds.has(d.id);
    return isOwner || wasWorked;
  });

  return {
    start,
    end,
    leadsContatados: contactsOf([ctx.whatsappType, ctx.callType]),
    leadsContatadosDetalhe,
    clientesWhatsapp: totalOf([ctx.whatsappType]),
    clientesLigacao: totalOf([ctx.callType]),
    reunioesAgendadas: meetingsScheduled.length,
    reunioesMarcadas: meetingsMarked.length,
    reunioesRealizadas,
    reunioesNoShow,
    vendasGanhas: wonInRange.length,
    valorGanho: wonInRange.reduce((s, d) => s + (Number(d.value) || 0), 0),
    avisos,
  };
}
