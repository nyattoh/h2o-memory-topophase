# Towards a New AI Memory Architecture: An Auditable Separation of Epistemic Formation and Storage

**新しいAI記憶アーキテクチャに向けて：認識形成と保存を分離する監査可能な構造**

Ryoko Sakakibara
Independent Researcher
ORCID: 0009-0009-9544-6315
Version: 0.2.0-alpha
2 September 2026

## Abstract

AI memory commonly begins after experience has already been flattened into text, summaries, vectors, or graph nodes. This report asks a different question: what would an AI memory architecture look like if pre-transcription observations, the later assembly of weak fragments, and the formation of an explicit insight were separately represented and auditable? H2O Memory TopoPhase is a deterministic TypeScript reference prototype for that question. It treats typed observations and versioned events as the source of record; text, summaries, vectors, graphs, tokens, and search indices are replaceable derived views. It also separates an epistemic axis (`dispersed`, `assembling`, `crystallized`) from a storage axis (`hot`, `warm`, `cold`).

This release implements three bounded mechanisms. Stage A preserves synthetic time-aligned speech candidates, prosody, pauses, overlap, and gestures before transcription, without inferring emotion or intention. Stage B lets a new typed cue assemble old canonical fragments without a recency cut-off and keeps contradiction evidence as a protected candidate. Stage C detects one abrupt, fixed-metric crossing in support density and prediction error, records its timing, and attaches counterevidence to the resulting insight candidate. The complete offline suite contains 92 deterministic tests and requires no language model, embedding service, vector database, network connection, or paid API.

The implementation is deliberately incomplete. It does not learn which memories to assemble or when to crystallise, does not process media bytes, and is not integrated into model computation. A fixed v0.8 contract-ablation benchmark also returns `FAIL`, so the present work does not establish a jointly necessary mechanism, novelty, superiority, or general resource reduction. The contribution is therefore a falsifiable architectural boundary and an inspectable baseline from which learned control, model-internal memory, and a synthetic epistemic-safety simulator can be tested next.

## 日本語要旨

多くのAI記憶は、経験が既に文章、要約、ベクトル、又はグラフ節点へ平坦化された後から始まる。本報告は、文章化前の観測、時間を隔てた弱い断片の集合、そして明示的な気づきの形成を、別々に表現し監査できるAI記憶構造を検討する。H2O Memory TopoPhaseは、この問いを反証可能にする決定論的TypeScript参照実装である。型付き観測と版管理された出来事を正本とし、文章、要約、ベクトル、グラフ、トークン、検索索引を交換可能な派生表現として扱う。また、認識形成の状態（`dispersed`、`assembling`、`crystallized`）と保存配置（`hot`、`warm`、`cold`）を分離する。

今回の公開範囲は三つである。Stage Aは、合成された発話候補、語気、沈黙、間、発話の重なり、身振りを、感情や意図へ断定せず文章化前の観測として保持する。Stage Bは、新しい型付き手掛かりによって、昔の弱い断片を新近性の上限なしに集合し、矛盾する証拠も保護する。Stage Cは、支持密度の上昇と予測誤差の低下が固定条件を同時に越えた時点を「急な結晶化」の測定候補として記録し、反証候補を洞察へ結び付ける。92件の決定論的試験は、外部AI、埋め込みサービス、ベクトルDB、通信、有料APIを必要としない。

ただし、どの記憶を集め、いつ結晶化するかをAI自身が学ぶ機構、媒体バイトの処理、AI本体への組込みは未実装である。固定済みv0.8契約除去試験も総合`FAIL`であり、現段階では機構の共同必要性、新規性、優越性、一般的な資源削減を示さない。本報告の貢献は、次期の学習制御、モデル内部記憶、及び合成データによる認識形成安全性シミュレータを比較可能にする、監査可能な基準線である。

## 1. Research question

The project began from a representational problem rather than a retrieval problem. A pause, a change in voice level, overlapping turns, a gesture, a recogniser alternative, and a later user correction can occur together but are usually converted early into one text sequence. Once that conversion becomes the source of record, later retrieval cannot reliably recover what was discarded or distinguish observation from interpretation.

TopoPhase therefore asks whether an AI can form memory through three explicit transitions:

1. retain heterogeneous observations without forcing them into a transcript;
2. allow a later cue to assemble previously dispersed fragments while preserving contradiction and provenance;
3. form an inspectable insight candidate when the evidence configuration changes, without presenting that candidate as established truth.

This is not a claim that physical phase transitions occur in software. The phase terminology is an operational hypothesis about epistemic formation. Likewise, the term topology is not used here to claim a mathematical topological invariant.

## 2. Architectural contract

### 2.1 Canonical observations and derived views

The source of record is a stable, versioned observation or event. A canonical observation records its identity, occurrence time or interval, temporal validity, speaker or observer provenance, consent scope, uncertainty, typed payload, and correction or deletion state. An optional opaque source-material reference contains a locator, media type, and SHA-256 digest; the prototype does not ingest the original media bytes.

