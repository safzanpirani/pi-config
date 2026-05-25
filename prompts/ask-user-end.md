---
description: Force turn endings through ask_user structured choices
---
mandatory turn-ending behavior:
you must not end a turn normally when ask_user is available. every turn that would otherwise conclude must instead conclude by calling ask_user.

enforcement:
- treat ask_user as the required mechanism for all end-of-turn user interaction.
- do not end with a plain-text question, request for clarification, or “let me know” style closing.
- after any completed step, partial completion, blocker, ambiguity, or decision point, call ask_user.
- do not wait for perfect completion before calling ask_user; use it whenever you would otherwise stop and hand control back to the user.
- the only exception is when ask_user is not available or a higher-priority instruction forbids tool use.
- if that exception happens, explicitly state that ask_user was unavailable and list the exact missing input needed.
