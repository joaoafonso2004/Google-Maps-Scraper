import type { CategoryConfig, CategoryKey } from "./types";

export const categories: Record<CategoryKey, CategoryConfig> = {
  dental: {
    key: "dental",
    name: "Clínicas dentárias",
    shortName: "Dentárias",
    query: "clínica dentária",
    icon: "✦",
    professionalLabel: "dentistas",
    roleTerms: ["dentista", "médico dentista", "médica dentista", "odontologista"],
    receptionTerms: ["receção", "recepção", "rececionista", "secretariado clínico"],
    ownerTerms: ["diretor clínico", "diretora clínica", "proprietário", "proprietária", "fundador", "fundadora"],
  },
  physio: {
    key: "physio",
    name: "Clínicas de fisioterapia",
    shortName: "Fisioterapia",
    query: "clínica de fisioterapia",
    icon: "◌",
    professionalLabel: "fisioterapeutas",
    roleTerms: ["fisioterapeuta", "fisioterapia"],
    receptionTerms: ["receção", "recepção", "rececionista", "secretariado"],
    ownerTerms: ["diretor clínico", "diretora clínica", "proprietário", "proprietária", "fundador", "fundadora"],
  },
  car_dealer: {
    key: "car_dealer",
    name: "Stands de automóveis",
    shortName: "Stands",
    query: "stand de automóveis",
    icon: "◇",
    roleTerms: ["consultor comercial", "vendedor", "gerente"],
    receptionTerms: ["receção", "recepção", "atendimento", "secretariado"],
    ownerTerms: ["gerente", "proprietário", "proprietária", "fundador", "fundadora"],
  },
  custom: {
    key: "custom",
    name: "Pesquisa personalizada",
    shortName: "Personalizada",
    query: "",
    icon: "+",
    roleTerms: [],
    receptionTerms: ["receção", "recepção", "atendimento"],
    ownerTerms: ["gerente", "proprietário", "proprietária", "fundador", "fundadora"],
  },
};

export function getCategory(key: CategoryKey): CategoryConfig {
  return categories[key] ?? categories.custom;
}