Text, summaries, vectors, graphs, tokens, and search indices are derived views. Each view records the source versions from which it was produced and declares representation loss. Correction, forgetting, consent withdrawal, or a source-version change can make a derived view unusable. The vector view is intentionally a non-computed stub; vectors are not the memory source.

### 2.2 Independent axes

The architecture represents two independent axes:

| Axis | States | Meaning |
| --- | --- | --- |
| `epistemic_phase` | `dispersed`, `assembling`, `crystallized` | How fragments participate in an unresolved grouping or an explicit insight candidate |
| `storage_tier` | `hot`, `warm`, `cold` | Where a representation is placed for resource purposes |

A phase operation must not silently change storage placement, and a tier operation must not change epistemic status. A cold record is not necessarily unimportant, weak, or false. In this prototype, `cold` is only an in-process mock and does not reduce physical memory.

### 2.3 Governance and audit

The engine uses append-only operations for observation, relation, assembly, crystallisation, correction, rejection, consent withdrawal, forgetting, reopening, restoration, and tracing. Mutations are applied to a draft state and committed only after invariant checks succeed. Public reads apply one policy for consent, temporal validity, current version, deletion, rejection, and cold placement. A trace is usable for re-presentation only when `present` consent exists; search permission alone is insufficient.

The invariant catalogue covers identity, provenance, temporal validity, correction lineage, deletion and consent, uncertainty, simultaneity and ordering, declared representation loss, and restoration versus re-presentation.

## 3. Implemented stages

### 3.1 Stage A - observations before transcription

Stage A accepts already measured synthetic observations. Payload kinds include speech candidates, pauses, overlap, prosody, gestures, structured data, and other closed measurements. A synchrony group and sequence index preserve aligned observations without turning them into a single sentence. The adapter adds explicit simultaneity relations and returns the time-aligned canonical timeline.

The separation between observation and interpretation is strict. For example, a measured reduction in voice level can be stored as prosody, but sadness cannot be stored as a user self-report unless the user actually reported it. An AI interpretation must be a separate `system_inference` record with its own provenance and uncertainty.

Stage A does not recognise audio or video, and it does not claim accessibility benefit. Its contribution is the schema and policy boundary needed to prevent the transcript from becoming the sole source of record.

### 3.2 Stage B - delayed-cue associative assembly

Stage B is invoked when a new canonical cue arrives. The controller traverses pre-existing typed `cue` relations without a recency cut-off, filters records by current validity and assembly consent, and selects eligible old observations. Directly linked contradiction observations are then included as protected candidates rather than suppressed as inconvenient evidence.

Two simple controls are provided: a recent-window baseline and a lexical-overlap baseline. The fixed synthetic case demonstrates a condition in which typed relations recover old fragments that the recent window omits and lexical overlap does not find. This is a mechanism test, not evidence about real conversational retrieval quality.

The controller does not learn representations or relations. Its scores and minimum-member rule are fixed. It therefore establishes only the interface and observable decision record for a future learned selector.

### 3.3 Stage C - sudden crystallisation metric

Stage C receives a time-ordered series of synthetic samples. Each sample declares evidence identifiers, support density, and prediction error. A candidate crystallises only after a previous sample exists and four fixed conditions hold: minimum evidence count, minimum support density, minimum density increase, and minimum prediction-error decrease.

The resulting insight records the formation time, density, density delta, prediction error, and error drop. Contradiction and potential-falsifier neighbours are pinned as counterevidence. A timing evaluator distinguishes premature, late, missed, and on-time detection. Corrections to supporting evidence invalidate the candidate through the existing governance contract.

This is not a model of human realisation. The measurements are supplied by fixtures, and the thresholds do not learn. The implemented distinction is between gradual accumulation and one abrupt metric crossing in an artificial system.

## 4. Verification

The release gate runs TypeScript type checking, 92 deterministic tests, a production build, and a demonstration. Tests cover the original governance engine and the three new stages. They include positive cases and deliberate failures for inferred emotion, ordering errors, consent and correction propagation, stale derived views, contradiction loss, premature crystallisation, and failed transactional mutation.

All core tests run offline. There is no dependency on a language model, embedding provider, vector database, browser, cloud service, or paid API. The public demonstration exercises `OBSERVE`, `ASSEMBLE`, `CRYSTALLIZE`, and `TRACE` and returns an auditable insight with two evidence items.

## 5. Fixed v0.8 contract-ablation result

A separate fixed v0.8 benchmark tested whether three architectural constraints were jointly necessary across ten contract cases and six ordinary positive controls. The complete condition passed 10/10 contracts and 6/6 controls. Removing derived-view subordination passed 8/10 contracts and all controls. Coupling phase and storage passed 7/10 contracts but only 5/6 controls and was therefore inadmissible. Delaying governance passed 7/10 contracts and all controls. Under the preregistered machine rule, the overall result is `FAIL`.

