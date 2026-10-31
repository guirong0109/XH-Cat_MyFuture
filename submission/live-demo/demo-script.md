# Demo script: 10 minutes (pitch + live demo)

- **Presenter A** talks (pitch, the "why" of each stage, the close).
- **Presenter B** drives the laptop and reads the labels on screen.
- Over time costs 1 point per 30 s. Stop at 10:00 even mid-sentence. Use the short version if the demo starts late.
- Labels in **bold** are the exact words on screen (`shared/strings/en.js`).
- All checked on a local copy of `main` on 1 Nov 2026 with the Aina CV and no AI key. On the live site DeepSeek also
  reads the CV, so a few extra items tagged **Found by AI — check it** or **AI suggests … Check it** may appear.
  Press **Keep** only on ones that are right.

## Set-up before the pitch (see `preflight-checklist.md`)

- **Window 1 (main demo):** Chrome incognito on https://futures.grong.my, landing page, nothing built yet.
- **Window 2 (backup):** Window-1 flow already finished with Aina (profile confirmed), in case the upload is slow.
- Demo CV on the desktop: `Demo_CV_Aina_synthetic.docx`.

## Timed script

| Time | Stage | Who | What |
|---|---|---|---|
| 0:00-1:00 | Opening | A | Problem and promise |
| 1:00-2:45 | 1 Tell us about yourself | B (A narrates) | CV upload, confirm |
| 2:45-3:45 | 2 Future Skills Radar | B | For You, research trends, job-ad groups, news |
| 3:45-5:30 | 3 Get matched | B | Score, reasons, gap |
| 5:30-6:45 | 4 Follow a pathway | B | Ordered steps, real courses |
| 6:45-7:30 | 5 SDG contribution | B | SDG tags and filter |
| 7:30-9:00 | 6 Compare futures | B | Moderate AI vs Rapid AI: a change in the data moves roles |
| 9:00-9:40 | Close | A | Trust, cost, next steps |
| 9:40-10:00 | Buffer | | |

### 0:00-1:00 Opening (Presenter A)

- "Youth unemployment in Malaysia was 10.2% in June 2026 (OpenDOSM). Young people cannot see which jobs fit their
  skills, what is missing, or how AI changes that work."
- "FutureReady MY turns a CV into explainable career matches, a view of AI change, and a study plan of real courses.
  Every number shows its source on screen. Matching uses no language model: it is plain arithmetic on official data."
- "Meet Aina, a made-up IT support executive with a diploma. Let's follow her."

### 1:00-2:45 Stage 1: Tell us about yourself

Presenter B, Window 1:
1. **Get started** → **For myself** → **Continue as guest**. Point at "No sign-up. Saved in this browser only. Your
   CV file is never kept here."
2. **What is your goal?** → **Find a direction**.
3. **Upload my CV** → drag `Demo_CV_Aina_synthetic.docx`. Point at "Your CV is read by DeepSeek AI (stored in China)
   to improve accuracy. You check everything before it is saved." Wait text says it can take up to 40 seconds.
4. The receipt shows **READY FOR REVIEW · UNVERIFIED UNTIL YOU CONFIRM**: Diploma · Information Technology, IT Support
   Executive · Acme Sdn Bhd, five skills. Press **Edit in the form**.
5. Education: point at **From your CV · please check** with the CV quote. **Next →**.
6. Skills and Proficiency: the job card and the project card **Sales dashboard**, each with its CV quote ("As
   written: ..."). Microsoft Excel and Python start at **GOOD** ("A skill used in a job or project starts at Good").
   Point at "✓ in the O\*NET skill list ... · ? not in it: kept, not used for matching" (Customer service is kept
   but not used: nothing is guessed). **Next →**.
7. Using AI: answer the four questions **Yes, Yes, Yes, No**. Point at "Questions based on the four parts of the
   UNESCO AI competency framework for students (2024)". **Next →**.
8. Interests → **Review and confirm →** → every item says **UNVERIFIED** → **Confirm my profile**.

Must-have to say (A): "Nothing is pre-filled. The CV only suggests; Aina confirms every item before anything uses it."

If the upload fails or takes over 40 s: the rules draft still comes with "AI reading was not available this time;
please check carefully." Carry on, or switch to Window 2.

### 2:45-3:45 Stage 2: Future Skills Radar

Window 1:
1. Tab **FUTURE SKILLS RADAR**. On the AI-use question press **Skip for now** (or tick two boxes and **Continue**).
2. **FOR YOU:** "How AI is used in your jobs' tasks". Point at a dot list, e.g. "Provide users with technical support
   for computer problems. AI does it 59.69% · AI helps 40.31%" and the source line "Anthropic Economic Index
   release_2026_06_26 · April-May 2026". Point at the ILO line "Generative AI exposure ... ILO Working Paper 140".
3. **EXPLORE ALL TRENDS:** "Research momentum by AI topic". Point at the **RISING** / **STABLE** labels (e.g.
   Computer Vision STABLE, 453 → 419 papers) and "Source: OpenAlex ... Fetched 2026-10-30 07:33 UTC".
4. Scroll to **AI news by field**: each list names DeepSeek Search, the update time and the next refresh (every 3 hours).
5. At the bottom, the OpenAlex source card with its fetch date.

Say (A): "Every trend is an official dataset with its source and date on screen. The DOSM job-ad trend (2026 Q2) sets
the groups in Career matching. When DOSM publishes a new quarter, the trend is recalculated by the same rule and roles
move between groups. The Skill Match never moves because of a trend. You will see that live in stage 6."

### 3:45-5:30 Stage 3: Get matched

Window 1, tab **CAREER MATCHING**:
1. Point at the lead: "The Skill Match counts how many of the levels a job needs you already meet. ... AI supports
   your choice; it never decides for you."
2. **In your field** lists roles in four groups. Pick **Service Desk Specialist (MASCO 2511-09)** (it fits IT
   support). Point at:
   - **Skill Match PROVISIONAL** and the sentence "You meet 7.9 of 103.9 needed levels for Computer Systems Analysts,
     so fit is 8%." · **CALCULATED from O\*NET levels and your profile**
   - **AI touches this job 68%** · **ESTIMATE** (Anthropic Economic Index)
   - **Overall match** (now filled in, because Aina answered the AI questions)
3. **Show outlook and details** → Job ads, AI in this job, **Software asked** ("You have 2 of 311 · 10 in demand":
   ✓ Microsoft Excel, ✓ Python).
4. **Why this match?** → the chart You vs Needed, then **What would raise it**: "Learn Computers and Electronics to
   expert +6 PTS", "Learn Reading Comprehension to expert +4 PTS", "Learn Active Listening to good +4 PTS".
   Then "How this role reaches O\*NET": the official code chain eMASCO → ISCO-08 → SOC → O\*NET.
5. Tick **Plan my study pathway** on this card. Press **Plan study pathway (1 role) →** at the bottom.

Say (A): "8% is low and honest: only two of Aina's CV skills are O\*NET skills. Python and Excel count under
Software asked, not in the %. The screen tells her exactly what raises it." (8% and 7.9 of 103.9 are from the local
run; live may differ if Aina keeps an AI-suggested skill.)

