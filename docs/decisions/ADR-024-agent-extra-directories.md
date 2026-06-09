# ADR-024: Per-Agent Extra Directories

## Status

Accepted

Builds on ADR-008 (workspace artifacts and handoffs) and ADR-018 (agent
ownership). Extends the "agent-owned support directory" pattern from ADR-008
to a second category — **user-configured external directories** — using the
same provider-native extra-directory mechanisms. Does not relax ADR-008's
rule against agent-prompted absolute paths: extra directories are
user-configured through a native picker, never inferred from agent output.
Supersedes no prior decision.

Context note updated by ADR-031 (folder-scoped agent isolation): where this ADR
describes the CLI `cwd`/sandbox as "the workspace root," that base is now the
per-Work-Request / per-conversation working folder. The per-agent
extra-directory mechanism, validation, and read+write semantics in this ADR are
unchanged — extra directories remain the deliberate, user-configured way to
grant access outside that folder, and the OS-level read-only/sandbox work
deferred here is the same future work ADR-031 records under "Sandbox
calibration."

## Date

2026-05-26

## Context

Each Ordinus agent runs against a workspace root — a single directory that
defines the CLI's `cwd` and is the sandbox for writes. This works as long as
all material the agent needs lives under that root. In practice users have
folders outside the workspace they want a specific agent to read and write:
a spec repo, a notes vault, a sibling project, a shared design folder.

Today the only way to enable this is to physically merge or symlink those
folders into the workspace, which contaminates the workspace and forces every
agent on that workspace to see them. The user wants per-agent extra access:
"this agent can also touch these folders," scoped to a single agent and
persisted across runs.

The three provider CLIs already expose the capability:

- Claude: `--add-dir <path>` (repeated)
- Codex: `--add-dir <path>` (repeated)
- Gemini: `--include-directories <a,b,c>` (single comma-joined flag)

`agentHomePath` is already passed as one extra directory through these flags
today. The infrastructure exists; what's missing is user-facing configuration,
validation, IPC, and prompt-side disclosure.

Several dimensions were walked individually before converging on the decisions
below.

### Scope: Per-Agent, Per-Workspace, or Per-Run

