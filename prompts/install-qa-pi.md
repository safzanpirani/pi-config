---
description: Set up Pi-native automated QA for this repo (delegates to /skill:install-qa)
argument-hint: "[notes for the installer]"
---
Use the `install-qa` skill to set up Pi-native automated QA for this repository. The skill walks 5 phases: resume-or-fresh check, codebase auto-detection, targeted questionnaire, file generation (`.pi/skills/qa/`, per-app sub-skills, optional `.github/workflows/pi-qa.yml`), and verification.

User notes / arguments (pass through to the skill):

```text
$ARGUMENTS
```

Begin by reading `~/.agents/skills/install-qa/SKILL.md` and following its phases. Helpful starting move: run `bash ~/.agents/skills/install-qa/scripts/detect.sh` for a fast first-pass detection summary, then verify against the actual codebase before asking any Phase 3 questions.