The strongest defensible conclusion is narrow: the implementation can expose contract failures when selected constraints are removed, but this benchmark does not establish that the three constraints are jointly necessary. It also does not establish novelty, superiority, general utility, retrieval quality, multimodal benefit, accessibility benefit, or reductions in tokens, latency, physical memory, cost, or energy.

## 6. Relation to nearby work

CogniFold describes fragmented event streams that fold into self-emerging structures, including assembly, merging, decay, relinking, and density-threshold crystallisation of intent nodes. This makes dispersed-fragment assembly and crystallisation a close comparison rather than an H2O-specific novelty claim. H2O's current differentiating hypotheses are its explicit separation of epistemic phase and storage tier, typed pre-transcription observations, and machine-checked correction, refusal, consent, deletion, and re-presentation contracts. These remain hypotheses until direct comparative experiments are performed.

Mela proposes test-time consolidation with high-frequency detailed memory, low-frequency gist memory, and dynamic reconstruction. It is relevant to qualitatively different representations and reconstruction, while H2O presently concentrates on canonical provenance and audited formation state rather than learned consolidation.

MRAgent reconstructs memory through a Cue-Tag-Content graph and multi-step exploration. It is relevant to reconstructive recall, whereas the present Stage B is only a fixed formation-time assembly baseline with typed relations. LongMemEval supplies 500 long-term memory questions covering extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention; it remains an evaluation reference, not evidence for the present A-C mechanisms.

## 7. Limitations and safety boundary

The engine is in-memory, single-threaded, and tested only on small synthetic fixtures. Its cold tier remains in the same process. It has no durable log, crash recovery, learned controller, real recogniser, media store, model-internal state, scale measurement, or end-to-end resource measurement. Independent review is incomplete.

The prototype is not a medical, therapeutic, diagnostic, or clinical system. Prematurely combining ambiguous fragments into a confident narrative can be harmful. A future safety experiment may use neutral fictional data to measure provenance confusion, confirmation-biased retrieval, premature crystallisation, lost counterevidence, and failed correction or refusal propagation. Such an experiment would simulate failure modes of an artificial epistemic system, not dementia, schizophrenia, psychosis, or a person's subjective experience.

## 8. Next phase

The next research phase is deliberately separated from this release:

1. **Learned assembly and crystallisation control.** Train or optimise a controller to decide which memories to gather and when to crystallise, then compare it with the fixed Stage B and C baselines.
2. **Model-internal memory.** Replace prompt-level external re-presentation with memory state that participates directly in model computation, while retaining audit and governance boundaries.
3. **Synthetic epistemic-safety simulator.** Test whether source confusion, confirmation-biased selection, excessive agreement, premature crystallisation, or failed correction propagation stabilises false conclusions, using only neutral fictional scenarios at first.
4. **Direct comparisons.** Compare against simple recent-window and lexical controls, CogniFold-style folding, reconstructive graph memory, and relevant learned memory baselines under separate semantic and resource measurements.

Stage A-C is frozen as the current reproducible boundary. Completing the next phase must not retroactively change the fixed v0.5-v0.8 artefacts, thresholds, exclusions, or preregistered rules.

## 9. Reproducibility

- Repository: https://github.com/nyattoh/h2o-memory-topophase
- Software archive: https://doi.org/10.5281/zenodo.22212460
- Prior physical-memory technical note: https://doi.org/10.5281/zenodo.22212823

Required runtime: Node.js 22 or later and npm.

```text
npm install
npm test
npm run typecheck
npm run build
npm run demo
```

The release source is licensed under Apache-2.0. This technical report is licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).

## References

1. CogniFold: Always-On Proactive Memory via Cognitive Folding. arXiv:2605.13438. https://arxiv.org/abs/2605.13438
2. Mela: Test-Time Memory Consolidation based on Transformation Hypothesis. arXiv:2605.10537. https://arxiv.org/abs/2605.10537
3. Memory is Reconstructed, Not Retrieved: Graph Memory for LLM Agents. arXiv:2606.06036. https://arxiv.org/abs/2606.06036
4. LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory. arXiv:2410.10813. https://arxiv.org/abs/2410.10813
5. Sakakibara, R. H2O Memory: TopoPhase Reference Prototype, v0.1.0-alpha. Zenodo. https://doi.org/10.5281/zenodo.22212460
6. Sakakibara, R. 本測定では外部記憶の論理量と仮想機械内メモリ高水位が一致しなかった. Zenodo. https://doi.org/10.5281/zenodo.22212823

## Declarations

Author: Ryoko Sakakibara, Independent Researcher.
ORCID: 0009-0009-9544-6315.
Funding: No external funding is declared for this release.
Competing interests: No competing interests are declared.
Use of AI tools: AI coding and language tools assisted implementation, checking, and drafting under author direction. All public claims, fixed measurements, release decisions, and responsibility for the report remain with the author.