Three configuration loci were considered: per-agent (kalıcı, agent profilinde),
per-workspace (tüm agent'lar paylaşır), per-run (her koşumda elden). Per-agent
seçildi. Kullanıcı niyeti "bu agent şu klasöre erişsin" şeklinde agent-merkezli
formüle edildi; per-workspace fazla geniş (her agent'a aynı izni verir),
per-run her koşumda elden ekleme gerektirir ve aynı agent'ı tekrar tekrar
koşan iş akışında (schedules, workboard) yorucu olur. Per-run override v1
kapsamında değil.

### Path Validation: Eager, Lazy, or Strict

Üç model: eager (kayıtta doğrula, var olmayan path'i reddet), lazy (kayda al,
koşumda var olanı kullan), strict (eager + path mutlaka var olduğu sürece
silinmesini engelle). Lazy seçildi. Harici disk ve network share senaryoları
gerçek: agent profili kalıcıdır ama disk takılı olmayabilir. Eager kayıt
anında doğrulayıp koşum anında varlığı garanti etmez. Lazy model UI'da
"missing" rozeti ile şeffaf hata sinyali verir; koşum tüm liste yerine var
olan alt kümeyle devam eder.

Doğrulama, kullanıcı path eklediğinde de yapılır (kayıtta da) — ama silinmeyi
engellemek için değil, yanlış girilen path'i baştan elemek için.

### Read/Write Boundary

Üç sağlayıcı CLI'sı da granular per-dizin "salt-okunur" sunmuyor:
`--add-dir` / `--include-directories` tam erişim verir. UI'da "read-only"
seçeneği koymak yanıltıcı bir güvenlik hissi üretir — kullanıcı "salt-okunur"
seçer, CLI yazar, kullanıcı haklı olarak şaşırır. Tek mod: read+write,
kullanıcı klasör eklediğinde tam erişim verdiğini bilir. Gerçek read-only
ileride OS-level (sandbox-exec, bind-mount) ile düşünülür, soft prompt ile
değil.

### Path Constraints

İzin verilse de bazı path'ler hemen hemen her zaman yanlış niyettir:

- **Workspace içi:** Zaten erişiliyor, gereksiz.
- **Workspace ata dizini:** Eklemek workspace'i kendi sandbox'ına katar ve
  diğer agent home'larını da açar — izolasyonu çökertir.
- **Symlink ile bypass:** Bir symlink yukarıdaki iki kuralı atlatmak için
  kullanılabilir; realpath ile çözüp aynı kontrolleri tekrar uygulamak şart.
- **Sistem kökleri ve `$HOME`:** `/`, `/System`, `/etc`, `/usr`, `/bin`,
  `/sbin`, `/var`, `/private`, `$HOME` (Windows için `C:\Windows` vs.) **path
  eşitliği** ile reddedilir. Alt dizinler serbest — `~/Documents/specs` geçer,
  `~` geçmez. Niyet "agent'a tüm makineyi vermeyi" engellemek.

### Data Model

İki seçenek: ayrı tablo (`agent_extra_directories`) ya da `agents` tablosuna
JSON kolon. JSON kolon seçildi. Liste küçük (genelde 1–5 path), per-row
metadata gerekmiyor, agent silinince cascade kolon ile zaten otomatik.
`connectors` zaten aynı paterni kullanıyor (`text({ mode: 'json' })` +
default `[]`) — tutarlılık ve sıfır migration sürprizi.

İleride per-path metadata (mode, addedAt, lastSeenMissing) gerçekten gerekirse
o zaman ayrı tabloya geçilir.

### Adapter Input: Combined or Separate

`agentHomePath` zaten ek bir dizin olarak geçiyor. Kullanıcı `extraDirectories`'i
onunla aynı listede mi, ayrı mı taşınmalı? Ayrı tutuldu. `agentHomePath` sistem
tarafından zorunludur (agent'ın memory/instructions klasörü); `extraDirectories`
kullanıcı verisidir. Tek listede birleştirmek logging, debug ve gelecek
ayrımları (örn. sistem dizinleri için ekstra prompt davranışı) zorlaştırır.
Adapter her ikisini de kendi CLI flag formatına çevirir.

### System Prompt Disclosure

CLI flag agent'a erişim verir ama agent klasörün varlığını bilmezse onu
kullanmaz. Sistem prompt'una "şu external dizinlere read+write erişimin var,
workspace'in parçası değiller" şeklinde bir paragraf eklenir. Token maliyeti
minimaldir; kullanıcı zaten o klasörleri agent'a verdiyse fark edilmesini
ister. Missing path'ler prompt'a yazılmaz — agent var sanmasın.

### UI Surface

İki yerleşim seçildi: agent oluşturma akışına eklemek vs. yalnız agent edit /
settings paneline. Yalnız edit seçildi. Oluşturma akışı zaten uzun ve
ek klasör tanımlamak doğal değil; kullanıcı önce agent'ı tanır, sonra
"buna şu klasörü de açayım" der. Agent'ın kendi ayar panelinde
capabilities/instructions/connectors ile aynı yerde durması mental model'e
oturur. Global Settings ekranı per-agent veri için yanıltıcı.

### Missing Path Runtime Behavior

Koşum sırasında listedeki bir path bulunamazsa: sessizce atla (kullanıcı
sürprizi), durdur (orantısız — external disk geçici unmount'ta agent'ı
kullanılamaz yapar), ya da atla + uyarı. Üçüncüsü seçildi: var olmayanlar
CLI'a hiç geçirilmez, run output'una tek satır "Skipped missing directory:
…" yazılır, agent edit ekranında ilgili path'in yanında "missing" rozeti
kalır. Şeffaflık + kesintisiz çalışma.

### Run-Type Coverage

Üç koşum tipi var: conversation, workboard, schedule. `extraDirectories`
üçünde de uygulanır. "Agent başına kalıcı" kararı zaten her yerde aynı agent
kimliğini ifade ediyor; aynı agent'ı schedule'a koyunca farklı dosya
erişimi olması mantıksız ve sürpriz olur.

### IPC Shape

Renderer'in iki ihtiyacı: klasör seçtirme ve agent CRUD'unda alanı taşıma.
İkincisi mevcut `updateAgent` handler'ına alan ve Zod şema eklemekle çözülür.
Birincisi için generic `dialog.selectDirectory()` + ayrı `validateExtraDirectory`
yerine domain-spesifik `agents.addExtraDirectory(agentId)` IPC seçildi: tek
çağrıda picker açılır, doğrulama çalışır, DB'ye yazılır, güncel liste döner.
Doğrulama mantığı (workspace ata kontrolü, deny-list, realpath) main process
bilgisidir — ikiye dağıtmak güvenlik mantığını sulandırır.

## Decision

Introduce **per-agent extra directories**: persistent, per-agent list of
absolute paths the agent CLI gets read+write access to, in addition to the
workspace root and the agent home.

### Data Model

Add to `agents` table:

```ts
extraDirectories: text('extra_directories', { mode: 'json' })
  .$type<string[]>()
  .notNull()
  .default([])
```

Migration produced via standard Drizzle generate, schema version bumped to 27.
Existing agents default to `[]` — fully backward compatible.

### Validation (at add-time)

A path is rejected if any of the following hold, after symlink realpath:

- Empty, contains null bytes, or is not absolute.
- Does not exist or is not a directory.
- Equals or is an ancestor of the workspace root.
- Equals or is a descendant of the workspace root.
- Equals `/`, `/System`, `/etc`, `/usr`, `/bin`, `/sbin`, `/var`, `/private`,
  `$HOME`, or platform-equivalent system roots. (Subdirectories of these are
  permitted; only direct equality is blocked.)

Each rejection returns a distinct error code so UI shows a specific reason.

### Validation (at run-time)

The runtime service re-resolves each path before invoking the adapter:

- Missing paths are dropped from the list passed to the CLI.
- A `Skipped missing directory: <path>` line is emitted into the run output.
- The persisted list is **not** mutated by runtime — the path may reappear
  when the external disk is reattached.

### Adapter Input

A new `extraDirectories: string[]` field is added to the runtime input passed
to all three adapters. It is **separate** from `agentHomePath` (which remains
unchanged). The service builds this list by reading the agent record,
re-validating each entry, and passing only the survivors.

Per-adapter translation:

- Claude, Codex: each entry becomes a separate `--add-dir <path>` pair.
- Gemini: all entries comma-joined and appended to `--include-directories`
  alongside `agentHomePath`.

### System Prompt

`prompts/workspace.ts` gains an "External directories" section appended after
the working-folder block, listing only the surviving paths and stating they
are read+write but not part of the workspace.

### UI

In the agent edit / settings panel, a new "Extra Directories" section:

- "Add folder" button opens native directory picker via the
  `agents.addExtraDirectory(agentId)` IPC.
- Each entry shows its absolute path, a "missing" badge if the path doesn't
  resolve at render time, and a "Remove" action.
- Validation errors from the IPC show inline with a specific message
  (workspace overlap, deny-listed, not found, etc.).

Not exposed in the agent creation flow.

### IPC

Three handlers:

- `agents.addExtraDirectory(agentId)` — opens picker, validates, persists,
  returns updated list or typed error.
- `agents.removeExtraDirectory(agentId, path)` — persists removal.
- `agents.listExtraDirectories(agentId)` — returns list with per-path
  `exists` flag for missing-badge rendering.

Existing `updateAgent` is **not** the path for mutation — the dedicated
handlers own validation; `updateAgent` will reject changes to this field if
sent through it.

### Run-Type Coverage

The service reads `agents.extraDirectories` uniformly for all three runtime
entry points (conversation, workboard, schedule). No per-runtime override.

### Artifact Reporting (ADR-008 Interaction)

Files written by the agent into extra directories are **not workspace
artifacts**. Consistent with ADR-008's rule that only workspace-relative paths
appear in `artifactRefs` and `changedFiles`, writes into extra directories
must not be reported through those channels. Extra directories are treated
like agent-owned support directories for reporting purposes: outside the
workspace, outside the artifact surface. The system prompt's "External
directories" section makes this explicit so the agent does not attempt to
report extra-directory paths as artifacts.

## Consequences

The single-mode read+write choice keeps the user's mental model honest: every
folder added is a folder the agent can write to. UI never claims a protection
the CLI doesn't enforce.

Lazy validation makes the feature usable in real desktop conditions (external
drives, network shares) at the cost of a runtime drop step. The
"missing" badge and run-output warning together prevent the silent-skip
failure mode where the agent appears to ignore a configured folder.

Path constraints (workspace ancestor/descendant, deny-list, realpath) push
back on the most common foot-guns without policing legitimate use. A user
who genuinely wants to give an agent their entire `$HOME` can pick a
subdirectory; this is a small friction for an outcome the user almost
certainly does not want by default.

Separating `agentHomePath` from `extraDirectories` in the adapter input
preserves the system-vs-user distinction for future divergence (e.g., if
agent home ever needs different prompt treatment or different sandbox
semantics, the code paths are already split).

Per-agent cascade is automatic via the JSON column — agent deletion drops
the list with the row. No new lifecycle coupling to reason about.

## Out of Scope

The following were considered and explicitly deferred:

- Read-only directories (provider CLIs don't enforce; would need OS-level
  sandboxing).
- Per-run override or per-run additions.
- Per-workspace shared lists.
- Glob patterns or exclusion rules within a directory.
- Watcher-driven invalidation of cached path validity.
- OS-level sandbox (sandbox-exec, bind-mounts) — separate, future work.
