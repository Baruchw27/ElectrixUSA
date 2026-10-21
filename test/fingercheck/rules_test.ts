import { weekHours, nyMidnight, dkey } from "./lib.ts";
const D = (s: string) => new Date(s).getTime();  // ISO with offset
let ok = 0, bad = 0; const eq = (n: string, a: number, b: number) => { if (Math.abs(a - b) < 0.01) ok++; else { bad++; console.log("FAIL", n, a, b); } };
const ws = nyMidnight("2026-10-18"), we = nyMidnight("2026-10-25");
eq("ws is NY midnight Sun Oct 18", ws, D("2026-10-18T00:00:00-04:00")); eq("we", we, D("2026-10-25T00:00:00-04:00"));
eq("winter DST: Nov 1 midnight", nyMidnight("2026-11-01"), D("2026-11-01T00:00:00-04:00")); eq("Nov 2 midnight EST", nyMidnight("2026-11-02"), D("2026-11-02T00:00:00-05:00"));
const P = (id: string, who: string, i: string, o: string, extra: any = {}) => ({ id, who, in: D(i), out: D(o), ...extra });
const day = "2026-10-19T", z = "-04:00";
const t = (h: string) => D(day + h + z);
const run = (ps: any[]) => weekHours(ps, ws, we, D("2026-10-24T12:00:00-04:00"));
// 7:00-16:00 = 9h
eq("no lunch 9h", run([P("a", "u", day+"07:00:00"+z, day+"16:00:00"+z)]).u.payable, 9);
eq("30 lunch paid", run([P("a", "u", day+"07:00:00"+z, day+"16:00:00"+z, { breaks: [{ s: t("12:00:00"), e: t("12:30:00") }] })]).u.payable, 9);
eq("60 lunch -> 20 unpaid", run([P("a", "u", day+"07:00:00"+z, day+"16:00:00"+z, { breaks: [{ s: t("12:00:00"), e: t("13:00:00") }] })]).u.payable, 9 - 20/60);
eq("75 lunch -> 35 unpaid", run([P("a", "u", day+"07:00:00"+z, day+"16:00:00"+z, { breaks: [{ s: t("12:00:00"), e: t("13:15:00") }] })]).u.payable, 9 - 35/60);
eq("25+25 -> 10 unpaid", run([P("a", "u", day+"07:00:00"+z, day+"16:00:00"+z, { breaks: [{ s: t("10:00:00"), e: t("10:25:00") }, { s: t("12:00:00"), e: t("12:25:00") }] })]).u.payable, 9 - 10/60);
eq("material run 45 not deducted", run([P("a", "u", day+"07:00:00"+z, day+"16:00:00"+z, { trips: [{ left: t("09:00:00"), back: t("09:45:00") }] })]).u.payable, 9);
eq("60 lunch inside 90 run -> 0 unpaid", run([P("a", "u", day+"07:00:00"+z, day+"16:00:00"+z, { trips: [{ left: t("11:30:00"), back: t("13:00:00") }], breaks: [{ s: t("12:00:00"), e: t("13:00:00") }] })]).u.payable, 9);
eq("75 lunch 15 overlap -> 60 outside -> 20 unpaid", run([P("a", "u", day+"07:00:00"+z, day+"16:00:00"+z, { trips: [{ left: t("11:45:00"), back: t("12:15:00") }], breaks: [{ s: t("12:00:00"), e: t("13:15:00") }] })]).u.payable, 9 - 20/60);
// site switch: two entries same day share the 40
eq("switch: 30 + 30 lunch across two entries -> 20 unpaid", (() => { const r = run([P("a", "u", day+"07:00:00"+z, day+"11:00:00"+z, { breaks: [{ s: t("09:00:00"), e: t("09:30:00") }] }), P("b", "u", day+"11:00:00"+z, day+"16:00:00"+z, { breaks: [{ s: t("12:00:00"), e: t("12:30:00") }] })]); return r.u.payable; })(), 9 - 20/60);
eq("rejected not counted", run([P("a", "u", day+"07:00:00"+z, day+"16:00:00"+z, { rejected: true }), P("b", "u", "2026-10-20T07:00:00"+z, "2026-10-20T08:00:00"+z)]).u.payable, 1);
// overnight belongs to start day
eq("overnight 22:00-06:00 = 8h on Mon", run([P("a", "u", day+"22:00:00"+z, "2026-10-20T06:00:00"+z)]).u.days[1], 8);
// OT: 5 x 9h = 45 -> 5 OT
const five = [19,20,21,22,23].map((d,i)=>P("p"+i,"u",`2026-10-${d}T07:00:00${z}`,`2026-10-${d}T16:00:00${z}`));
const r5 = run(five).u; eq("45h reg 40", r5.reg, 40); eq("45h ot 5", r5.ot, 5);
// saturday counts in same week, next Sunday doesn't
eq("Saturday in week", run([P("a","u","2026-10-24T07:00:00"+z,"2026-10-24T09:00:00"+z)]).u.days[6], 2);
eq("next Sunday excluded", (run([P("a","u","2026-10-25T07:00:00"+z,"2026-10-25T09:00:00"+z)]).u||{payable:0}).payable, 0);
console.log(`${ok} passed, ${bad} failed`);
