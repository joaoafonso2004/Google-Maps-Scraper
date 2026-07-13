"use client";

import { useEffect, useMemo, useState } from "react";
import { isBusinessEmail, leadToRecipient, renderOutreachTemplate } from "@/lib/outreach";
import type { Lead } from "@/lib/types";

type OutreachStatus = {
  configured: boolean;
  from?: string;
  dailyLimit: number;
  batchLimit: number;
  suppressed: string[];
};

type Draft = {
  subject: string;
  message: string;
  senderName: string;
  companyName: string;
  postalAddress: string;
};

const initialDraft: Draft = {
  subject: "Uma ideia para {{nome}}",
  message: "Olá,\n\nEstive a ver a {{nome}} em {{cidade}} e reparei numa oportunidade que vos pode ajudar a captar mais pedidos.\n\nFaz sentido enviar-vos um exemplo curto?\n\nObrigado,",
  senderName: "",
  companyName: "",
  postalAddress: "",
};

export function OutreachPanel({
  leads,
  onClear,
  onEnrich,
}: {
  leads: Lead[];
  onClear: () => void;
  onEnrich: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [status, setStatus] = useState<OutreachStatus>({ configured: false, dailyLimit: 20, batchLimit: 10, suppressed: [] });
  const [previewIndex, setPreviewIndex] = useState(0);
  const [lawfulBasisConfirmed, setLawfulBasisConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/outreach/status")
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => setStatus((current) => ({ ...current, configured: false })));
    const saved = localStorage.getItem("radar-local:outreach-draft");
    if (saved) {
      try { setDraft({ ...initialDraft, ...JSON.parse(saved) }); } catch { /* Ignora rascunhos antigos inválidos. */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("radar-local:outreach-draft", JSON.stringify(draft));
  }, [draft]);

  const suppressed = useMemo(() => new Set(status.suppressed.map((email) => email.toLocaleLowerCase("pt"))), [status.suppressed]);
  const recipients = useMemo(() => leads.map(leadToRecipient).filter((recipient) => recipient && !suppressed.has(recipient.email)), [leads, suppressed]);
  const excluded = leads.filter((lead) => !lead.email || !isBusinessEmail(lead.email) || suppressed.has(lead.email.toLocaleLowerCase("pt")));
  const batch = recipients.slice(0, status.batchLimit);
  const previewRecipient = batch[Math.min(previewIndex, Math.max(0, batch.length - 1))];

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function enrichSelected() {
    setEnriching(true);
    setError("");
    setNotice("");
    try {
      await onEnrich();
      setNotice("Websites analisados. Os emails empresariais encontrados já podem entrar no lote.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível analisar os websites.");
    } finally {
      setEnriching(false);
    }
  }

  async function suppress(email: string) {
    setError("");
    const response = await fetch("/api/outreach/suppress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Não foi possível excluir o contacto.");
      return;
    }
    setStatus((current) => ({ ...current, suppressed: [...current.suppressed, data.email] }));
    setNotice(`${data.email} foi adicionado à lista “não contactar”.`);
  }

  async function sendCampaign() {
    setError("");
    setNotice("");
    if (!window.confirm(`Confirmas o envio de ${batch.length} email(s)? Esta ação é real e não pode ser anulada.`)) return;
    setSending(true);
    try {
      const response = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, recipients: batch, lawfulBasisConfirmed, confirmation: "ENVIAR" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar a campanha.");
      setNotice(`${data.sent} email(s) enviados; ${data.failed} falharam. O resultado ficou guardado no registo local.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar a campanha.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="outreach" id="campanha">
      <div className="outreachIntro">
        <div><span className="eyebrow">03 · CONTACTAR</span><h2>Campanha selecionada</h2></div>
        <p>Seleciona manualmente os destinatários, confirma a origem pública de cada contacto e revê a mensagem antes do envio.</p>
      </div>

      <div className="outreachStats">
        <div><span>Selecionadas</span><strong>{leads.length}</strong></div>
        <div><span>Prontas</span><strong>{recipients.length}</strong></div>
        <div><span>A validar</span><strong>{excluded.length}</strong></div>
        <div className={status.configured ? "ready" : "pending"}><span>Remetente</span><strong>{status.configured ? "Pronto" : "Por configurar"}</strong></div>
      </div>

      {!leads.length ? (
        <div className="outreachEmpty"><h3>Seleciona clínicas nos resultados</h3><p>Usa a caixa junto de cada negócio. Só entram no envio contactos empresariais públicos.</p></div>
      ) : (
        <div className="outreachGrid">
          <div className="recipientPanel">
            <div className="outreachHeading"><div><h3>Destinatários</h3><small>Máximo de {status.batchLimit} por lote · {status.dailyLimit} por dia</small></div><button onClick={onClear}>Limpar</button></div>
            <div className="recipientList">
              {leads.map((lead) => {
                const email = lead.email?.toLocaleLowerCase("pt");
                const isSuppressed = Boolean(email && suppressed.has(email));
                const isReady = Boolean(email && isBusinessEmail(email) && !isSuppressed);
                return <div className="recipient" key={lead.id}>
                  <span className={isReady ? "contactState ready" : "contactState"}>{isReady ? "✓" : "!"}</span>
                  <div><b>{lead.name}</b><small>{isSuppressed ? "Não contactar" : lead.email ? isBusinessEmail(lead.email) ? lead.email : "Email pessoal/gratuito excluído" : "Email ainda não encontrado"}</small>{isReady && <em>Fonte: {lead.signals.publicContact.sourceUrl ? "website público" : "registo público"} · {new Date(lead.verifiedAt).toLocaleDateString("pt-PT")}</em>}</div>
                  {isReady && <button title="Adicionar à lista não contactar" onClick={() => suppress(lead.email!)}>Excluir</button>}
                </div>;
              })}
            </div>
            {excluded.some((lead) => lead.website && !lead.email) && <button className="secondaryWide" onClick={enrichSelected} disabled={enriching}>{enriching ? "A procurar contactos…" : "Procurar emails nos websites"}</button>}
          </div>

          <div className="composer">
            <div className="outreachHeading"><div><h3>Mensagem</h3><small>Variáveis: {"{{nome}}"}, {"{{cidade}}"}, {"{{website}}"}</small></div><span className={status.configured ? "smtpBadge ready" : "smtpBadge"}>{status.configured ? status.from : "SMTP desligado"}</span></div>
            <label>Assunto<input value={draft.subject} maxLength={150} onChange={(event) => updateDraft("subject", event.target.value)} /></label>
            <label>Mensagem<textarea value={draft.message} maxLength={5000} rows={9} onChange={(event) => updateDraft("message", event.target.value)} /></label>
            <div className="senderFields">
              <label>Teu nome<input value={draft.senderName} onChange={(event) => updateDraft("senderName", event.target.value)} /></label>
              <label>Empresa<input value={draft.companyName} onChange={(event) => updateDraft("companyName", event.target.value)} /></label>
            </div>
            <label>Morada do remetente<input value={draft.postalAddress} onChange={(event) => updateDraft("postalAddress", event.target.value)} placeholder="Obrigatória no rodapé da mensagem" /></label>
          </div>

          <div className="previewPanel">
            <div className="outreachHeading"><div><h3>Pré-visualização</h3><small>{batch.length ? `${previewIndex + 1} de ${batch.length}` : "Sem contactos prontos"}</small></div>{batch.length > 1 && <div className="previewNav"><button onClick={() => setPreviewIndex((current) => Math.max(0, current - 1))}>←</button><button onClick={() => setPreviewIndex((current) => Math.min(batch.length - 1, current + 1))}>→</button></div>}</div>
            {previewRecipient ? <div className="emailPreview">
              <div><span>Para</span><b>{previewRecipient.email}</b></div>
              <div><span>Assunto</span><b>{renderOutreachTemplate(draft.subject, previewRecipient)}</b></div>
              <pre>{renderOutreachTemplate(draft.message, previewRecipient)}</pre>
              <small>O rodapé de identificação e a instrução “responda REMOVER” são acrescentados automaticamente.</small>
            </div> : <div className="previewEmpty">Analisa os websites ou seleciona resultados que já tenham email empresarial.</div>}
            <label className="legalConfirm"><input type="checkbox" checked={lawfulBasisConfirmed} onChange={(event) => setLawfulBasisConfirmed(event.target.checked)} /><span>Confirmo que estes contactos são empresariais, foram publicados para contacto e que tenho base legal para esta mensagem.</span></label>
            {(notice || error) && <div className={error ? "outreachNotice error" : "outreachNotice"}>{error || notice}</div>}
            <button className="sendButton" disabled={!status.configured || !batch.length || !lawfulBasisConfirmed || sending || !draft.senderName || !draft.companyName || !draft.postalAddress || draft.message.length < 10} onClick={sendCampaign}>{sending ? "A enviar…" : status.configured ? `Enviar ${batch.length} email(s)` : "Configura o remetente para enviar"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
