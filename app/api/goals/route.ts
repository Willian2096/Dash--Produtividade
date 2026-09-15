import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type Goals = {
  ligacoesContatadas: number;
  reunioesMarcadas: number;
  vendasGanhas: number;
  faturamento: number;
};

const DEFAULT_GOALS: Goals = {
  ligacoesContatadas: 50,
  reunioesMarcadas: 10,
  vendasGanhas: 5,
  faturamento: 50000,
};

const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID;
const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const GLOBAL_CONFIG_CONNECTION = process.env.GLOBAL_CONFIG || process.env.EDGE_CONFIG;

function configured() {
  return !!(EDGE_CONFIG_ID && VERCEL_API_TOKEN && GLOBAL_CONFIG_CONNECTION);
}

async function readGoals(): Promise<Goals> {
  if (!GLOBAL_CONFIG_CONNECTION) return DEFAULT_GOALS;
  try {
    const { get } = await import("@vercel/global-config");
    const stored = await get<Goals>("goals");
    return stored ? { ...DEFAULT_GOALS, ...stored } : DEFAULT_GOALS;
  } catch {
    return DEFAULT_GOALS;
  }
}

async function goalsExists(): Promise<boolean> {
  if (!GLOBAL_CONFIG_CONNECTION) return false;
  try {
    const { has } = await import("@vercel/global-config");
    return await has("goals");
  } catch {
    return false;
  }
}

export async function GET() {
  const goals = await readGoals();
  return NextResponse.json({ goals, configurado: configured() }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

export async function POST(req: NextRequest) {
  if (!configured()) {
    return NextResponse.json(
      {
        error:
          "Global Config (antigo Edge Config) ainda não está configurado neste projeto. Crie o Store em Storage > Browse Storage > Global Config e adicione as variáveis EDGE_CONFIG_ID e VERCEL_API_TOKEN.",
      },
      { status: 400 }
    );
  }
  try {
    const body = (await req.json()) as Partial<Goals>;
    const current = await readGoals();
    const next: Goals = { ...current, ...body };
    const operation = (await goalsExists()) ? "update" : "create";

    const res = await fetch(`https://api.vercel.com/v1/global-config/${EDGE_CONFIG_ID}/items`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${VERCEL_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: [{ operation, key: "goals", value: next }] }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Vercel API respondeu ${res.status}: ${text.slice(0, 200)}`);
    }

    return NextResponse.json({ goals: next });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
