# English enrichment data

These files are vendored to make CEFR lookup deterministic and offline.

- `cefrj-vocabulary-profile-1.5.csv`: CEFR-J Vocabulary Profile v1.5, compiled by Yukio Tono / Tokyo University of Foreign Studies.
- `octanove-vocabulary-profile-c1c2-1.0.csv`: Octanove Vocabulary Profile C1/C2 v1.0.

Upstream: https://github.com/openlanguageprofiles/olp-en-cefrj
Pinned upstream commit: d4e45b75b38f27b30dfc5c44d8c571aec7e7092f

CEFR-J data may be used for research and commercial purposes without charge with proper citation, according to the upstream README. The Octanove C1/C2 data is CC BY-SA 4.0.

Runtime source priority for English autofill is documented in the server code: local MinhQND dictionary first, these local CEFR profiles and deterministic morphology next, Datamuse for lexical relations/collocations, then optional AI only for fields still missing.
