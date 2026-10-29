# Model Eval — L3 semantic match

**Not run yet** (29 Oct 2026). The RunPod embedding endpoint is created only after the project owner approves its price.
Until then L3 is skipped and every CV extraction answers with the warning `semantic_unavailable`.

When the endpoint exists: set `SEMANTIC_URL`, `SEMANTIC_KEY` and `SEMANTIC_MODEL` (see `.env.example`), run
`node scripts/model-eval.mjs`, and this file is replaced with precision, recall and median latency per cutoff
(0.60–0.90) on the 61 labelled terms in `testing/model-eval-set.json`. The chosen cutoff is the lowest with
precision ≥ 0.90; `SEMANTIC_CUTOFF` is set to it.
