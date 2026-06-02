# ADR-025: Visual Workflow Designer

## Status

Accepted

Builds on ADR-007 (workboard request planning), ADR-014 (work request
destination and context), ADR-016 (capability-aware workboard planning), and
ADR-017 (background plan generation). Adds a **manual, visual authoring
surface** alongside the AI planner; it does not supersede or replace the
planner. The designer compiles to the existing `WorkboardDraftPlan` and reuses
the existing start path unchanged — no change to the work runtime, run
lifecycle, or dependency execution from ADR-006. Relates to ADR-023 (scheduled
agent tasks): the scheduler is the intended future trigger source but is out of
scope here.

The interaction and presentation model of the Workflows screen is covered by
**ADR-026 (workflow designer interaction model)**, which builds on this ADR and
**revises** the "Run = new WR only" detail below: the Workflows-screen Run gains
a split control with per-workflow target memory (new WR or append into an
existing WR).

## Date

2026-06-01

## Context

The AI planner (ADR-007, ADR-016) takes a free-text request and produces a
`WorkboardDraftPlan` — a DAG of `WorkboardDraftItem`s, each with a title,
instruction, expected output, an assigned agent, dependencies, and priority.
The user reviews this in the `PlanReviewDialog` and either starts or discards
it. It is a one-shot, request-in → plan-out flow.

The user wants a second way to author plans: a **visual canvas** (React Flow
style) where they manually place agent tasks, draw dependencies, and run the
result — and, crucially, **save the design and re-run / iterate on it later**.
The motivating mental model is "I design a flow visually, run it, then keep
improving it."

The key insight that bounds this work: **`WorkboardDraftPlan` is already a
DAG**, and a dependency edge already does real data passing — at execution time
the runtime injects each upstream run's `resultSummary`, `artifactRefs`, and
`changedFiles` into the downstream run's prompt as "Upstream work available"
(`runtime/service.ts`). So "one agent uses another's output" is what a plain
dependency edge already means. The visual designer is therefore largely a **new
authoring + persistence surface over the same runtime**, not a new execution
engine.

Several dimensions were walked individually before converging on the decisions
below.

### Relationship to the AI Planner: Replace, Alternative, or Post-Edit

