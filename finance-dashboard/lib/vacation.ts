// In-person purchases made outside Portugal count as vacation. Plaid sends no country for BofA purchases, only
// the card descriptor (which usually ends with the city), so trips are inferred from the pattern of purchases:
// a trip is a run of days with in-person purchases from 2+ merchants and no purchase located in Portugal.
// Shops abroad that you buy from online never qualify: Plaid marks them online, or you also buy from them on
// days you were shopping in Portugal.

export interface VacationInput {
  id: string;
  date: string;
  amount: number;
  payee: string | null;
  category: string | null;
  channel?: string | null; // Plaid payment_channel: "in store" | "online" | "other"
  descriptor?: string | null; // Plaid raw name, e.g. "BAO BROTHERS MIKONOS"
}

const PORTUGAL = new RegExp(
  [
    "PORTUGAL",
    "\\b\\d{4}-\\d{3}\\b", // Portuguese postal code
    "GLOVO \\d{2}[A-Z]{3} LI", // Glovo Lisbon orders
    "PINGO DOCE|CONTINENTE|MINIPRECO|MINIPREÇO",
    "LISBOA|LISBON|CASCAI|\\bCASC\\b|ESTORIL|SINTRA|OEIRAS|CARCAVELOS|PAREDE|AMADORA|ALMADA|SETUBAL|CAPARICA",
    "ERICEIRA|MAFRA|SEIXAL|BARREIRO|LOURES|ODIVELAS|COMPORTA|MELIDES|GRANDOLA|SESIMBRA|ARRABIDA|CAIS DO S",
    "\\bPORTO\\b|MATOSINHOS|\\bGAIA\\b|BRAGA|GUIMARAES|AVEIRO|COIMBRA|VISEU|LEIRIA|NAZARE|OBIDOS|PENICHE",
    "EVORA|\\bBEJA\\b|CAMPO MAIOR|ELVAS|SANTAREM|TOMAR|FATIMA|SAO JOAO DAS",
    "\\bFARO\\b|ALBUFEIRA|\\bLAGOS\\b|PORTIMAO|TAVIRA|LOULE|VILAMOURA|QUARTEIRA|SAGRES|ALVOR|CARVOEIRO",
    "FUNCHAL|MADEIRA|PONTA DELGADA|ACORES|AZORES",
  ].join("|"),
  "i",
);

const NOT_A_PURCHASE = new Set(["Transfer", "Loan payments", "Trades", "Income", "Investments"]);
const SKIP_PAYEE = /payment|transfer|\bfee\b|interest/i;
const MAX_GAP_DAYS = 3; // days without purchases inside a trip
const EDGE_DAYS = 2; // travel days before/after, e.g. airport purchases on the way out

const dayNum = (d: string) => Math.round(Date.parse(d) / 864e5);
const merchant = (t: VacationInput) => (t.payee ?? t.descriptor ?? "").trim().toLowerCase();

export function vacationIds(txs: VacationInput[], exclude: Set<string> = new Set()): Set<string> {
  const inPerson = txs.filter(
    (t) =>
      t.amount < 0 &&
      t.channel === "in store" &&
      !exclude.has(t.id) &&
      !NOT_A_PURCHASE.has(t.category ?? "") &&
      !SKIP_PAYEE.test(`${t.payee ?? ""} ${t.descriptor ?? ""}`),
  );
  const isPortugal = (t: VacationInput) => PORTUGAL.test(`${t.descriptor ?? ""} ${t.payee ?? ""}`);
  const portugalDays = new Set(inPerson.filter(isPortugal).map((t) => dayNum(t.date)));
  const elsewhere = inPerson.filter((t) => !isPortugal(t));

  // Days with purchases elsewhere and none in Portugal, grouped into trips.
  const byDay = new Map<number, VacationInput[]>();
  for (const t of elsewhere) {
    const d = dayNum(t.date);
    if (!portugalDays.has(d)) byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => a - b);
  const trips: Array<[number, number]> = [];
  let group: number[] = [];
  const close = () => {
    const merchants = new Set(group.flatMap((d) => byDay.get(d)!.map(merchant)));
    if (group.length && merchants.size >= 2) trips.push([group[0] - EDGE_DAYS, group[group.length - 1] + EDGE_DAYS]);
    group = [];
  };
  for (const d of days) {
    const prev = group[group.length - 1];
    const portugalBetween = prev !== undefined && Array.from({ length: d - prev - 1 }, (_, i) => prev + 1 + i).some((x) => portugalDays.has(x));
    if (prev !== undefined && (d - prev > MAX_GAP_DAYS || portugalBetween)) close();
    group.push(d);
  }
  close();

  const inTrip = (t: VacationInput) => trips.some(([a, b]) => dayNum(t.date) >= a && dayNum(t.date) <= b);
  // Merchants you also buy from while home are online shops, even when a charge lands during a trip.
  const remote = new Set(elsewhere.filter((t) => !inTrip(t)).map(merchant));
  return new Set(elsewhere.filter((t) => inTrip(t) && !remote.has(merchant(t))).map((t) => t.id));
}
