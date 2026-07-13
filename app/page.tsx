"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { OutreachPanel } from "@/components/OutreachPanel";
import { categories, getCategory } from "@/lib/catalog";
import { instagramProfileLink, phoneLink, whatsappWebLink } from "@/lib/contact-links";
import { defaultFilters } from "@/lib/qualification";
import type { CategoryKey, Lead, SearchFilters, SearchRequest } from "@/lib/types";

type View = "all" | Lead["qualification"];

const statusText = {
  confirmed: "Confirmado",
  probable: "Provável",
  unverified: "Não verificado",
  contradicted: "Não cumpre",
};

const qualificationText = {
  qualified: "Qualificado",
  review: "Validar",
  rejected: "Rejeitado",
};

function escapeCsv(value: unknown) {
  const string = String(value ?? "");
  return `"${string.replaceAll('"', '""')}"`;
}

function scoreTier(score: number) {
  if (score >= 75) return "hot";
  if (score >= 55) return "warm";
  return "cold";
}

function ContactActions({ lead }: { lead: Lead }) {
  const tel = phoneLink(lead.phone);
  const whatsapp = whatsappWebLink(lead.phone);
  const instagram = instagramProfileLink(lead.instagram);
  if (!tel && !lead.email && !whatsapp && !instagram) return null;
  return <div className="contactActions" aria-label={`Contactos de ${lead.name}`}>
    {tel && <a className="contactPhone" href={tel} aria-label={`Telefonar para ${lead.name}`}>☎ Telefone</a>}
    {whatsapp && <a className="contactWhatsapp" href={whatsapp} target="_blank" rel="noreferrer" aria-label={`Abrir WhatsApp Web de ${lead.name}`}>WhatsApp ↗</a>}
    {lead.email && <a className="contactEmail" href={`mailto:${lead.email}`} aria-label={`Enviar email para ${lead.name}`}>✉ Email</a>}
    {instagram && <a className="contactInstagram" href={instagram} target="_blank" rel="noreferrer" aria-label={`Abrir Instagram de ${lead.name}`}>Instagram ↗</a>}
  </div>;
}