Üç konumlandırma: AI planner'ın yerini almak, yanında alternatif giriş noktası
olmak, ya da planner çıktısının üzerine düzenleme katmanı olmak. **Alternatif
giriş noktası** seçildi. Planner çalışıyor ve değerli; onu riske atmanın
gerekçesi yok. Designer üçüncü bir yol açar (boş canvas'tan manuel tasarla) ama
aynı `WorkboardDraftPlan`'ı üretip aynı start yolundan geçer. Böylece yürütme
motoru, run lifecycle ve dependency çözümü hiç değişmeden yeniden kullanılır.

### Execution Semantics: Same Engine or New Control-Flow Engine

Kullanıcı "çıktıyı kontrol et, uygunsa devam et" gibi düğümler de istedi. İki
seçenek: **(A)** canvas yalnızca agent-task düğümleri + bağımlılık kenarları
üretir (kontrol işleri de birer agent task'tır), çıktı `WorkboardDraftPlan`,
motor değişmez; **(B)** gerçek koşullu dallanma, skip, döngü, agent-olmayan
fonksiyon düğümleri — bu, yürütme motorunu, DB şemasını ve run lifecycle'ı
genişletmeyi gerektirir, `WorkboardDraftPlan` bunu ifade edemez.

**(A) seçildi.** Verilen örnekler (A) içinde çözülüyor: "çıktıyı diğeri
kullansın" = düz kenar (zaten var); "kontrol et, uygunsa devam et" = bir
checker agent task'ı, gerekirse mevcut InputRequest ile insan onayı. Gerçek
otomatik *dallanma* ihtiyacı kanıtlanana kadar (B)'nin maliyeti
üstlenilmez. (A) çalışan bir ürünü hızlıca verir; (B) ayrı bir motor projesidir
ve ileride "değer görülürse" ele alınır.

### Node Semantics: Task or Agent

Canvas'taki düğüm bir **task** mı yoksa bir **agent** mı? Task seçildi. İnsan
zihinsel modeli iş adımlarını tasarlamak üzerine kurulu; agent o adımı *yapan*
kaynaktır. Node = task, `WorkboardDraftItem`'a birebir eşlenir (sıfır impedans),
agent bir dropdown'dan seçilir, aynı agent birden çok node'da görünebilir.
"Agent = içinde birden çok adım taşıyan konteyner" modeli, node-içi gizli
sıralamayı görünür kenarlara çevirme zorunluluğu getirir — gereksiz karmaşa.

### Dependency Source of Truth: Edges or Checklist

`WorkboardDraftItem.dependsOnTempIds` iki yerden düzenlenebilir: canvas
kenarları ve mevcut `DraftItemEditor`'ın `DraftDependencyChecklist`'i. İkisi
birden aynı alanı yazarsa senkron kâbusu ve kafa karışıklığı doğar. **Kenar tek
kaynak** seçildi — görsel designer'ın bütün anlamı budur. Node-inspector
`DraftItemEditor`'ın yalnız task alanlarını (title/agent/instruction/
expectedOutput/priority) paylaşılan bir alt-bileşen üzerinden gösterir;
`DraftDependencyChecklist` ve `DraftDependencyMap` workflow inspector'dan çıkar.
Döngüler kenar çizimi sırasında mevcut `draftItemDependsOn` ile engellenir.

### Persistence: One-Shot or Saved Reusable Design

Tasarımın ömrü tek seferlik mi (tasarla → çalıştır → at, mevcut `PendingPlan`
gibi) yoksa kaydedilip tekrar çalıştırılabilir mi? **Kaydedilebilir** seçildi —
kullanıcının açık gereksinimi "çalıştırdıktan sonra iyileştir." Bunun bir
sonucu: `WorkboardDraftPlan` modelinde node konumu (x/y) yok, ve `pending_plans`
yalnızca geçici taslak JSON'ı tutuyor. Elle dizilen yerleşim hiçbir yerde
saklanmıyorsa canvas her açılışta otomatik yeniden dizilir ve düzenleme
kaybolur. Bu yüzden tasarım, konumları da içeren yeni bir kalıcı entity'de
saklanır.

### Entity Model: Durable Design vs. Ephemeral Run

İki katman ayrıldı. **Kalıcı katman** yeni bir `workflow_designs` tablosudur:
`id`, `name`, `description` ve tek bir canvas JSON blob'u (node'lar — task
alanları + x/y — ve kenarlar). **Çalışma katmanı değişmez:** "Çalıştır" deyince
tasarım `WorkboardDraftPlan`'a derlenir (x/y atılır), `description` →
`originalRequest` olur, mevcut start yolundan geçer, yeni `WorkRequest` +
`WorkRun`'lar doğar. İterasyon = tasarımı düzenle; tekrar çalıştır = yeni bir
WorkRequest. `description`'ın `originalRequest` olması doğal: o alan zaten
çalışma klasörü adına fallback ve agent prompt'larına "Original request:..."
bağlamı olarak gidiyor (`ipc/register.ts`), görsel tasarımın da bir üst-amaç
metni vermesi gerekiyor.

### Run History Linkage

Tasarım başına çalışma geçmişi gerekli mi? **Evet** — kullanıcının döngüsü
"çalıştır → sonucu gör → iyileştir → tekrar çalıştır"; bu döngünün ortasında
"bu tasarımın geçmiş run'ları" durur. `WorkRequest`'e nullable bir
`workflowDesignId` eklenir. Maliyeti minik (tek kolon + start yolunda set),
motora dokunmaz, sadece iz bırakır. Baştan koymak, sonradan geçmişi geriye
dönük bağlayamamaktan ucuzdur. Versiyon geçmişi (eski tasarım sürümlerini
saklama) tutulmaz — yerinde düzenlenir; çalışmalar zaten ayrı WorkRequest'ler
olarak iz bırakır.

### Trigger: Manual, Scheduled, or Event