### 5:30-6:45 Stage 4: Follow a pathway

Tab **STUDY PATHWAY**:
1. Point at the lead: "Every course is a real page on its own website; the team picked them and the owner reviews them."
2. **Part 1 · Study route**: **Usual education level** from eMASCO; **Fields of study that lead here** (SOURCED) with
   **ACCREDITED MALAYSIAN PROGRAMMES** and MQA references.
3. **Part 2 · Skills to build**: numbered 1, 2, 3 ..., biggest gap first. Each step shows the course, e.g.
   **e-LATiH (HRD Corp)** "Working with Computers and Devices with Microsoft ↗ · checked 2026-10-31", and
   **+10 points of Skill Match**. Press **Started** on step 1.
4. "More on e-LATiH (HRD Corp) ↗ · Coursera ↗ · edX ↗ · Khan Academy ↗ · Microsoft Learn ↗ · Google Skills ↗".

Say (A), honestly: "We show the order and the size of each step in Skill Match points. We do not show hours: no
course in our data has a sourced duration, and we will not invent one."

### 6:45-7:30 Stage 5: SDG contribution

Back to **CAREER MATCHING**:
1. Every role card has an **SDG** tag (e.g. "SDG 9 team draft, not yet reviewed"); it links to the UN goal page. The
   reason shows when you point at the tag.
2. **Show roles linked to** → pick **SDG 4** or **SDG 8**: the list filters.
3. In **What would raise it**, each skill carries its own SDG target: **SDG 9.C**, **SDG 4.6**, **SDG 3.4**.

Say (A): "Every link has a reason and is labelled team draft until the owner approves it. We count links; we never
claim a score for impact." (Do not promise a path-contribution panel: it was removed on 1 Nov.)

### 7:30-9:00 Stage 6: Compare futures

Same screen, **AI scenario ESTIMATE**:
1. Point at the Service Desk Specialist card: its group, Skill Match 8%, AI touch and Overall match under **Moderate AI**.
2. Press **Rapid AI** ("full potential exposure"). Banner: "Switching to Rapid AI moved 376 roles from 'AI may change
   much of this job (this scenario)' (group 2) to 'Not enough evidence yet' (group 4); 72 roles from ... Skill Match
   numbers did not change." (Local counts; live may differ.)
3. The AI line changes from "AI use seen on 68.2% ..." (Anthropic) to "GenAI exposure 49% · ILO group 2 of 4 (ILO WP140)".
   The Overall match changes; the Skill Match stays the same.
4. Press **Moderate AI** to go back.

Say (A): "Two futures: AI as used today, and AI at full potential. Both are labelled ESTIMATE, both name their source.
This is what any change in the trend data does: the AI signal changed, roles moved between groups and the Overall
match changed, but the Skill Match did not. A new DOSM quarter or a new AI dataset works the same way."

### 9:00-9:40 Close (Presenter A)

- "Everything you saw names its source and date. Nothing is invented: a broken code chain says 'not available'."
- "Running cost: hosting is free through Cloudflare; AI news about US$4-6 a month; CV reading about US$0.0003 per CV."
- "Next: a pilot with 20 students, live HRD Corp and MQA feeds, and a PDPA review before real CVs."

## 3-minute short version

| Time | Who | What |
|---|---|---|
| 0:00-0:20 | A | Problem (10.2% youth unemployment, OpenDOSM) and promise (sources on screen, no AI in matching) |
| 0:20-1:00 | B | Window 2 (profile done): show the confirmed profile, every item came from the CV and was confirmed |
| 1:00-1:40 | B | **CAREER MATCHING**: one card, "You meet ... so fit is ...%", **Why this match?** → **What would raise it** |
| 1:40-2:10 | B | Press **Rapid AI**, read the banner: roles move group, Skill Match numbers did not change |
| 2:10-2:40 | B | **STUDY PATHWAY**: step 1, e-LATiH (HRD Corp) course, "+N points of Skill Match"; SDG tag on the card |
| 2:40-3:00 | A | Close: sources, cost, next steps |