export default function Home() {
  const [provider, setProvider] = useState<"osm" | "google">("osm");
  const [category, setCategory] = useState<CategoryKey>("dental");
  const [customQuery, setCustomQuery] = useState("");
  const [locationMode, setLocationMode] = useState<"country" | "area" | "cities">("area");
  const [area, setArea] = useState("Lisboa");
  const [maxPages, setMaxPages] = useState(1);
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters());
  const [leads, setLeads] = useState<Lead[]>([]);
  const [view, setView] = useState<View>("all");
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState<string[]>([]);
  const [mode, setMode] = useState<"demo" | "live" | "free">("free");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [lastSearch, setLastSearch] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const config = getCategory(category);
  const supportsProfessionals = Boolean(config.professionalLabel);
  const locations = useMemo(() => {
    if (locationMode === "country") return ["Portugal"];
    return area.split(",").map((item) => item.trim()).filter(Boolean).slice(0, provider === "osm" ? 3 : 8);
  }, [area, locationMode, provider]);
  const estimatedRequests = provider === "osm" ? Math.min(3, locations.length) : Math.min(12, locations.length * maxPages);

  useEffect(() => {
    fetch("/api/status")
      .then((response) => response.json())
      .then((data) => setMode(data.mode))
      .catch(() => setMode("demo"));
    const saved = localStorage.getItem("radar-local:last-search");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { area?: string; category?: CategoryKey; locationMode?: "country" | "area" | "cities" };
        if (parsed.area) setArea(parsed.area);
        if (parsed.category && categories[parsed.category]) setCategory(parsed.category);
        if (parsed.locationMode) setLocationMode(parsed.locationMode);
      } catch { /* Preferências antigas inválidas são ignoradas. */ }
    }
  }, []);

  const visibleLeads = useMemo(() => {
    const list = view === "all" ? leads : leads.filter((lead) => lead.qualification === view);
    return [...list].sort((a, b) => b.score - a.score || b.reviewCount - a.reviewCount);
  }, [leads, view]);

  const counts = useMemo(() => ({
    qualified: leads.filter((lead) => lead.qualification === "qualified").length,
    review: leads.filter((lead) => lead.qualification === "review").length,
    rejected: leads.filter((lead) => lead.qualification === "rejected").length,
  }), [leads]);
  const averageOpportunity = leads.length ? Math.round(leads.reduce((sum, lead) => sum + lead.score, 0) / leads.length) : 0;
  const priorityLeads = leads.filter((lead) => lead.score >= 75).length;
  const selectedLeads = useMemo(() => leads.filter((lead) => selectedIds.includes(lead.id)), [leads, selectedIds]);

  const setFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const providerFilters = { ...filters, requireReviewRange: provider === "google" };
    const appliedFilters = supportsProfessionals
      ? providerFilters
      : { ...providerFilters, minProfessionals: 0, maxProfessionals: 99 };
    const searchArea = locationMode === "country" ? "Portugal" : area;
    const payload: SearchRequest = { provider, category, customQuery, area: searchArea, locationMode, locations, maxPages, filters: appliedFilters };
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível pesquisar.");
      setLeads(data.leads);
      setSelectedIds([]);
      setMode(data.mode);
      setNotice(data.notice || "");
      setLastSearch(data.searchedAt);
      setView("all");
      localStorage.setItem("radar-local:last-search", JSON.stringify({ area, category, locationMode }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível pesquisar.");
    } finally {
      setLoading(false);
    }
  }

  async function enrichOne(lead: Lead) {
    if (!lead.website || enriching.includes(lead.id)) return;
    setEnriching((current) => [...current, lead.id]);
    setError("");
    const providerFilters = { ...filters, requireReviewRange: provider === "google" };
    const appliedFilters = supportsProfessionals ? providerFilters : { ...providerFilters, minProfessionals: 0, maxProfessionals: 99 };
    try {
      const response = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, filters: appliedFilters }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha no enriquecimento.");
      setLeads((current) => current.map((item) => item.id === lead.id ? data.lead : item));
    } catch (caught) {
      setError(`${lead.name}: ${caught instanceof Error ? caught.message : "falha no enriquecimento"}`);
    } finally {
      setEnriching((current) => current.filter((id) => id !== lead.id));
    }
  }

  async function enrichVisible() {
    const candidates = visibleLeads.filter((lead) => lead.website && lead.source !== "demo").slice(0, 20);
    for (const lead of candidates) await enrichOne(lead);
    if (!candidates.length) setNotice("Não existem websites reais por analisar nesta vista.");
  }

  async function enrichSelected() {
    const candidates = selectedLeads.filter((lead) => lead.website && !lead.email && lead.source !== "demo").slice(0, 20);
    for (const lead of candidates) await enrichOne(lead);
    if (!candidates.length) setNotice("Os negócios selecionados não têm websites por analisar ou já têm email.");
  }

  function toggleLead(leadId: string) {
    setSelectedIds((current) => current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId]);
  }

  function selectVisible() {
    setSelectedIds((current) => [...new Set([...current, ...visibleLeads.map((lead) => lead.id)])]);
  }

  function exportCsv() {
    const headers = ["estado", "potencial_saas", "nome", "categoria", "area", "morada", "avaliacao", "reviews", "website", "email", "instagram", "telefone", "profissionais", "rececao", "dono_presente", "sem_it", "fonte", "verificado_em", "motivos", "detalhe_potencial"];
    const rows = visibleLeads.map((lead) => [
      lead.qualification, lead.score, lead.name, categories[lead.category].name, lead.area, lead.address,
      lead.rating, lead.reviewCountKnown ? lead.reviewCount : "por validar", lead.website, lead.email, lead.instagram, lead.phone,
      lead.signals.professionals.count, lead.signals.reception.status, lead.signals.ownerPresent.status,
      lead.signals.noItTeam.status, lead.source, lead.verifiedAt, lead.qualificationReasons.join("; "), lead.scoreBreakdown?.map((item) => `${item.label}: ${item.points}/${item.maxPoints}`).join("; "),
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `radar-local-${category}-${area.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Radar Local">
          <span className="brandMark">R</span>
          <span>Radar <b>Local</b></span>
        </a>
        <div className="topActions">
          <span className={`modePill ${provider === "osm" ? "free" : mode}`}><i />{provider === "osm" ? "Gratuito · OSM" : mode === "live" ? "Google Places" : "Google · demonstração"}</span>
          <a className="ghostButton" href="#campanha">Campanha{selectedIds.length ? ` · ${selectedIds.length}` : ""}</a>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <span className="eyebrow">PROSPECÇÃO LOCAL, COM PROVAS</span>
          <h1>Encontra os negócios<br />onde <em>consegues vender.</em></h1>
          <p>Escolhe o setor e a área. O Radar recolhe, filtra e mostra o que ainda precisa de ser confirmado.</p>
        </div>
        <div className="heroMetric">
          <span>Potencial SaaS médio</span>
          <strong>{leads.length ? `${averageOpportunity}/100` : "—"}</strong>
          <small>{leads.length ? priorityLeads === 1 ? "1 lead prioritário com 75+" : `${priorityLeads} leads prioritários com 75+` : "Faz uma pesquisa para começar"}</small>
        </div>
      </section>

      <div className="workspace">
        <aside className="searchPanel">
          <form onSubmit={handleSearch}>
            <div className="panelHeading"><span>01</span><div><h2>Nova pesquisa</h2><p>Define o teu mercado-alvo.</p></div></div>

            <fieldset>
              <legend>Fonte dos negócios</legend>
              <div className="providerSwitch">
                <button type="button" className={provider === "osm" ? "active" : ""} onClick={() => { setProvider("osm"); if (locationMode === "country") setLocationMode("area"); if (category === "custom") setCategory("dental"); }}><b>Gratuito</b><small>OpenStreetMap</small></button>
                <button type="button" className={provider === "google" ? "active" : ""} onClick={() => setProvider("google")}><b>Google</b><small>Requer API key</small></button>
              </div>
            </fieldset>

            <fieldset>
              <legend>Tipo de negócio</legend>
              <div className="categoryGrid">
                {(Object.values(categories) as typeof categories[CategoryKey][]).map((item) => (
                  <button disabled={provider === "osm" && item.key === "custom"} className={category === item.key ? "category active" : "category"} type="button" key={item.key} onClick={() => setCategory(item.key)}>
                    <span>{item.icon}</span>{item.shortName}
                  </button>
                ))}
              </div>
              {category === "custom" && <input value={customQuery} onChange={(event) => setCustomQuery(event.target.value)} placeholder="Ex.: oficinas de bicicletas" required />}
            </fieldset>

            <fieldset>
              <legend>Área</legend>
              <div className="locationModes">
                <button type="button" disabled={provider === "osm"} className={locationMode === "country" ? "active" : ""} onClick={() => setLocationMode("country")}>Portugal</button>
                <button type="button" className={locationMode === "area" ? "active" : ""} onClick={() => setLocationMode("area")}>Uma área</button>
                <button type="button" className={locationMode === "cities" ? "active" : ""} onClick={() => setLocationMode("cities")}>Várias cidades</button>
              </div>
              {locationMode !== "country" && <label className="inputWithIcon"><span>⌖</span><input value={area} onChange={(event) => setArea(event.target.value)} placeholder={locationMode === "cities" ? "Lisboa, Porto, Braga" : "Cidade, concelho ou distrito"} required /></label>}
              {locationMode === "cities" && <small className="costHint">Separa as cidades por vírgulas. Máximo de {provider === "osm" ? 3 : 8} por pesquisa.</small>}
            </fieldset>

            {provider === "google" ? <fieldset>
              <div className="legendRow"><legend>Avaliações Google</legend><span>{filters.minReviews}–{filters.maxReviews}</span></div>
              <div className="twoInputs">
                <label><small>Mínimo</small><input type="number" min="0" value={filters.minReviews} onChange={(event) => setFilter("minReviews", Number(event.target.value))} /></label>
                <label><small>Máximo</small><input type="number" min="1" value={filters.maxReviews} onChange={(event) => setFilter("maxReviews", Number(event.target.value))} /></label>
              </div>
            </fieldset> : <div className="freeNote"><b>Avaliações Google por validar</b><span>O modo gratuito encontra negócios e contactos, mas não fornece reviews Google.</span></div>}

            {supportsProfessionals && <fieldset>
              <div className="legendRow"><legend>N.º de {config.professionalLabel}</legend><span>{filters.minProfessionals}–{filters.maxProfessionals}</span></div>
              <div className="twoInputs">
                <label><small>Mínimo</small><input type="number" min="0" value={filters.minProfessionals} onChange={(event) => setFilter("minProfessionals", Number(event.target.value))} /></label>
                <label><small>Máximo</small><input type="number" min="1" value={filters.maxProfessionals} onChange={(event) => setFilter("maxProfessionals", Number(event.target.value))} /></label>
              </div>
            </fieldset>}

            <fieldset>
              <legend>Requisitos obrigatórios</legend>
              <div className="checks">
                {[
                  ["requireOperational", "Negócio operacional"],
                  ["requirePublicContact", "Contacto público"],
                  ["requireReception", "Receção própria"],
                  ["requireOwnerPresent", "Dono/diretor presente"],
                  ["requireNoItTeam", "Sem equipa interna de IT"],
                ].map(([key, label]) => (
                  <label key={key}><input type="checkbox" checked={Boolean(filters[key as keyof SearchFilters])} onChange={(event) => setFilter(key as keyof SearchFilters, event.target.checked as never)} /><span className="checkmark">✓</span>{label}</label>
                ))}
              </div>
              <label className="probableToggle"><input type="checkbox" checked={filters.acceptProbable} onChange={(event) => setFilter("acceptProbable", event.target.checked)} />Aceitar evidência provável</label>
            </fieldset>

            {provider === "google" && <fieldset>
              <div className="legendRow"><legend>Profundidade</legend><span>até {estimatedRequests} pedidos</span></div>
              <select value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value))}>
                <option value="1">Baixa — 1 pedido</option>
                <option value="2">Média — até 2 pedidos</option>
                <option value="3">Alta — até 3 pedidos</option>
              </select>
              <small className="costHint">Estimativa: até {Math.min(240, estimatedRequests * 20)} candidatos antes de remover duplicados.</small>
            </fieldset>}

            <button className="primaryButton" disabled={loading} type="submit">
              {loading ? <><span className="spinner" />A pesquisar…</> : <>Iniciar pesquisa <span>→</span></>}
            </button>
          </form>
        </aside>

        <section className="resultsPanel">
          <div className="resultsTop">
            <div><span className="sectionNumber">02</span><h2>Resultados</h2>{lastSearch && <small>Verificado em {new Date(lastSearch).toLocaleString("pt-PT")}</small>}</div>
            <div className="resultActions">
              <button onClick={selectVisible} disabled={!visibleLeads.length}>Selecionar vista</button>
              <button onClick={enrichVisible} disabled={!leads.length || enriching.length > 0}>Analisar websites</button>
              <button onClick={exportCsv} disabled={!visibleLeads.length}>Exportar CSV</button>
            </div>
          </div>

          {(notice || error) && <div className={error ? "alert error" : "alert"}><span>{error ? "!" : "i"}</span>{error || notice}</div>}

          <div className="summaryCards">
            <button className={view === "all" ? "summary active" : "summary"} onClick={() => setView("all")}><span>Total</span><strong>{leads.length}</strong></button>
            <button className={view === "qualified" ? "summary active green" : "summary green"} onClick={() => setView("qualified")}><span>Qualificados</span><strong>{counts.qualified}</strong></button>
            <button className={view === "review" ? "summary active amber" : "summary amber"} onClick={() => setView("review")}><span>Por validar</span><strong>{counts.review}</strong></button>
            <button className={view === "rejected" ? "summary active red" : "summary red"} onClick={() => setView("rejected")}><span>Rejeitados</span><strong>{counts.rejected}</strong></button>
          </div>
          {leads.length ? <div className="scoreLegend"><b>Potencial SaaS:</b><span><i className="hot" />75–100 prioritário</span><span><i className="warm" />55–74 promissor</span><span><i className="cold" />0–54 baixa prioridade</span><em>O score é geral; confirma sempre a dor ligada ao SaaS que pretendes criar.</em></div> : null}

          {!leads.length && !loading ? (
            <div className="emptyState">
              <div className="radar"><i /><i /><i /><span /></div>
              <h3>A tua lista começa aqui</h3>
              <p>Configura os filtros à esquerda e inicia uma pesquisa. O modo OpenStreetMap devolve resultados reais sem API key.</p>
            </div>
          ) : loading ? (
            <div className="loadingState"><span className="spinner dark" /><h3>A mapear {locationMode === "country" ? "Portugal" : area}…</h3><p>A recolher candidatos e a aplicar os filtros exatos.</p></div>
          ) : (
            <div className="leadList">
              {visibleLeads.map((lead) => (
                <article className="leadCard" key={lead.id}>
                  <div className="leadMain">
                    <label className="leadSelect" title="Selecionar para campanha"><input type="checkbox" checked={selectedIds.includes(lead.id)} onChange={() => toggleLead(lead.id)} /><span>✓</span></label>
                    <div className={`score ${scoreTier(lead.score)}`}><strong>{lead.score}</strong><small>SaaS</small></div>
                    <div className="leadIdentity">
                      <div className="leadTitle"><h3>{lead.name}</h3><span className={`qual ${lead.qualification}`}>{qualificationText[lead.qualification]}</span></div>
                      <p>{lead.address}</p>
                      <div className="facts">
                        <span>{lead.reviewCountKnown ? <><b>★ {lead.rating?.toFixed(1) ?? "—"}</b> {lead.reviewCount} avaliações</> : <b>Avaliações por validar</b>}</span>
                        <span>{lead.phone || "Telefone não encontrado"}</span>
                        <span>{lead.email || "Email por encontrar"}</span>
                      </div>
                      <ContactActions lead={lead} />
                    </div>
                    <div className="leadLinks">
                      {lead.website && <a href={lead.website} target="_blank" rel="noreferrer">Website ↗</a>}
                      {lead.mapsUrl && <a href={lead.mapsUrl} target="_blank" rel="noreferrer">Fonte ↗</a>}
                      <button disabled={!lead.website || enriching.includes(lead.id) || lead.source === "demo"} onClick={() => enrichOne(lead)}>{enriching.includes(lead.id) ? "A analisar…" : "Analisar"}</button>
                    </div>
                  </div>
                  <details>
                    <summary>Ver potencial, critérios e evidências <span>⌄</span></summary>
                    {lead.scoreBreakdown?.length ? <div className="scoreBreakdown">
                      <div className="breakdownTitle"><b>Potencial SaaS</b><span>{lead.score}/100 · {lead.score >= 75 ? "Prioritário" : lead.score >= 55 ? "Promissor" : "Baixa prioridade"}</span></div>
                      <div className="breakdownGrid">{lead.scoreBreakdown.map((item) => <div key={item.label}><span><b>{item.label}</b><em>{item.points}/{item.maxPoints}</em></span><div className="scoreBar"><i style={{ width: `${(item.points / item.maxPoints) * 100}%` }} /></div><small>{item.detail}</small></div>)}</div>
                    </div> : null}
                    <div className="evidenceGrid">
                      {Object.values(lead.signals).map((signal) => (
                        <div className="evidence" key={signal.label}>
                          <span className={`evidenceDot ${signal.status}`} />
                          <div><b>{signal.label}</b><small>{statusText[signal.status]}</small><p>{signal.detail}</p>{signal.sourceUrl && <a href={signal.sourceUrl} target="_blank" rel="noreferrer">Ver evidência</a>}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
              {!visibleLeads.length && <div className="emptyFilter"><h3>Nenhum resultado nesta categoria</h3><p>Seleciona outra vista ou ajusta os requisitos.</p></div>}
            </div>
          )}
        </section>
      </div>

      <OutreachPanel leads={selectedLeads} onClear={() => setSelectedIds([])} onEnrich={enrichSelected} />

      <section className="configuration" id="configuracao">
        <span className="eyebrow">CONFIGURAÇÃO OPCIONAL</span>
        <h2>Pesquisa grátis; envio ligado à tua própria conta.</h2>
        <div className="configGrid">
          <div><span>1</span><h3>Copia o ficheiro</h3><code>.env.example → .env.local</code></div>
          <div><span>2</span><h3>Adiciona a chave</h3><code>GOOGLE_PLACES_API_KEY=…</code></div>
          <div><span>3</span><h3>Reinicia a app</h3><code>npm run dev</code></div>
        </div>
        <p>A chave nunca é incluída no JavaScript enviado ao browser. Define quotas no Google Cloud antes de fazer pesquisas reais.</p>
        <div className="mailConfig">
          <div><span>EMAIL AUTOMÁTICO</span><h3>Configura o SMTP em <code>.env.local</code></h3><p>Preenche <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> e <code>MAIL_FROM</code>. Só depois altera <code>OUTREACH_ENABLED=true</code> e reinicia a app.</p></div>
          <div><span>PROTEÇÕES</span><h3>Envio individual e auditável</h3><p>Máximo de 10 contactos por lote, limite diário, domínio de email validado, lista “não contactar” e registo local de cada tentativa.</p></div>
        </div>
      </section>

      <footer><span>Radar Local</span><p>{provider === "osm" ? <><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · </> : null}Confirma os sinais prováveis antes do contacto.</p></footer>
    </main>
  );
}