Tetikleyici ekseni hedef ekseninden bağımsızdır. v1'de **yalnız manuel**
tetik. Asıl mimari karar şudur: tetikleyici-bağımsız bir
`compileDesign(designId, target)` fonksiyonu — kim çağırırsa çağırsın (manuel
buton, ileride cron, ileride event) fark etmez. Cron (ADR-023'ün
`SchedulerService`'i hazır), dış event ve self-trigger v1 dışında bırakıldı;
her tetikleyici workflow'un *çevresini* büyütür, tasarımın kendisini değil, ve
odağı dağıtır.

### Target: New WR or Append to Existing WR

Hedef ekseni: doğan run'lar nereye düşer. **İkisi de** v1'de — yeni WR veya
mevcut WR'a ekle. "Mevcut WR'a ekle" zaten follow-up mekanizmasının yaptığı şey
(`ipc/register.ts`, `WorkboardStartFollowUp` + `destinationRequestId`). Eklenen
node'lar **kendi içinde kapalı bir alt-DAG**'dır: mevcut canlı run'lara kenar
yoktur, `anchorRunId` boş geçilir. Eklenen workflow'un var olan run çıktılarını
tüketmesi (context-wiring) v1 dışıdır — bu parametreleştirme toprağıdır.

### Surface: New Screen or Inside Workboard

Kaydedilmiş tasarım, Agents ve Schedules gibi **kalıcı, yeniden kullanılabilir
bir varlık**tır. Bu yüzden yeni bir üst-seviye **Workflows** ekranı seçildi
(liste + canvas editör), `routes.ts` nav pattern'ine uygun. Workboard run-
merkezli bir yüzeydir; yeniden kullanılabilir bir tasarımı oraya gömmek onu
run'ların içinde kaybeder. Çalıştırınca doğan WR zaten Workboard'da görünür —
iki ekran doğal olarak bağlanır.

### Trigger Funnel and Mode-Conditional Composer

Üç tetik yeri düşünüldü: yalnız Workflows ekranı, composer'a ikinci mod, ya da
hepsi. **Tek huni** seçildi: composer asıl tetik mekanizmasıdır. Composer zaten
hedef eksenini taşıyor (`destinationRequestId` boş → yeni WR, dolu → mevcut
WR'a devam), bu yüzden composer'a "kaydedilmiş workflow seç" modu eklemek her
iki hedefi de bedavaya verir — ayrı hedef seçici yazmaya gerek kalmaz.
Workflows ekranındaki "Çalıştır" ayrı bir run yolu kurmaz; composer'ı o
workflow seçili + hedef=yeni WR olacak şekilde önceden doldurarak açar.

Composer mod'a göre **koşullu render** edilir: workflow-modunda free-text
request textarea'sı **gizlenir**, yalnız workflow akışının ihtiyacı (hedef
seçici, seçili tasarım) görünür. Workboard'dan girince kullanıcı iki moddan
birini seçer; Workflows ekranından girince doğrudan workflow-modu açılır.

### Item Cap

`WorkboardDraftPlanSchema` item sayısını 16 ile sınırlıyor. Bu bir yürütme
zorunluluğu değil, planner çıktısına konmuş bir guardrail; runtime'da
eşzamanlılık limiti yok. **16 korunur.** Cap'i yükseltmek, eşzamanlılık limiti
olmadığı için geniş paralel tasarımlarda çok sayıda agent CLI process'ini aynı
anda tetikleyip makineyi boğma riskini açar — ki o bir concurrency limiter
(motora dokunuş) gerektirir. Verilen örnekler 16'nın çok altında; limit gerçek
ve tekrarlı vurulana kadar şema gevşetilmez.

### Runtime Variables

Kullanıcı "dışarıdan alınacak variable" ihtiyacını gündeme getirdi (her run'da
değişen girdi). v1 dışı bırakıldı; tasarımlar **self-contained**. İleride saf
**compile-time substitution** olarak eklenecek: node instruction'larındaki
`{{placeholder}}`'lar `WorkboardDraftPlan`'a derlemeden hemen önce değerlerle
değiştirilir; motor variable'lardan haberdar olmaz. Bu, run-ortasında insana
sorulan mevcut InputRequest'ten farklıdır (o run *içinde*, bu run *başlamadan*).

## Decision

Introduce a **Visual Workflow Designer**: a manual, canvas-based authoring
surface that produces durable, reusable workflow designs which compile to the
existing `WorkboardDraftPlan` and run through the existing start path.

### Scope Boundary

- **Node = Task.** Each canvas node maps 1:1 to a `WorkboardDraftItem`
  (title, instruction, expectedOutput, assignedAgentId, priority). Agent
  selected via dropdown.
- **Edge = dependency**, and the single source of truth for
  `dependsOnTempIds`. No checklist editing of dependencies in the workflow
  inspector. Cycles are rejected at edge-draw time via `draftItemDependsOn`.
- Only agent-task nodes and dependency edges. No control-flow / function /
  conditional / loop nodes (scope B, deferred).

### Data Model

New `workflow_designs` table:

```ts
id: text('id').primaryKey()
name: text('name').notNull()
description: text('description').notNull().default('')
canvas: text('canvas', { mode: 'json' }).$type<WorkflowCanvas>().notNull()
createdAt: text('created_at').notNull()
updatedAt: text('updated_at').notNull()
```

`WorkflowCanvas` is a single JSON blob holding nodes (task fields + `x`/`y`
position) and edges (source/target node ids). Positions live only here.

Add a nullable `workflowDesignId` column to `work_requests` for run-history
linkage. Schema version bumped via standard Drizzle generate.

### Compilation (Design → Plan)

A trigger-agnostic `compileDesign(designId, target)`:

1. Loads the design.
2. Validates (see Run Gating below).
3. Maps each node to a `WorkboardDraftItem`, stripping `x`/`y`. Stable design
   node ids are mapped to sequential 1-based `item-1, item-2, …` tempIds
   (required by the shared `validateWorkboardDraftPlanDependencies` validator);
   edges (`source → target`) become the target's `dependsOnTempIds`.
4. Uses `description` as `originalRequest`.
5. Dispatches to the existing start path:
   - `target = { kind: 'new' }` → `WorkboardStartRequestPlan` path → new WR.
   - `target = { kind: 'append', requestId }` → follow-up path
     (`WorkboardStartFollowUp`), `anchorRunId` empty, appended nodes form a
     self-contained sub-DAG with no edges to existing live runs.
6. Sets `workRequests.workflowDesignId = designId` only on the **new-WR** path.
   The append path does **not** set it — the target WR has its own identity and
   may already be linked to a different design or to none; overwriting that link
   would be wrong. Consequence: per-design run history covers new-WR runs only
   in v1; append runs are not attributed back to the design.

No change to the work runtime, run lifecycle, or dependency execution.

### Run Gating

"Run" is disabled (with the offending node flagged) unless:

- At least one node exists, and at most 16.
- Every node has a non-empty title, instruction, expectedOutput, and a
  resolvable `assignedAgentId`.
- No dependency cycle.

A node whose `assignedAgentId` points to a deleted agent is marked invalid;
run is blocked until reassigned.

### Surface and Trigger Funnel

- New top-level **Workflows** screen (nav item in `routes.ts` +
  `workflows-screen.tsx`): list of saved designs + canvas editor with a node
  inspector reusing `DraftItemEditor`'s task fields (extracted to a shared
  component, dependency checklist/map omitted).
