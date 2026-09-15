"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

type Period = "day" | "week" | "month";
type Granularity = "day" | "week" | "month";

type LeadDetalhe = { dealId: number; empresa: string; etapa: string; tentativas: number; whatsapp: number; ligacao: number };
type ComparativoMetrics = {
  leadsContatados: number;
  clientesWhatsapp: number;
  clientesLigacao: number;
  reunioesMarcadas: number;
  reunioesRealizadas: number;
  reunioesNoShow: number;
  vendasGanhas: number;
  valorGanho: number;
};
type Funil = { noPipe: number; trabalhados: number; abertos: number; perdidos: number; ganhos: number };
type Metrics = {
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
  funil: Funil;
  comparativos: { anterior: ComparativoMetrics; mesAnterior: ComparativoMetrics; anoAnterior: ComparativoMetrics };
};
type Goals = { ligacoesContatadas: number; reunioesMarcadas: number; vendasGanhas: number; faturamento: number };
type Semana = { label: string; start: string; end: string } & Partial<Metrics>;

function fmtBRDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDelta(atual: number, anterior: number): { texto: string; cor: string } {
  if (anterior === 0) {
    if (atual === 0) return { texto: "— 0", cor: "var(--text-faint)" };
    return { texto: `▲ +${atual}`, cor: "var(--teal)" };
  }
  // Percentual limitado entre -100% e +100% para evitar valores absurdos
  // quando o "anterior" é um número pequeno (ex: 1 -> 25 daria 2400%).
  const pct = Math.round(Math.max(-100, Math.min(100, ((atual - anterior) / anterior) * 100)));
  if (pct === 0) return { texto: "— 0%", cor: "var(--text-faint)" };
  return pct > 0 ? { texto: `▲ ${pct}%`, cor: "var(--teal)" } : { texto: `▼ ${pct}%`, cor: "var(--red)" };
}

const PERIODOS: { key: Period; label: string }[] = [
  { key: "day", label: "Hoje" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mês" },
];

const GRANULARIDADES: { key: Granularity; label: string }[] = [
  { key: "day", label: "Dia" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mês" },
];

function MetricCard({
  label,
  value,
  color,
  sub,
  onClick,
  active,
  info,
  loading,
  compare,
}: {
  label: string;
  value: string | number;
  color: string;
  sub?: string;
  onClick?: () => void;
  active?: boolean;
  info?: string;
  loading?: boolean;
  compare?: { valorAtual: number; anterior: number; mesAnterior: number; anoAnterior: number };
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-panel)",
        border: active ? `1px solid ${color}` : "1px solid var(--line)",
        borderRadius: 10,
        padding: "20px 22px",
        position: "relative",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: color,
          borderTopLeftRadius: 10,
          borderBottomLeftRadius: 10,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: color, boxShadow: `0 0 8px ${color}`, display: "inline-block" }} />
        <span style={{ color: "var(--text-dim)", fontSize: 12.5, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</span>
        {info && (
          <span
            className="info-badge"
            data-tip={info}
            style={{
              color: "var(--text-faint)",
              fontSize: 11,
              border: "1px solid var(--text-faint)",
              borderRadius: 99,
              width: 13,
              height: 13,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "help",
              lineHeight: 1,
              marginLeft: "auto",
            }}
          >
            i
          </span>
        )}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 600, lineHeight: 1, display: "flex", alignItems: "center", height: 36 }}>
        {loading ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 3 }} /> : value}
      </div>
      {sub && <div style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 6 }}>{sub}</div>}
      {compare && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          {(
            [
              ["vs anterior", compare.anterior],
              ["vs mês ant.", compare.mesAnterior],
              ["vs ano ant.", compare.anoAnterior],
            ] as const
          ).map(([rotulo, anterior]) => {
            const d = fmtDelta(compare.valorAtual, anterior);
            return (
              <div key={rotulo} style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5 }}>
                <span style={{ color: "var(--text-faint)" }}>{rotulo}</span>
                <span style={{ color: d.cor, fontFamily: "var(--font-display)" }}>{d.texto}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GoalRow({ label, atual, meta, color, isCurrency }: { label: string; atual: number; meta: number; color: string; isCurrency?: boolean }) {
  const pct = meta > 0 ? Math.min(100, Math.round((atual / meta) * 100)) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
        <span style={{ color: "var(--text)" }}>{label}</span>
        <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-display)" }}>
          {isCurrency ? fmtBRL(atual) : atual} / {isCurrency ? fmtBRL(meta) : meta}
        </span>
      </div>
      <div style={{ background: "var(--line)", borderRadius: 6, height: 7, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 6 }} />
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 3, textAlign: "right" }}>{pct}%</div>
    </div>
  );
}

function GoalInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--text-dim)" }}>
      {label}
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          if (!/^\d*$/.test(raw)) return;
          setText(raw);
          onChange(raw === "" ? 0 : Number(raw));
        }}
        style={{
          background: "var(--bg-panel-raised)",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: "7px 10px",
          color: "var(--text)",
          fontFamily: "var(--font-display)",
          fontSize: 13,
        }}
      />
    </label>
  );
}

function FunnelRow({ label, valor, total, color }: { label: string; valor: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 84, fontSize: 12, color: "var(--text-dim)", flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, background: "var(--line)", borderRadius: 5, height: 20, position: "relative", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(pct, 2)}%`, height: "100%", background: color, borderRadius: 5, display: "flex", alignItems: "center", paddingLeft: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#12151c" }}>{valor}</span>
        </div>
      </div>
      <span style={{ width: 38, textAlign: "right", fontSize: 11, color: "var(--text-faint)", flexShrink: 0 }}>{pct}%</span>
    </div>
  );
}

export default function Page() {
  const [period, setPeriod] = useState<Period>("day");
  const [anchor, setAnchor] = useState(todayISO());
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [granularity, setGranularity] = useState<Granularity>("day");
  const [series, setSeries] = useState<any[] | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showLeadsDetail, setShowLeadsDetail] = useState(false);

  const [goals, setGoals] = useState<Goals | null>(null);
  const [goalsConfigured, setGoalsConfigured] = useState(true);
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalsDraft, setGoalsDraft] = useState<Goals | null>(null);
  const [savingGoals, setSavingGoals] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);

  const [semanas, setSemanas] = useState<Semana[] | null>(null);
  const [melhorSemanaLabel, setMelhorSemanaLabel] = useState<string | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);

  useEffect(() => {
    fetch("/api/goals", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.goals) setGoals(d.goals);
        setGoalsConfigured(!!d.configurado);
      })
      .catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    setWeeklyLoading(true);
    fetch(`/api/weekly?date=${anchor}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setSemanas(d.semanas);
          setMelhorSemanaLabel(d.melhorSemanaLabel);
        }
      })
      .finally(() => setWeeklyLoading(false));
  }, [anchor, refreshKey]);

  function startEditGoals() {
    setGoalsDraft(goals);
    setEditingGoals(true);
    setGoalsError(null);
  }

  async function saveGoals() {
    if (!goalsDraft) return;
    setSavingGoals(true);
    setGoalsError(null);
    try {
      const r = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(goalsDraft),
      });
      const d = await r.json();
      if (d.error) {
        setGoalsError(d.error);
      } else {
        setGoals(d.goals);
        setEditingGoals(false);
      }
    } catch (e: any) {
      setGoalsError(String(e));
    } finally {
      setSavingGoals(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/metrics?period=${period}&date=${anchor}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setMetrics(d);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [period, anchor, refreshKey]);

  useEffect(() => {
    setSeriesLoading(true);
    fetch(`/api/series?granularity=${granularity}&date=${anchor}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setSeries(d.series);
      })
      .finally(() => setSeriesLoading(false));
  }, [granularity, anchor, refreshKey]);

  function navigate(dir: -1 | 1) {
    const d = new Date(anchor + "T00:00:00Z");
    const step = period === "day" ? 1 : period === "week" ? 7 : 30;
    d.setUTCDate(d.getUTCDate() + dir * step);
    setAnchor(d.toISOString().slice(0, 10));
  }

  const firstLoad = loading && !metrics;

  const rangeLabel = useMemo(() => {
    if (!metrics) return "";
    return metrics.start === metrics.end ? fmtBRDate(metrics.start) : `${fmtBRDate(metrics.start)} – ${fmtBRDate(metrics.end)}`;
  }, [metrics]);

  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: "36px 32px 80px" }}>
      <header style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{ width: 10, height: 10, borderRadius: 99, background: "var(--mint)", boxShadow: "0 0 14px var(--mint)", display: "inline-block", flexShrink: 0 }}
          />
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, margin: 0, letterSpacing: 1, lineHeight: 1.1 }}>
            PAINEL DE PRODUTIVIDADE{" "}
            <span style={{ color: "var(--mint)", textShadow: "0 0 18px rgba(94,209,199,0.45)" }}>RECON</span>
          </h1>
        </div>
        <div
          style={{
            marginTop: 12,
            marginLeft: 22,
            width: 90,
            height: 3,
            borderRadius: 3,
            background: "linear-gradient(90deg, var(--mint), var(--teal), transparent)",
          }}
        />
      </header>

      <section style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 6, background: "var(--bg-panel)", padding: 4, borderRadius: 8, border: "1px solid var(--line)" }}>
          {PERIODOS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                background: period === p.key ? "var(--amber)" : "transparent",
                color: period === p.key ? "#12151c" : "var(--text-dim)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button aria-label="Período anterior" onClick={() => navigate(-1)} style={navBtnStyle}>
            ‹
          </button>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--text-dim)", minWidth: 140, textAlign: "center" }}>
            {rangeLabel || "…"}
          </span>
          <button aria-label="Próximo período" onClick={() => navigate(1)} style={navBtnStyle}>
            ›
          </button>
          {anchor !== todayISO() && (
            <button onClick={() => setAnchor(todayISO())} style={{ ...navBtnStyle, width: "auto", padding: "0 12px", fontSize: 12 }}>
              Hoje
            </button>
          )}
          <button
            aria-label="Atualizar"
            title="Atualizar agora"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading || seriesLoading}
            style={{ ...navBtnStyle, color: "var(--teal)" }}
          >
            {loading || seriesLoading ? <span className="spinner" /> : "↻"}
          </button>
        </div>
      </section>

      {(loading || seriesLoading) && (
        <div className="loadbar-track" style={{ marginBottom: 18 }}>
          <div className="loadbar-fill" />
        </div>
      )}

      {error && (
        <div style={{ background: "rgba(217,112,108,0.12)", border: "1px solid var(--red)", color: "var(--red)", padding: "12px 16px", borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
          Erro ao buscar dados do Pipedrive: {error}
        </div>
      )}

      {metrics && metrics.avisos.length > 0 && (
        <div style={{ background: "rgba(240,169,58,0.1)", border: "1px solid var(--amber)", color: "var(--amber)", padding: "10px 16px", borderRadius: 8, marginBottom: 20, fontSize: 12.5 }}>
          {metrics.avisos.map((a, i) => (
            <div key={i}>⚠ {a}</div>
          ))}
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
        <MetricCard
          label="Leads Contatados"
          value={metrics?.leadsContatados ?? "–"}
          color="var(--mint)"
          sub="clique para ver a lista"
          onClick={() => setShowLeadsDetail((v) => !v)}
          active={showLeadsDetail}
          info="Pessoas/organizações únicas contatadas por WhatsApp OU Ligação no período. Conta pela data em que a atividade foi marcada como concluída, não pela data agendada. Inclui negócios que depois foram marcados como perdidos — a atividade concluída continua contando."
          loading={firstLoad}
          compare={metrics ? { valorAtual: metrics.leadsContatados, anterior: metrics.comparativos.anterior.leadsContatados, mesAnterior: metrics.comparativos.mesAnterior.leadsContatados, anoAnterior: metrics.comparativos.anoAnterior.leadsContatados } : undefined}
        />
        <MetricCard
          label="WhatsApp"
          value={metrics?.clientesWhatsapp ?? "–"}
          color="var(--violet)"
          sub="mensagens enviadas"
          info="Total de atividades do tipo Whatsapp marcadas como concluídas no período — conta cada envio, mesmo repetido para o mesmo cliente. Inclui negócios que depois foram marcados como perdidos."
          loading={firstLoad}
          compare={metrics ? { valorAtual: metrics.clientesWhatsapp, anterior: metrics.comparativos.anterior.clientesWhatsapp, mesAnterior: metrics.comparativos.mesAnterior.clientesWhatsapp, anoAnterior: metrics.comparativos.anoAnterior.clientesWhatsapp } : undefined}
        />
        <MetricCard
          label="Ligações"
          value={metrics?.clientesLigacao ?? "–"}
          color="var(--teal)"
          sub="ligações feitas (Pipedrive + Api4com)"
          info="Total de atividades do tipo Ligação marcadas como concluídas no período — conta tanto as criadas automaticamente pela Api4com quanto as registradas manualmente. Inclui negócios que depois foram marcados como perdidos."
          loading={firstLoad}
          compare={metrics ? { valorAtual: metrics.clientesLigacao, anterior: metrics.comparativos.anterior.clientesLigacao, mesAnterior: metrics.comparativos.mesAnterior.clientesLigacao, anoAnterior: metrics.comparativos.anoAnterior.clientesLigacao } : undefined}
        />
        <MetricCard
          label="Reunião marcada"
          value={metrics?.reunioesMarcadas ?? "–"}
          color="var(--blue)"
          info="Reuniões CRIADAS/agendadas por você dentro do período, independente de quando a reunião vai acontecer de fato. Conta pela data em que você marcou a reunião."
          loading={firstLoad}
          compare={metrics ? { valorAtual: metrics.reunioesMarcadas, anterior: metrics.comparativos.anterior.reunioesMarcadas, mesAnterior: metrics.comparativos.mesAnterior.reunioesMarcadas, anoAnterior: metrics.comparativos.anoAnterior.reunioesMarcadas } : undefined}
        />
        <MetricCard
          label="Reuniões realizadas"
          value={metrics?.reunioesRealizadas ?? "–"}
          color="var(--blue)"
          info="Reuniões cujo campo Resultado no Pipedrive está marcado como 'Concluído', contadas na data da reunião."
          loading={firstLoad}
          compare={metrics ? { valorAtual: metrics.reunioesRealizadas, anterior: metrics.comparativos.anterior.reunioesRealizadas, mesAnterior: metrics.comparativos.mesAnterior.reunioesRealizadas, anoAnterior: metrics.comparativos.anoAnterior.reunioesRealizadas } : undefined}
        />
        <MetricCard
          label="No show"
          value={metrics?.reunioesNoShow ?? "–"}
          color="var(--red)"
          info="Reuniões cujo campo Resultado no Pipedrive está marcado como 'Não compareceu', contadas na data da reunião."
          loading={firstLoad}
          compare={metrics ? { valorAtual: metrics.reunioesNoShow, anterior: metrics.comparativos.anterior.reunioesNoShow, mesAnterior: metrics.comparativos.mesAnterior.reunioesNoShow, anoAnterior: metrics.comparativos.anoAnterior.reunioesNoShow } : undefined}
        />
        <MetricCard
          label="Vendas ganhas"
          value={metrics?.vendasGanhas ?? "–"}
          color="var(--amber)"
          sub={metrics ? fmtBRL(metrics.valorGanho) : undefined}
          info="Negócios do funil marcados como Ganho no período, sendo seu (você é o proprietário) OU tendo pelo menos uma atividade sua vinculada a ele."
          loading={firstLoad}
          compare={metrics ? { valorAtual: metrics.vendasGanhas, anterior: metrics.comparativos.anterior.vendasGanhas, mesAnterior: metrics.comparativos.mesAnterior.vendasGanhas, anoAnterior: metrics.comparativos.anoAnterior.vendasGanhas } : undefined}
        />
      </section>

      {/* METAS DO MÊS + FUNIL RECON */}
      <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14, marginTop: 14 }}>
        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "20px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--text-dim)", letterSpacing: 0.5, textTransform: "uppercase" }}>
              Metas do Mês
            </span>
            {!editingGoals && goals && (
              <button onClick={startEditGoals} style={{ ...navBtnStyle, width: "auto", padding: "0 10px", fontSize: 11.5 }}>
                Editar
              </button>
            )}
          </div>

          {!goalsConfigured && (
            <div style={{ background: "rgba(240,169,58,0.1)", border: "1px solid var(--amber)", color: "var(--amber)", padding: "8px 12px", borderRadius: 8, marginBottom: 14, fontSize: 11.5 }}>
              ⚠ Global Config (antigo Edge Config) ainda não configurado neste projeto na Vercel — as metas abaixo estão fixas no valor padrão até isso ser criado.
            </div>
          )}

          {goals && !editingGoals && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <GoalRow label="Ligações Contatadas" atual={metrics?.clientesLigacao ?? 0} meta={goals.ligacoesContatadas} color="var(--mint)" />
              <GoalRow label="Reuniões Marcadas" atual={metrics?.reunioesMarcadas ?? 0} meta={goals.reunioesMarcadas} color="var(--teal)" />
              <GoalRow label="Vendas Ganhas" atual={metrics?.vendasGanhas ?? 0} meta={goals.vendasGanhas} color="var(--violet)" />
              <GoalRow label="Faturamento" atual={metrics?.valorGanho ?? 0} meta={goals.faturamento} color="var(--amber)" isCurrency />
            </div>
          )}

          {editingGoals && goalsDraft && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <GoalInput label="Ligações Contatadas" value={goalsDraft.ligacoesContatadas} onChange={(v) => setGoalsDraft({ ...goalsDraft, ligacoesContatadas: v })} />
              <GoalInput label="Reuniões Marcadas" value={goalsDraft.reunioesMarcadas} onChange={(v) => setGoalsDraft({ ...goalsDraft, reunioesMarcadas: v })} />
              <GoalInput label="Vendas Ganhas" value={goalsDraft.vendasGanhas} onChange={(v) => setGoalsDraft({ ...goalsDraft, vendasGanhas: v })} />
              <GoalInput label="Faturamento (R$)" value={goalsDraft.faturamento} onChange={(v) => setGoalsDraft({ ...goalsDraft, faturamento: v })} />
              {goalsError && <div style={{ color: "var(--red)", fontSize: 12 }}>{goalsError}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={saveGoals}
                  disabled={savingGoals}
                  style={{ padding: "7px 16px", borderRadius: 6, border: "none", background: "var(--teal)", color: "#12151c", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
                >
                  {savingGoals ? "Salvando…" : "Salvar"}
                </button>
                <button
                  onClick={() => setEditingGoals(false)}
                  style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid var(--line)", background: "transparent", color: "var(--text-dim)", fontSize: 12.5, cursor: "pointer" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "20px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--text-dim)", letterSpacing: 0.5, textTransform: "uppercase" }}>
              Funil RECON
            </span>
            <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>estado atual do pipe</span>
          </div>
          {metrics ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <FunnelRow label="No pipe" valor={metrics.funil.noPipe} total={metrics.funil.noPipe} color="var(--blue)" />
              <FunnelRow label="Trabalhados" valor={metrics.funil.trabalhados} total={metrics.funil.noPipe} color="var(--mint)" />
              <FunnelRow label="Abertos" valor={metrics.funil.abertos} total={metrics.funil.noPipe} color="var(--violet)" />
              <FunnelRow label="Perdidos" valor={metrics.funil.perdidos} total={metrics.funil.noPipe} color="var(--red)" />
              <FunnelRow label="Ganhos" valor={metrics.funil.ganhos} total={metrics.funil.noPipe} color="var(--amber)" />
              <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 4 }}>
                "Trabalhados" é aproximado: conta negócios com atividade sua nos últimos ~150 dias.
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--text-faint)", fontSize: 12.5 }}>Carregando…</div>
          )}
        </div>
      </section>

      {/* DESEMPENHO SEMANAL */}
      <section style={{ marginTop: 14, background: "var(--bg-panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "20px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--text-dim)", letterSpacing: 0.5, textTransform: "uppercase" }}>
            Desempenho Semanal
          </span>
          <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>leads contatados por semana</span>
        </div>
        {weeklyLoading || !semanas ? (
          <div style={{ color: "var(--text-faint)", fontSize: 12.5, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="spinner" />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 160 }}>
            {(() => {
              const maxLeads = Math.max(1, ...semanas.map((s) => s.leadsContatados ?? 0));
              return semanas.map((s) => {
                const isBest = s.label === melhorSemanaLabel;
                const leads = s.leadsContatados ?? 0;
                const pct = Math.round((leads / maxLeads) * 100);
                return (
                  <div key={s.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 8 }}>
                    <div style={{ position: "relative", width: "100%", height: `${Math.max(pct, leads > 0 ? 6 : 2)}%`, minHeight: 4, borderRadius: "6px 6px 0 0", background: isBest ? "var(--mint)" : "var(--line)" }}>
                      <span style={{ position: "absolute", top: -20, left: 0, right: 0, textAlign: "center", fontSize: 12, fontWeight: 700, color: isBest ? "var(--mint)" : "var(--text-dim)" }}>
                        {leads}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      {s.label} {isBest && leads > 0 && "🏆"}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </section>

      {showLeadsDetail && metrics && (
        <section style={{ marginTop: 16, background: "var(--bg-panel)", border: "1px solid var(--mint)", borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--mint)", marginBottom: 12, letterSpacing: 0.5 }}>
            LEADS CONTATADOS — {rangeLabel}
          </div>
          {metrics.leadsContatadosDetalhe.length === 0 ? (
            <div style={{ color: "var(--text-faint)", fontSize: 13 }}>Nenhum contato nesse período.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px 90px 90px 90px",
                  gap: 8,
                  padding: "6px 8px",
                  fontSize: 11,
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                <span>Empresa</span>
                <span>Etapa</span>
                <span>WhatsApp</span>
                <span>Ligação</span>
                <span>Total</span>
              </div>
              {metrics.leadsContatadosDetalhe.map((l) => (
                <div
                  key={l.dealId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 140px 90px 90px 90px",
                    gap: 8,
                    padding: "8px 8px",
                    borderTop: "1px solid var(--line)",
                    fontSize: 13,
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "var(--text)" }}>{l.empresa}</span>
                  <span style={{ color: "var(--text-dim)", fontSize: 12 }}>{l.etapa}</span>
                  <span style={{ color: "var(--violet)", fontFamily: "var(--font-display)" }}>{l.whatsapp}</span>
                  <span style={{ color: "var(--teal)", fontFamily: "var(--font-display)" }}>{l.ligacao}</span>
                  <span style={{ color: "var(--mint)", fontFamily: "var(--font-display)", fontWeight: 600 }}>{l.tentativas}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section style={{ marginTop: 44 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, letterSpacing: 0.5, color: "var(--text-dim)", margin: 0 }}>EVOLUÇÃO</h2>
          <div style={{ display: "flex", gap: 6, background: "var(--bg-panel)", padding: 4, borderRadius: 8, border: "1px solid var(--line)" }}>
            {GRANULARIDADES.map((g) => (
              <button
                key={g.key}
                onClick={() => setGranularity(g.key)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                  background: granularity === g.key ? "var(--teal)" : "transparent",
                  color: granularity === g.key ? "#12151c" : "var(--text-dim)",
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line)", borderRadius: 10, padding: "20px 12px 8px", opacity: seriesLoading ? 0.5 : 1 }}>
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={series || []} margin={{ top: 4, right: 16, left: -12, bottom: 4 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="var(--text-faint)" fontSize={12} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
              <YAxis stroke="var(--text-faint)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--bg-panel-raised)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12.5 }} labelStyle={{ color: "var(--text)" }} />
              <Legend wrapperStyle={{ fontSize: 12.5, color: "var(--text-dim)" }} />
              <Line type="monotone" dataKey="leadsContatados" name="Leads contatados" stroke="var(--mint)" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="clientesWhatsapp" name="WhatsApp" stroke="var(--violet)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="clientesLigacao" name="Ligações" stroke="var(--teal)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="reunioesMarcadas" name="Reunião marcada" stroke="#7FA8D9" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="reunioesRealizadas" name="Reuniões realizadas" stroke="var(--blue)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="reunioesNoShow" name="No show" stroke="var(--red)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="vendasGanhas" name="Vendas ganhas" stroke="var(--amber)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 6,
  border: "1px solid var(--line)",
  background: "var(--bg-panel)",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
