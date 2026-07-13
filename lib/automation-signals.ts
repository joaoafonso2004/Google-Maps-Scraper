import type { Evidence } from "./types";

type AutomationInput = {
  html: string;
  text: string;
  pageCount: number;
  hasMobilePhone: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasContactForm: boolean;
  sourceUrl: string;
};

export function detectAutomationSignals(input: AutomationInput): { noApp: Evidence; manualContact: Evidence } {
  const lowerText = input.text.toLocaleLowerCase("pt");
  const hasOwnApp = /apps\.apple\.com|play\.google\.com\/store\/apps/i.test(input.html) || ["descarregar a nossa app", "descarregue a nossa app", "aplicação móvel", "aplicação para telemóvel"].some((term) => lowerText.includes(term));
  const hasOnlineBooking = ["marcação online", "marcações online", "agendamento online", "agendar online", "reservar online", "book online"].some((term) => lowerText.includes(term)) || /doctoralia|doctolib|calendly|simplybook|booksy|fresha/i.test(input.html);
  const hasClientPortal = ["área de cliente", "área do cliente", "portal do cliente", "portal de cliente", "portal do paciente", "área do paciente"].some((term) => lowerText.includes(term));
  const explicitlyManual = ["marcação por telefone", "marcações por telefone", "agendamento por telefone", "marcação via whatsapp", "marcações via whatsapp", "agendamento via whatsapp"].some((term) => lowerText.includes(term));
  const mobileOnly = input.hasMobilePhone && !input.hasEmail && !input.hasContactForm;

  const noApp: Evidence = hasOwnApp
    ? { status: "contradicted", label: "Sem app própria", detail: "Foi encontrada uma aplicação própria na App Store ou Google Play.", sourceUrl: input.sourceUrl }
    : { status: input.pageCount > 1 ? "probable" : "unverified", label: "Sem app própria", detail: input.pageCount > 1 ? "Não foram encontradas ligações ou referências a uma aplicação própria; é uma inferência a confirmar." : "Foram analisadas poucas páginas para inferir se existe uma aplicação própria.", sourceUrl: input.sourceUrl };

  const manualContact: Evidence = hasOnlineBooking || hasClientPortal
    ? { status: "contradicted", label: "Contacto/processo manual", detail: `Já foi encontrado ${hasOnlineBooking ? "um fluxo de marcação online" : "um portal de cliente"}.`, sourceUrl: input.sourceUrl }
    : explicitlyManual
      ? { status: "confirmed", label: "Contacto/processo manual", detail: "O website indica explicitamente marcações ou agendamentos por telefone/WhatsApp.", sourceUrl: input.sourceUrl }
      : mobileOnly
        ? { status: "probable", label: "Contacto/processo manual", detail: "O telemóvel é o único canal estruturado encontrado; não foi identificado email, formulário, marcação online ou portal.", sourceUrl: input.sourceUrl }
        : input.hasPhone || input.hasEmail
          ? { status: "probable", label: "Contacto/processo manual", detail: "Foram encontrados contactos diretos, mas não foi identificada marcação online, portal de cliente ou outra automação.", sourceUrl: input.sourceUrl }
          : { status: "unverified", label: "Contacto/processo manual", detail: "Não há dados suficientes para perceber como são tratados pedidos e marcações.", sourceUrl: input.sourceUrl };

  return { noApp, manualContact };
}