- The **composer** is the single trigger mechanism. It gains a mode toggle:
  "Describe (AI plans)" ↔ "Pick a saved workflow." In workflow mode the
  free-text request textarea is hidden; only the target picker and selected
  design are shown.
- The Workflows-screen "Run" action runs the design directly into a new Work
  Request (via the same `workflowRun` IPC) and navigates to the Workboard.
  Running into an existing request (append) is offered from the composer's
  workflow mode. Both paths share the single `workflowRun` / `compileDesign`
  funnel — the single-funnel guarantee is at the IPC/compile layer, not the UI.
- `handleSubmitComposer` gains a branch that sends a compiled plan instead of
  request text.

### Library

React Flow (`@xyflow/react`) is added as a renderer-only dependency for the
canvas.

## Consequences

The designer adds no new execution semantics. Because it compiles to the
existing `WorkboardDraftPlan` and dispatches through the existing start and
follow-up paths, the work runtime, run lifecycle, dependency resolution, and
upstream-output injection are all reused untouched. The blast radius is the
renderer (new screen + canvas + composer mode), one new table, one nullable
column, and a `compileDesign` function — not the engine.

Making the composer the single trigger funnel means "run into a new WR" and
"run into an existing WR" share one code path and one target mechanism (the
composer's existing new-vs-continue behavior). Adding cron or event triggers
later is wiring a new caller to `compileDesign`, not building a new run path.

Edges as the single source of truth keep the visual model honest — there is
exactly one place to express a dependency. Reusing `DraftItemEditor`'s task
fields keeps the planner dialog and the workflow inspector visually and
behaviorally consistent through a shared component.

Persisting node positions in `workflow_designs` makes the canvas a real design
tool (layout survives reopen) without touching `WorkboardDraftPlan`, which
stays a pure execution contract. The nullable `workflowDesignId` link gives the
"run → inspect → improve → re-run" loop its history view at minimal cost.

Keeping the 16-item cap avoids an unbounded parallel-process foot-gun that
would otherwise force a concurrency limiter into the engine, violating the
"don't touch the engine" principle.

## Out of Scope

The following were considered and explicitly deferred:

- **Control-flow / function nodes** (conditionals, gates, loops, skip,
  non-agent nodes) — scope B, a separate engine project.
- **Runtime variables / parameters** — future compile-time `{{placeholder}}`
  substitution before `WorkboardDraftPlan` compilation; distinct from mid-run
  InputRequest.
- **Cron, event, and self triggers** — wired into `compileDesign` later
  (cron via ADR-023's `SchedulerService`).
- **Appended nodes consuming existing run outputs** (context-wiring into a
  live WR).
- **Raising the 16-item cap** and the concurrency limiter it would require.
- **Design version history** — designs are edited in place.
